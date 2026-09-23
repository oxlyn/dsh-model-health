// DSH 设置配置的读取与解析（多来源兼容 + mtime 缓存）。
//
// 版本差异：DSH 0.1.7-alpha.2 之前，所有设置集中在 $DSH_HOME/settings.yaml，
// 顶层 section 以插件 entry id 命名（llm-pi-ai / llm-deepseek 等）。
// 0.1.7-alpha.2 起，settings.yaml 仅作为一次性遗留导入源：启动时被改名为
// settings.yaml.imported，并逐 section 写回当前 profile 的 cordis.patch.yml
// （形如 `- id: <entry> / config: {...}` 的 YAML 序列）。
//
// 因此这里按优先级读取多个候选来源，后出现的来源覆盖前面的同名 section：
//   1. $DSH_HOME/settings.yaml           （老版本 / 新版本迁移前）
//   2. $DSH_HOME/settings.yaml.imported  （新版本迁移后遗留的旧文件）
//   3. $DSH_HOME/cordis.patch.yml        （新版本 home 级用户补丁层）
//   4. <profile.dir>/cordis.yml          （新版本 profile 根配置，通常为空）
//   5. <profile.dir>/cordis.patch.yml    （新版本 profile 补丁，迁移落点）

import { existsSync, readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_SCHEMA, Schema, Type, load as parseYaml } from 'js-yaml'

/** 插件只关心的模型配置 section / entry id。 */
export const MODEL_SECTIONS = new Set(['llm-pi-ai', 'llm-deepseek'])

/** 解析 DSH 配置目录：优先 $DSH_HOME，回退到 ~/.dsh。 */
export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

// profile patch 可能含 `!!js` 表达式（如 disabled: !!js '!ctx.get(...)'），
// 默认 schema 遇到未知 tag 会抛错；注册一个宽松的 !!js 标量（按字符串处理）。
// 显式带上 DEFAULT_SCHEMA 的 implicit/explicit，保持其余解析行为不变。
// （类型声明未暴露这两个数组，运行时确实存在，故做结构性断言。）
const BaseSchemaTypes = DEFAULT_SCHEMA as unknown as {
  implicit: Type[]
  explicit: Type[]
}
const LooseSchema = new Schema({
  implicit: BaseSchemaTypes.implicit,
  explicit: [
    ...BaseSchemaTypes.explicit,
    new Type('tag:yaml.org,2002:js', {
      kind: 'scalar',
      resolve: () => true,
      construct: (value) => value,
    }),
  ],
})

/** 新版 DSH 注入的 profileContext 服务的最小形态（见 dsh profile-boot）。 */
export interface SettingsProfile {
  /** profile 目录（~/.dsh/profiles/<name>） */
  dir: string
  /** profile 补丁文件（~/.dsh/profiles/<name>/cordis.patch.yml） */
  patchPath: string
}

/**
 * 解析一份设置文件的内容为「模型 section → 配置」映射。
 * 兼容两种文件形态：
 * - 旧版 settings.yaml：顶层 map（llm-pi-ai: {...}）
 * - 新版 profile patch：YAML 序列（- id: llm-pi-ai / config: {...}）
 */
export function parseSettingsContent(raw: string): Record<string, any> {
  const doc = parseYaml(raw, { schema: LooseSchema })
  if (Array.isArray(doc)) {
    // profile patch 形态：只取 id 命中模型入口、且带 config 的条目
    const cfg: Record<string, any> = {}
    for (const entry of doc) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
      if (typeof entry.id !== 'string' || !MODEL_SECTIONS.has(entry.id)) continue
      if (entry.config === undefined || entry.config === null) continue
      cfg[entry.id] = entry.config
    }
    return cfg
  }
  // 旧版 settings.yaml 形态：顶层 section 即 entry id
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return {}
  const cfg: Record<string, any> = {}
  const record = doc as Record<string, any>
  for (const key of MODEL_SECTIONS) {
    if (Object.hasOwn(record, key)) cfg[key] = record[key]
  }
  return cfg
}

/** 返回当前存在的候选设置文件路径（按优先级排列）。 */
export function settingsPaths(profile?: SettingsProfile): string[] {
  const home = dshHome()
  const out: string[] = []
  for (const name of ['settings.yaml', 'settings.yaml.imported']) {
    const p = join(home, name)
    if (existsSync(p)) out.push(p)
  }
  if (profile) {
    for (const p of [
      join(home, 'cordis.patch.yml'),
      join(profile.dir, 'cordis.yml'),
      profile.patchPath,
    ]) {
      if (existsSync(p)) out.push(p)
    }
  }
  return out
}

/** 按文件 mtime 缓存解析结果：同一份文件只解析一次，内容变了自动失效。 */
const fileCache = new Map<string, { mtimeMs: number; cfg: Record<string, any> }>()

/** 按给定候选路径列表读取并合并设置（后出现的来源覆盖前面的同名 section）。 */
export function readSettingsFrom(paths: string[]): Record<string, any> {
  if (paths.length === 0) {
    throw new Error(
      `未找到 DSH 配置文件（已查找：$DSH_HOME/settings.yaml、settings.yaml.imported、` +
      `profile patch）。请在 设置 → 模型 中配置后重试。`,
    )
  }
  const merged: Record<string, any> = {}
  let lastError: Error | null = null
  for (const path of paths) {
    let mtimeMs: number
    try {
      mtimeMs = statSync(path).mtimeMs
    } catch {
      continue // 竞态：文件刚被迁移/改名，跳过该来源
    }
    let cached = fileCache.get(path)
    if (!cached || cached.mtimeMs !== mtimeMs) {
      try {
        cached = { mtimeMs, cfg: parseSettingsContent(readFileSync(path, 'utf8')) }
        fileCache.set(path, cached)
      } catch (e) {
        lastError = new Error(`解析配置失败 (${path})：${(e as Error).message}`)
        continue
      }
    }
    for (const [key, value] of Object.entries(cached.cfg)) merged[key] = value
  }
  // 全部来源都解析失败时才抛错；部分成功则尽力返回已合并结果
  if (lastError && Object.keys(merged).length === 0) throw lastError
  return merged
}

/**
 * 读取当前生效的 DSH 模型配置。
 * @param profile 新版 DSH 的 profileContext（可空，空时按旧版逻辑只读 settings.yaml）
 */
export function readSettingsCached(profile?: SettingsProfile): Record<string, any> {
  return readSettingsFrom(settingsPaths(profile))
}
