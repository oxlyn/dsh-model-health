// 宿主 llm 注册表模型收集的契约测试（内置模型显示 + 与文件配置去重）。

import { describe, expect, it } from 'vitest'
import { collectRegistryModels, dedupeRegistryRows, type LlmRuntimeLike } from '../src/host/registry'
import { collectModels, type ModelRow } from '../src/host/models'

function fakeLlm(overrides: Partial<LlmRuntimeLike> = {}): LlmRuntimeLike {
  return {
    listProviders: () => [
      { id: 'deepseek', name: 'DeepSeek' },
      { id: 'sensenova', name: 'sensenova' },
      { id: 'broken', name: 'broken' },
    ],
    listModels: async (provider: string) => {
      if (provider === 'deepseek') {
        return [
          { provider, id: 'deepseek-flash', name: 'DeepSeek-V41-Flash', inputModalities: ['text', 'image'] },
          { provider, id: 'deepseek-v4-pro', name: 'DeepSeek-V4-Pro' },
        ]
      }
      if (provider === 'sensenova') {
        return [{ provider, id: 'glm-5.2', name: 'glm-5.2' }]
      }
      throw new Error('catalog unavailable')
    },
    ...overrides,
  }
}

const fileRows: ModelRow[] = collectModels({
  'llm-pi-ai': {
    providers: {
      sensenova: { models: [{ id: 'glm-5.2' }, { id: 'deepseek-v4-flash' }] },
    },
  },
})

describe('collectRegistryModels', () => {
  it('收集全部注册路由的模型，key 为 provider/modelId', async () => {
    const rows = await collectRegistryModels(fakeLlm())
    expect(rows.map((r) => r.key).sort()).toEqual([
      'deepseek/deepseek-flash',
      'deepseek/deepseek-v4-pro',
      'sensenova/glm-5.2',
    ])
    const ds = rows.find((r) => r.key === 'deepseek/deepseek-flash')!
    expect(ds.displayName).toBe('DeepSeek')
    expect(ds.input).toBe('text/image')
  })

  it('listModels 失败的 provider 被跳过，不影响其余', async () => {
    const rows = await collectRegistryModels(fakeLlm())
    expect(rows.some((r) => r.provider === 'broken')).toBe(false)
    expect(rows.length).toBe(3)
  })

  it('有 resolveModelInfo 时填充上下文窗口/输出上限，无则显示 -', async () => {
    const withInfo = fakeLlm({
      resolveModelInfo: async (provider: string, model: string) => ({
        context: { contextWindow: 1_000_000 },
        defaultMaxTokens: 256_000,
        ...(provider === 'broken' ? {} : {}),
        // deepseek-v4-pro 模拟解析失败路径由调用方 catch
        ...(model === 'deepseek-v4-pro' ? (() => { throw new Error('x') })() : {}),
      }),
    })
    const rows = await collectRegistryModels(withInfo)
    const flash = rows.find((r) => r.key === 'deepseek/deepseek-flash')!
    expect(flash.contextWindow).toBe(1_000_000)
    expect(flash.maxTokens).toBe(256_000)
    const pro = rows.find((r) => r.key === 'deepseek/deepseek-v4-pro')!
    expect(pro.contextWindow).toBe('-')
  })

  it('没有 resolveModelInfo（老版本宿主）时全部显示 -', async () => {
    const rows = await collectRegistryModels(fakeLlm())
    expect(rows.every((r) => r.contextWindow === '-' && r.maxTokens === '-')).toBe(true)
  })
})

describe('dedupeRegistryRows', () => {
  it('按 (provider, modelId) 去掉文件配置里已有的模型，只保留内置补充', async () => {
    const registryRows = await collectRegistryModels(fakeLlm())
    const extra = dedupeRegistryRows(registryRows, fileRows)
    // sensenova/glm-5.2 在文件配置里；deepseek-v4-flash 是文件配置里 pi-ai
    // 路由下的同 id 模型，但 provider 不同（sensenova vs deepseek），保留
    expect(extra.map((r) => r.key).sort()).toEqual([
      'deepseek/deepseek-flash',
      'deepseek/deepseek-v4-pro',
    ])
  })
})
