// 宿主 llm 注册表模型收集的契约测试（内置模型显示 + 与文件配置去重）。

import { describe, expect, it } from 'vitest'
import {
  collectRegistryModels,
  dedupeRegistryRows,
  probeRegistryKey,
  probeViaRuntime,
  type LlmRuntimeLike,
} from '../src/host/registry'
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

// ── 内置模型健康探测（走宿主 llm 运行时）─────────────────────────────────

function fakeStream(chunks: Array<Record<string, unknown>> | (() => never)) {
  return async function* (options: { provider: string; model: string; maxTokens?: number }) {
    expect(options.maxTokens).toBe(1)
    expect(options.messages[0].role).toBe('user')
    for (const c of typeof chunks === 'function' ? [] : chunks) yield c
    if (typeof chunks === 'function') chunks()
  }
}

describe('probeViaRuntime', () => {
  it('finish stop → ok，延迟取首个内容块耗时', async () => {
    const llm: LlmRuntimeLike = {
      listProviders: () => [],
      listModels: async () => [],
      stream: fakeStream([
        { type: 'text-delta', text: 'H' },
        { type: 'usage' },
        { type: 'finish', reason: { kind: 'stop' } },
      ]),
    }
    const r = await probeViaRuntime(llm, 'deepseek', 'deepseek-flash')
    expect(r.status).toBe('ok')
    expect(r.latency).toBeGreaterThanOrEqual(0)
    expect(r.error).toBeUndefined()
  })

  it('finish error → fail，错误含 code/HTTP 状态与 failure.message', async () => {
    const llm: LlmRuntimeLike = {
      listProviders: () => [],
      listModels: async () => [],
      stream: fakeStream([
        { type: 'finish', reason: { kind: 'error', failure: { message: 'bad key', code: 'AUTH', status: 401 } } },
      ]),
    }
    const r = await probeViaRuntime(llm, 'deepseek', 'deepseek-flash')
    expect(r.status).toBe('fail')
    expect(r.error).toContain('AUTH')
    expect(r.error).toContain('401')
    expect(r.error).toContain('bad key')
  })

  it('流中抛错 → fail；流无 finish 提前结束 → fail', async () => {
    const throwing: LlmRuntimeLike = {
      listProviders: () => [],
      listModels: async () => [],
      // eslint-disable-next-line require-yield
      stream: async function* () { throw new Error('socket hang up') },
    }
    expect((await probeViaRuntime(throwing, 'p', 'm')).error).toContain('socket hang up')

    const truncated: LlmRuntimeLike = {
      listProviders: () => [],
      listModels: async () => [],
      stream: fakeStream([{ type: 'text-delta', text: 'H' }]),
    }
    const r = await probeViaRuntime(truncated, 'p', 'm')
    expect(r.status).toBe('fail')
    expect(r.error).toContain('finish')
  })

  it('宿主没有 stream 能力时明确报错', async () => {
    const r = await probeViaRuntime(fakeLlm(), 'p', 'm')
    expect(r.status).toBe('fail')
    expect(r.error).toContain('stream')
  })
})

describe('probeRegistryKey', () => {
  const llmWithProbe = (): LlmRuntimeLike => ({
    ...fakeLlm(),
    stream: fakeStream([{ type: 'finish', reason: { kind: 'stop' } }]),
  })

  it('注册表内的 key → 发起探测（modelId 可含 /）', async () => {
    let seen: { provider?: string; model?: string } = {}
    const llm: LlmRuntimeLike = {
      ...llmWithProbe(),
      listProviders: () => [{ id: 'pm', name: 'pm' }],
      listModels: async () => [{ provider: 'pm', id: 'mimo/mimo-v2.5', name: 'x' }],
      stream: async function* (o) {
        seen = { provider: o.provider, model: o.model }
        yield { type: 'finish', reason: { kind: 'stop' } }
      },
    }
    const r = await probeRegistryKey(llm, 'pm/mimo/mimo-v2.5')
    expect(r?.status).toBe('ok')
    expect(seen).toEqual({ provider: 'pm', model: 'mimo/mimo-v2.5' })
  })

  it('未注册 provider / 未收录 model / 无 stream / 非法 key → undefined（调用方走 404）', async () => {
    const full = llmWithProbe()
    expect(await probeRegistryKey(full, 'nope/m1')).toBeUndefined()
    expect(await probeRegistryKey(full, 'deepseek/not-in-catalog')).toBeUndefined()
    expect(await probeRegistryKey(fakeLlm(), 'deepseek/deepseek-flash')).toBeUndefined()
    expect(await probeRegistryKey(full, 'nodelimiter')).toBeUndefined()
    expect(await probeRegistryKey(full, 'deepseek/')).toBeUndefined()
  })
})
