// settings.yaml 的读取与解析（带 mtime 缓存）。

import { readFileSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'

/** 解析 DSH 配置目录：优先 $DSH_HOME，回退到 ~/.dsh。 */
export function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 读取并解析 settings.yaml。 */
export function readSettings(): Record<string, any> {
  const settingsPath = join(dshHome(), 'settings.yaml')
  let raw: string
  try {
    raw = readFileSync(settingsPath, 'utf8')
  } catch (e) {
    throw new Error(
      `无法读取 settings.yaml (${settingsPath})：${(e as Error).message}。` +
      `请在 设置 → 模型 中配置后重试。`,
    )
  }
  const cfg = parseYaml(raw) as Record<string, any>
  return cfg && typeof cfg === 'object' ? cfg : {}
}

/** 按 mtime 缓存解析结果：并发测试时同一份 settings 只解析一次，文件变了自动失效。 */
let settingsCache: { mtimeMs: number; cfg: Record<string, any> } | null = null

export function readSettingsCached(): Record<string, any> {
  const settingsPath = join(dshHome(), 'settings.yaml')
  try {
    const mtimeMs = statSync(settingsPath).mtimeMs
    if (settingsCache && settingsCache.mtimeMs === mtimeMs) return settingsCache.cfg
    const cfg = readSettings()
    settingsCache = { mtimeMs, cfg }
    return cfg
  } catch {
    settingsCache = null
    return readSettings()
  }
}
