// collectModels / toPublicRow 的契约测试：key 拼接规则是最容易在重构时破坏的部分。

import { describe, expect, it } from 'vitest'
import { collectModels, toPublicRow } from '../src/host/models'

describe('collectModels', () => {
  it('收集 llm-pi-ai 多提供商模型，key 带来源前缀', () => {
    const rows = collectModels({
      'llm-pi-ai': {
        providers: {
          openrouter: {
            api: 'openai-completions',
            baseURL: 'https://openrouter.ai/api/v1',
            apiKeyEnv: 'OPENROUTER_API_KEY',
            models: [{ id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000 }],
          },
        },
      },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('pi-ai/openrouter/gpt-4o')
    expect(rows[0].provider).toBe('openrouter')
    expect(rows[0].apiKeyEnv).toBe('OPENROUTER_API_KEY')
    expect(rows[0].contextWindow).toBe(128000)
  })

  it('收集 llm-deepseek 官方模型，默认 key 环境变量', () => {
    const rows = collectModels({
      'llm-deepseek': { models: [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }] },
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].key).toBe('deepseek/deepseek-chat')
    expect(rows[0].apiKeyEnv).toBe('DEEPSEEK_API_KEY')
    expect(rows[0].api).toBe('deepseek')
  })

  it('route 名恰好叫 deepseek 时两类来源的 key 不冲突', () => {
    const rows = collectModels({
      'llm-pi-ai': {
        providers: {
          deepseek: { models: [{ id: 'deepseek-chat' }] },
        },
      },
      'llm-deepseek': { models: [{ id: 'deepseek-chat' }] },
    })
    expect(rows.map((r) => r.key)).toEqual([
      'pi-ai/deepseek/deepseek-chat',
      'deepseek/deepseek-chat',
    ])
  })

  it('跳过非法条目；空配置返回空数组', () => {
    expect(collectModels({
      'llm-pi-ai': { providers: { a: { models: [null, {}, { id: 'x' }, 'oops'] } } },
      'llm-deepseek': { models: [42] },
    }).map((r) => r.key)).toEqual(['pi-ai/a/x'])
    expect(collectModels({})).toEqual([])
    expect(collectModels(undefined as any)).toEqual([])
  })
})

describe('toPublicRow', () => {
  it('不输出 apiKeyEnv（密钥引用不出 host）', () => {
    const [row] = collectModels({
      'llm-deepseek': { apiKeyEnv: 'MY_KEY', models: [{ id: 'm1' }] },
    })
    const pub = toPublicRow(row)
    expect('apiKeyEnv' in pub).toBe(false)
    expect(pub.key).toBe('deepseek/m1')
  })
})
