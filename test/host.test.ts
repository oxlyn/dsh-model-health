// 响应体校验 + Markdown 渲染的纯函数测试。

import { describe, expect, it } from 'vitest'
import { validateSuccessBody } from '../src/host/model-test'
import { renderMarkdownTable } from '../src/host/markdown'
import type { ModelRow } from '../src/host/models'

describe('validateSuccessBody', () => {
  it('200 响应必须含 choices 数组，且 body 不是错误对象', () => {
    expect(validateSuccessBody('openai-completions', '{"choices":[{"message":{}}]}')).toBeUndefined()
    expect(validateSuccessBody('openai-completions', '{"error":{"message":"boom"}}')).toContain('错误')
    expect(validateSuccessBody('openai-completions', '{"usage":{}}')).toContain('choices')
    expect(validateSuccessBody('openai-completions', '')).toContain('空')
    expect(validateSuccessBody('openai-completions', 'not json')).toContain('JSON')
  })
})

describe('renderMarkdownTable', () => {
  const row: ModelRow = {
    key: 'deepseek/deepseek-chat',
    provider: 'deepseek',
    displayName: 'DeepSeek',
    modelId: 'deepseek-chat',
    modelName: 'DeepSeek Chat',
    contextWindow: 64000,
    maxTokens: 8192,
    input: 'text',
    api: 'deepseek',
    baseURL: 'https://api.deepseek.com',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
  }

  it('无模型时输出双语提示', () => {
    const md = renderMarkdownTable([])
    expect(md).toContain('No models are configured')
    expect(md).toContain('settings.yaml')
  })

  it('输出 9 列表格', () => {
    const md = renderMarkdownTable([row])
    expect(md).toContain('| deepseek | deepseek-chat |')
    expect(md).not.toContain('Health')
  })
})
