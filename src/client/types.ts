// client 侧领域类型与运行时服务接口（纯类型，无运行时代码）。

/** 多语言词典的键集合（zh/en 必须一一对应） */
export interface Dict {
  tab: string
  title: string
  updatedAt: string
  testAll: string
  testingBtn: string
  showCols: string
  loading: string
  loadError: string
  retry: string
  unknownError: string
  empty: string
  colProvider: string
  colModelId: string
  colName: string
  colContextWindow: string
  colMaxTokens: string
  colInput: string
  colApi: string
  colBaseURL: string
  colStatus: string
  colLatency: string
  statusIdle: string
  statusTesting: string
  statusOk: string
  statusFail: string
  statusSkip: string
  testOne: string
  testOneTip: string
  retestTip: string
}

/** locale 服务：多语言词典注册 / 翻译 / 语言变更订阅（harness client runtime 提供） */
export interface LocaleService {
  register(ns: string, dicts: { zh: Dict; en: Dict }): unknown
  /** 返回绑定命名空间的翻译函数（每次调用读取当前激活词典） */
  bind(ns: string): (key: string) => string
  subscribe(fn: () => void): () => void
  getLocale(): { active: string }
}

/** slots 服务：注册 UI slot（harness client runtime 提供） */
export interface SlotsService {
  inject(slot: string, register: () => unknown): unknown
  register(
    def: { name: string; id: string; order: number; label: () => string; locale: string },
    render: () => import('react').ReactElement,
  ): () => void
}

/** client 插件上下文（apply 收到的 ctx） */
export interface ClientContext {
  slots: SlotsService
  locale: LocaleService
  effect(fn: () => unknown, id?: string): unknown
}

// ── 数据模型（与 host 侧 /api/model-health/* 的 JSON 契约对齐）───────────

export interface ModelRow {
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
}

export type TestStatus = 'idle' | 'testing' | 'ok' | 'fail' | 'skip'

export interface TestResult {
  status: TestStatus
  latency?: number
  error?: string
}

export type HealthJson =
  | { ok: true; count?: number; source?: string; updatedAt?: string; models?: ModelRow[] }
  | { ok: false; error: string }

/** hover tooltip 状态：横向占满表格，显示在所悬停行的正上方 */
export interface TooltipState {
  left: number
  width: number
  rowTop: number
  error: string
}
