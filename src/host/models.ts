// 从 settings 配置对象收集所有已配置的模型（llm-pi-ai + llm-deepseek 两类来源）。

/** 模型行：host 侧内部使用；apiKeyEnv 不输出到浏览器（见 toPublicRow）。 */
export interface ModelRow {
  /** 稳定标识 provider/modelId：测试结果与前端状态都按它关联，settings 顺序变化不错位 */
  key: string
  provider: string
  displayName: string
  modelId: string
  modelName: string
  contextWindow: number | string
  maxTokens: number | string
  input: string
  api: string
  baseURL: string
  /** 环境变量名（不输出到 JSON，仅 host 侧测试用） */
  apiKeyEnv: string
}

/** JSON 输出时去掉 apiKeyEnv（不暴露到浏览器）。 */
export function toPublicRow(r: ModelRow): Omit<ModelRow, 'apiKeyEnv'> {
  const { apiKeyEnv: _omit, ...public_ } = r
  return public_
}

export function collectModels(cfg: Record<string, any>): ModelRow[] {
  const rows: ModelRow[] = []

  // 1. 通用多协议提供商 llm-pi-ai
  const piAi = cfg['llm-pi-ai']
  if (piAi && typeof piAi === 'object') {
    const providers = piAi.providers || {}
    for (const [route, p] of Object.entries(providers as Record<string, any>)) {
      if (!p || typeof p !== 'object') continue
      const models = Array.isArray(p.models) ? p.models : []
      for (const m of models) {
        rows.push({
          key: `${route}/${m.id || ''}`,
          provider: route,
          displayName: p.displayName || route,
          modelId: m.id || '',
          modelName: m.name || m.id || '',
          contextWindow: m.contextWindow ?? p.defaultContextWindow ?? '-',
          maxTokens: m.maxTokens ?? p.defaultMaxTokens ?? '-',
          input: Array.isArray(m.input) ? m.input.join('/')
            : (p.defaultInput || ['text']).join('/'),
          api: p.api || '-',
          baseURL: p.baseURL || '-',
          apiKeyEnv: p.apiKeyEnv || '',
        })
      }
    }
  }

  // 2. 官方 DeepSeek 提供商 llm-deepseek
  const ds = cfg['llm-deepseek']
  if (ds && typeof ds === 'object') {
    const models = Array.isArray(ds.models) ? ds.models : []
    for (const m of models) {
      rows.push({
        key: `deepseek/${m.id || ''}`,
        provider: 'deepseek',
        displayName: 'DeepSeek',
        modelId: m.id || '',
        modelName: m.name || m.id || '',
        contextWindow: m.contextWindow ?? '-',
        maxTokens: m.maxTokens ?? '-',
        input: Array.isArray(m.input) ? m.input.join('/') : 'text',
        api: 'deepseek',
        baseURL: 'https://api.deepseek.com',
        apiKeyEnv: ds.apiKeyEnv || 'DEEPSEEK_API_KEY',
      })
    }
  }

  return rows
}
