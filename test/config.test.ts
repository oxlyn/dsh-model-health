// settings 多来源读取的契约测试：
// - 新旧两种文件形态（settings.yaml 顶层 map / profile patch YAML 序列）的解析
// - 多来源合并优先级（profile patch 覆盖旧文件、缺失 section 由旧文件补齐）
// - 来源缺失 / 解析失败时的行为

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { parseSettingsContent, readSettingsFrom } from '../src/host/config'

describe('parseSettingsContent', () => {
  it('旧版 settings.yaml（顶层 map）：提取模型 section，忽略其他 section', () => {
    const cfg = parseSettingsContent([
      'llm-pi-ai:',
      '  providers:',
      '    a:',
      '      models:',
      '        - id: x',
      'llm-deepseek:',
      '  models:',
      '    - id: deepseek-chat',
      'ui-onboarding:',
      '  welcomeNoticeVersion: 1',
    ].join('\n'))
    expect(Object.keys(cfg).sort()).toEqual(['llm-deepseek', 'llm-pi-ai'])
    expect(cfg['llm-pi-ai'].providers.a.models[0].id).toBe('x')
  })

  it('新版 profile patch（YAML 序列 + !!js 表达式）：提取 id 命中的 entry.config', () => {
    const cfg = parseSettingsContent([
      '- id: llm-pi-ai',
      "  name: '@deepseek-ai/dsh-llm-pi-ai'",
      '  config:',
      '    providers:',
      '      sensenova:',
      '        apiKeyEnv: SENSENOVA_API_KEY',
      '- id: flyout-sidebar',
      "  disabled: !!js '!ctx.get(''profileContext'')'",
      '- id: llm-deepseek',
      '  config:',
      '    models:',
      '      - id: deepseek-v4-flash',
    ].join('\n'))
    expect(cfg['llm-pi-ai'].providers.sensenova.apiKeyEnv).toBe('SENSENOVA_API_KEY')
    expect(cfg['llm-deepseek'].models[0].id).toBe('deepseek-v4-flash')
    expect(cfg['flyout-sidebar']).toBeUndefined()
  })

  it('patch 条目无 config 时跳过；空输入返回空对象；非法 YAML 抛错', () => {
    expect(parseSettingsContent('- id: llm-pi-ai\n  disabled: true\n')).toEqual({})
    expect(parseSettingsContent('')).toEqual({})
    expect(parseSettingsContent('[]')).toEqual({})
    expect(() => parseSettingsContent('llm-pi-ai: [unclosed')).toThrow()
  })
})

describe('readSettingsFrom（多来源合并）', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'dsh-model-health-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const write = (name: string, content: string): string => {
    const p = join(dir, name)
    writeFileSync(p, content)
    return p
  }

  it('settings.yaml + 迁移残留 + profile patch：patch 覆盖旧文件，缺失 section 由旧文件补齐', () => {
    const legacy = write('settings.yaml', [
      'llm-pi-ai:',
      '  providers:',
      '    old-provider:',
      '      models:',
      '        - id: old-model',
      'llm-deepseek:',
      '  models:',
      '    - id: deepseek-chat',
    ].join('\n'))
    const imported = write('settings.yaml.imported', [
      'llm-pi-ai:',
      '  providers:',
      '    legacy-provider:',
      '      models:',
      '        - id: legacy-model',
    ].join('\n'))
    const patch = write('cordis.patch.yml', [
      '- id: llm-pi-ai',
      '  config:',
      '    providers:',
      '      new-provider:',
      '        models:',
      '          - id: new-model',
    ].join('\n'))

    const cfg = readSettingsFrom([legacy, imported, patch])
    // llm-pi-ai 以最后出现的 profile patch 为准（整 section 覆盖）
    expect(cfg['llm-pi-ai'].providers['new-provider']).toBeTruthy()
    expect(cfg['llm-pi-ai'].providers['old-provider']).toBeUndefined()
    // llm-deepseek 只有旧文件有，保留
    expect(cfg['llm-deepseek'].models[0].id).toBe('deepseek-chat')
  })

  it('没有来源时抛可读错误', () => {
    expect(() => readSettingsFrom([])).toThrow(/未找到 DSH 配置文件/)
  })

  it('单个来源解析失败时，尽力返回其余来源的合并结果', () => {
    const bad = write('settings.yaml', 'llm-pi-ai: [unclosed')
    const good = write('cordis.patch.yml', [
      '- id: llm-deepseek',
      '  config:',
      '    models:',
      '      - id: deepseek-chat',
    ].join('\n'))
    const cfg = readSettingsFrom([bad, good])
    expect(cfg['llm-deepseek'].models[0].id).toBe('deepseek-chat')
    expect(cfg['llm-pi-ai']).toBeUndefined()
  })

  it('全部来源都解析失败时抛错', () => {
    const bad = write('settings.yaml', 'llm-pi-ai: [unclosed')
    expect(() => readSettingsFrom([bad])).toThrow(/解析配置失败/)
  })
})
