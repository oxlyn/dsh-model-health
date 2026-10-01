// 宿主 llm 注册表模型收集。
//
// 新版 DSH 在 Context 上暴露 llm 服务（LlmRuntime，见 @deepseek-ai/dsh-llm）：
// listProviders() / listModels() 返回宿主当前实际注册的全部 provider 路由与
// 模型目录——包括没有写入任何配置文件的内置模型（如 dsh-llm-deepseek 的
// DEFAULT_MODELS：deepseek-flash / deepseek-v4-pro）。配置文件里显式声明过的
// 模型仍以文件为准（本插件据此探测），注册表只补齐文件里没有的条目。

import type { ModelRow } from './models'

/** 宿主 llm 服务（LlmRuntime）插件实际用到的最小形态。 */
export interface LlmRuntimeLike {
  listProviders(): Array<{ id: string; name: string }>
  listModels(provider: string): Promise<Array<{
    provider: string
    id: string
    name: string
    description?: string
    inputModalities?: readonly string[]
  }>>
  /** 可选：解析单模型上下文窗口 / 默认输出上限（老版本宿主可能未提供） */
  resolveModelInfo?(provider: string, model: string): Promise<{
    context?: { contextWindow: number }
    defaultMaxTokens?: number
  }>
}

/** 从宿主 llm 注册表收集全部已注册模型（内置 + 配置驱动）。 */
export async function collectRegistryModels(llm: LlmRuntimeLike): Promise<ModelRow[]> {
  const providers = llm.listProviders()
  const perProvider = await Promise.all(providers.map(async (p) => {
    let models: Awaited<ReturnType<LlmRuntimeLike['listModels']>>
    try {
      models = await llm.listModels(p.id)
    } catch {
      return [] // 单个 provider 目录读取失败不影响其余
    }
    return Promise.all(models.map(async (m) => {
      // 上下文窗口 / 输出上限尽力而为：老版本没有 resolveModelInfo，或单模型
      // 解析失败时显示 '-'，不影响行本身
      let contextWindow: number | string = '-'
      let maxTokens: number | string = '-'
      if (typeof llm.resolveModelInfo === 'function') {
        try {
          const info = await llm.resolveModelInfo(p.id, m.id)
          if (info?.context?.contextWindow) contextWindow = info.context.contextWindow
          if (info?.defaultMaxTokens) maxTokens = info.defaultMaxTokens
        } catch { /* ignore */ }
      }
      const row: ModelRow = {
        key: `${p.id}/${m.id}`,
        provider: p.id,
        displayName: p.name || p.id,
        modelId: m.id,
        modelName: m.name || m.id,
        contextWindow,
        maxTokens,
        input: m.inputModalities && m.inputModalities.length > 0
          ? m.inputModalities.join('/')
          : 'text',
        // 协议与端点由宿主适配器接管（如内置 DeepSeek 走 Messages），插件
        // 拿不到可直接探测的 baseURL/key，测试端点对这类行一律返回「跳过」
        api: 'registry',
        baseURL: '-',
        apiKeyEnv: '',
      }
      return row
    }))
  }))
  return perProvider.flat()
}

/** 去掉注册表中与文件配置重复的模型（同一 provider 下的同一 modelId）。 */
export function dedupeRegistryRows(registryRows: ModelRow[], fileRows: ModelRow[]): ModelRow[] {
  const seen = new Set(fileRows.map((r) => `${r.provider}\u0000${r.modelId}`))
  return registryRows.filter((r) => !seen.has(`${r.provider}\u0000${r.modelId}`))
}
