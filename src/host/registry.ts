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
  /**
   * 宿主原生模型调用入口（结构化最小定义，避免引入 dsh-llm 依赖）。
   * 内置模型的健康探测走这里：协议、端点、凭据全部由宿主适配器接管。
   */
  stream?(options: {
    provider: string
    model: string
    messages: Array<{ role: 'user'; content: ReadonlyArray<{ type: 'text'; text: string }> }>
    maxTokens?: number
    signal?: AbortSignal
  }): AsyncIterable<{
    type: string
    text?: string
    reason?: { kind: string; failure?: { message?: string; code?: string; status?: number } }
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

// ── 内置模型健康探测（走宿主 llm 运行时）────────────────────────────────
//
// 注册表独有的模型（如内置 DeepSeek 目录）没有可直接 fetch 的 baseURL/key
// 组合：协议与凭据由宿主适配器管理。但 ctx.llm.stream() 是宿主自己的调用
// 入口——适配器用它发起真实请求，凭据解析、协议映射、重试策略全部复用宿主
// 逻辑。探测 = 发一次 max_tokens=1 的最小请求，等到首个增量块或 finish。

export interface RuntimeProbeOutcome {
  status: 'ok' | 'fail'
  latency: number
  error?: string
}

const RUNTIME_PROBE_TIMEOUT_MS = 30_000

/** 经宿主 llm 运行时对单个模型发起最小探测请求。 */
export async function probeViaRuntime(
  llm: LlmRuntimeLike,
  provider: string,
  model: string,
): Promise<RuntimeProbeOutcome> {
  if (typeof llm.stream !== 'function') {
    return { status: 'fail', latency: 0, error: '宿主 llm 服务不支持 stream 调用' }
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), RUNTIME_PROBE_TIMEOUT_MS)
  const start = Date.now()
  try {
    const stream = llm.stream({
      provider,
      model,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
      maxTokens: 1,
      signal: controller.signal,
    })
    // 首个内容块的耗时更能反映模型可用性；finish 前没有内容块则回退总耗时
    let firstChunkLatency = 0
    for await (const chunk of stream) {
      if (chunk.type === 'finish') {
        const kind = chunk.reason?.kind
        if (kind === 'error' || kind === 'aborted') {
          const failure = chunk.reason?.failure
          return {
            status: 'fail',
            latency: Date.now() - start,
            error: failure?.message
              ? `${failure.code ?? kind}${failure.status != null ? ` (HTTP ${failure.status})` : ''}：${failure.message}`
              : `模型调用失败（${kind}）`,
          }
        }
        return { status: 'ok', latency: firstChunkLatency || Date.now() - start }
      }
      if (!firstChunkLatency && chunk.type !== 'usage') firstChunkLatency = Date.now() - start
    }
    return { status: 'fail', latency: Date.now() - start, error: '模型流提前结束（未收到 finish）' }
  } catch (e: any) {
    const latency = Date.now() - start
    const msg = e?.name === 'AbortError'
      ? `超时（${RUNTIME_PROBE_TIMEOUT_MS / 1000}s）`
      : (e?.message || String(e))
    return { status: 'fail', latency, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 按列表 key（provider/modelId）探测注册表模型；key 不属于注册表时返回
 * undefined（调用方继续走 404）。modelId 可含 '/'（如 pi-ai 的路由模型 id），
 * 因此 provider 段取第一个 '/' 之前。
 */
export async function probeRegistryKey(
  llm: LlmRuntimeLike,
  key: string,
): Promise<RuntimeProbeOutcome | undefined> {
  if (typeof llm.stream !== 'function') return undefined
  const slash = key.indexOf('/')
  if (slash <= 0 || slash === key.length - 1) return undefined
  const provider = key.slice(0, slash)
  const model = key.slice(slash + 1)
  try {
    if (!llm.listProviders().some((p) => p.id === provider)) return undefined
    const models = await llm.listModels(provider)
    if (!models.some((m) => m.id === model)) return undefined
  } catch {
    return undefined
  }
  return probeViaRuntime(llm, provider, model)
}
