// dsh-model-health — client 模块（TypeScript + JSX 版本）：
// 在设置页注入"模型列表"section。
//
// 构建产物 dist/client.js 保持 DSH 浏览器侧的模块加载器格式：
//   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
// factory 内用 require("react") 获取 harness 注入的 React —— 因此源码
// 对 react 只做类型导入（编译期擦除），打包后零外部模块引用。
//
// 注册一个 settings.section slot，组件通过 fetch /api/model-health/json
// 获取模型列表 JSON 后渲染表格；支持逐行「测试」按钮与「测试全部」。
//
// 多语言：通过官方 locale 服务注册 zh/en 词典（与 dsh-plugin-mgr 同模式），
// 语言跟随 harness 设置（设置 → 通用 → 语言），切换语言即时生效。

import type { CSSProperties, MouseEvent, ReactElement } from 'react'

// ── 运行时服务类型（由 harness client runtime 注入）─────────────────────

/** 多语言词典的键集合（zh/en 必须一一对应） */
interface Dict {
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
}

/** locale 服务：多语言词典注册 / 翻译 / 语言变更订阅 */
interface LocaleService {
  register(ns: string, dicts: { zh: Dict; en: Dict }): unknown
  /** 返回绑定命名空间的翻译函数（每次调用读取当前激活词典） */
  bind(ns: string): (key: string) => string
  subscribe(fn: () => void): () => void
  getLocale(): { active: string }
}

/** slots 服务：注册 UI slot */
interface SlotsService {
  inject(slot: string, register: () => unknown): unknown
  register(
    def: { name: string; id: string; order: number; label: () => string; locale: string },
    render: () => ReactElement,
  ): () => void
}

/** client 插件上下文（apply 收到的 ctx） */
interface ClientContext {
  slots: SlotsService
  locale: LocaleService
  effect(fn: () => unknown, id?: string): unknown
}

// ── 数据模型（与 host 侧 /api/model-health/* 的 JSON 契约对齐）───────────

interface ModelRow {
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

type TestStatus = 'idle' | 'testing' | 'ok' | 'fail' | 'skip'

interface TestResult {
  status: TestStatus
  latency?: number
  error?: string
}

type HealthJson =
  | { ok: true; count?: number; source?: string; updatedAt?: string; models?: ModelRow[] }
  | { ok: false; error: string }

// localStorage 持久化测试结果的 key
const STORAGE_KEY = 'dsh-model-health:test-results'

function loadStoredResults(): Record<string, TestResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const cleaned: Record<string, TestResult> = {}
    // 清理：残留的 testing（测试中刷新页面）归一为 idle；
    // 旧版按数组下标存的纯数字 key 直接丢弃
    for (const k in parsed) {
      if (/^\d+$/.test(k)) continue
      const v = parsed[k]
      if (!v || typeof v !== 'object') continue
      cleaned[k] = v.status === 'testing' ? { status: 'idle' } : v
    }
    return cleaned
  } catch {
    return {}
  }
}

function saveStoredResults(results: Record<string, TestResult>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
  } catch {
    // ignore quota errors
  }
}

/** 注入测试中圆点的脉冲动画 keyframes（内联样式无法定义 @keyframes）。 */
function ensureStatusCss(): void {
  const id = 'dsh-model-health-status-style'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = '@keyframes dsmh-pulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }'
  document.head.appendChild(el)
}

window.__ModuleLoader__.load({
  id: 'dsh-model-health',
  factory: (require) => {
    const React = require('react') as typeof import('react')
    const { useState, useEffect, useCallback, useRef } = React

    // ── 多语言词典（locale 服务，语言跟随 harness）───────────────────────
    const NS = 'dsh-model-health'
    const zh: Dict = {
      tab: '模型健康',
      title: '已配置模型',
      updatedAt: '更新时间：',
      testAll: '测试全部',
      testingBtn: '测试中...',
      showCols: '显示列：',
      loading: '加载中...',
      loadError: '读取模型列表失败：',
      retry: '重试',
      unknownError: '未知错误',
      empty: '未配置任何模型，请在 设置 → 模型 中添加。',
      colProvider: 'Provider',
      colModelId: '模型 ID',
      colName: '名称',
      colContextWindow: '上下文窗口',
      colMaxTokens: '最大输出',
      colInput: '输入模态',
      colApi: 'API 协议',
      colBaseURL: 'BaseURL',
      colStatus: '状态',
      colLatency: '延迟',
      statusIdle: '未测试',
      statusTesting: '测试中',
      statusOk: '可用',
      statusFail: '不可用',
      statusSkip: '跳过',
      testOne: '测试',
      testOneTip: '点击测试此模型',
    }
    const en: Dict = {
      tab: 'Model Health',
      title: 'Configured Models',
      updatedAt: 'Updated: ',
      testAll: 'Test All',
      testingBtn: 'Testing...',
      showCols: 'Columns: ',
      loading: 'Loading...',
      loadError: 'Failed to load model list: ',
      retry: 'Retry',
      unknownError: 'Unknown error',
      empty: 'No models configured. Add one in Settings → Models.',
      colProvider: 'Provider',
      colModelId: 'Model ID',
      colName: 'Name',
      colContextWindow: 'Context Window',
      colMaxTokens: 'Max Output',
      colInput: 'Modalities',
      colApi: 'API Protocol',
      colBaseURL: 'BaseURL',
      colStatus: 'Status',
      colLatency: 'Latency',
      statusIdle: 'Untested',
      statusTesting: 'Testing',
      statusOk: 'Available',
      statusFail: 'Unavailable',
      statusSkip: 'Skipped',
      testOne: 'Test',
      testOneTip: 'Click to test this model',
    }

    // ── 样式（适配 DSH 明暗主题的 CSS 变量）─────────────────────────────
    const STYLES = {
      wrap: {
        maxWidth: 1100,
        color: 'var(--dsw-alias-label-primary, #333)',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      },
      head: {
        display: 'flex',
        alignItems: 'baseline',
        gap: 8,
        flexWrap: 'wrap',
      },
      title: {
        margin: 0,
        fontSize: 16,
        fontWeight: 500,
        lineHeight: '24px',
      },
      count: {
        display: 'inline-block',
        background: 'var(--dsw-alias-button-primary-fill, #4f46e5)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
        padding: '2px 10px',
        borderRadius: 12,
        fontSize: 12,
      },
      toolbar: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
      },
      meta: {
        color: 'var(--dsw-alias-label-tertiary, #888)',
        fontSize: 13,
        marginRight: 'auto',
      },
      btn: {
        boxSizing: 'border-box',
        height: 28,
        padding: '0 14px',
        fontSize: 12,
        lineHeight: '18px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-border-l2, #ddd)',
        borderRadius: 14,
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, #333)',
      },
      btnPrimary: {
        background: 'var(--dsw-alias-button-primary-fill, #4f46e5)',
        color: 'var(--dsw-alias-label-primary-foreground, #fff)',
        border: 'none',
      },
      btnDisabled: {
        opacity: 0.5,
        cursor: 'not-allowed',
      },
      // 状态列里的"测试"小按钮（未测试的模型显示它代替"未测试"文字）
      btnTestSmall: {
        boxSizing: 'border-box',
        height: 22,
        padding: '0 12px',
        fontSize: 12,
        lineHeight: '16px',
        cursor: 'pointer',
        border: '1px solid var(--dsw-alias-button-primary-fill, #4f46e5)',
        borderRadius: 11,
        background: 'transparent',
        color: 'var(--dsw-alias-button-primary-fill, #4f46e5)',
        whiteSpace: 'nowrap',
      },
      progress: {
        fontSize: 12,
        color: 'var(--dsw-alias-label-tertiary, #888)',
      },
      tableWrap: {
        // 圆角/阴影放在外层容器：<table> 上的 overflow/border-radius 不生效，
        // 且 collapse 模式下圆角无法裁剪单元格背景
        background: 'var(--dsw-alias-bg-layer-2, #fafafa)',
        borderRadius: 8,
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
      },
      table: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: 14,
      },
      th: {
        padding: '10px 12px',
        textAlign: 'left',
        // 四边全边框：collapse 模式下相邻边自动合并，
        // 整张表（含外框）呈现统一闭合的网格线
        border: '1px solid var(--dsw-alias-border-l2, #eee)',
        background: 'var(--dsw-alias-bg-module-platform, #fff)',
        fontWeight: 600,
        whiteSpace: 'nowrap',
      },
      td: {
        padding: '10px 12px',
        textAlign: 'left',
        border: '1px solid var(--dsw-alias-border-l2, #eee)',
        color: 'var(--dsw-alias-label-primary, #333)',
      },
      code: {
        background: 'var(--dsw-alias-bg-layer-2, #f0f0f0)',
        padding: '2px 6px',
        borderRadius: 3,
        fontSize: 12,
        fontFamily: 'var(--ds-font-family-code, monospace)',
      },
      statusWrap: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        whiteSpace: 'nowrap',
      },
      statusTextIdle: {
        color: 'var(--dsw-alias-label-tertiary, #999)',
      },
      statusTextTesting: {
        color: 'var(--dsw-alias-state-info-primary, #1967d2)',
      },
      statusTextOk: {
        color: 'var(--dsw-alias-state-success-primary, #1e8e3e)',
      },
      statusTextFail: {
        color: 'var(--dsw-alias-state-error-primary, #d32f2f)',
      },
      statusTextSkip: {
        color: 'var(--dsw-alias-label-tertiary, #888)',
      },
      dot: {
        width: 6,
        height: 6,
        borderRadius: '50%',
        flex: 'none',
      },
      dotIdle: {
        background: 'var(--dsw-alias-label-dimmed, #bbb)',
      },
      dotTesting: {
        background: 'var(--dsw-alias-state-info-primary, #1967d2)',
        animation: 'dsmh-pulse 1s ease-in-out infinite',
      },
      dotOk: {
        background: 'var(--dsw-alias-state-success-primary, #1e8e3e)',
      },
      dotFail: {
        background: 'var(--dsw-alias-state-error-primary, #d32f2f)',
      },
      dotSkip: {
        background: 'var(--dsw-alias-label-dimmed, #bbb)',
      },
      center: {
        textAlign: 'center',
        color: 'var(--dsw-alias-label-tertiary, #999)',
        padding: '40px 0',
      },
      error: {
        color: 'var(--dsw-alias-state-error-primary, #d32f2f)',
        padding: '16px',
      },
      loading: {
        color: 'var(--dsw-alias-label-tertiary, #999)',
        padding: '24px 0',
        textAlign: 'center',
      },
      errorMsg: {
        color: 'var(--dsw-alias-state-error-primary, #d32f2f)',
        fontSize: 12,
        maxWidth: 200,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      colToggleLabel: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: 12,
        cursor: 'pointer',
        color: 'var(--dsw-alias-label-secondary, #555)',
        userSelect: 'none',
      },
      colToggleCheckbox: {
        cursor: 'pointer',
      },
    } satisfies Record<string, CSSProperties>

    // 列定义：optional=true 的列默认不显示，由多选框控制；label 为词典 key
    interface ColumnDef {
      key: string
      label: keyof Dict
      code?: boolean
      optional?: boolean
    }
    const COLUMNS: ColumnDef[] = [
      { key: 'provider', label: 'colProvider' },
      { key: 'modelId', label: 'colModelId', code: true, optional: true },
      { key: 'modelName', label: 'colName' },
      { key: 'contextWindow', label: 'colContextWindow', optional: true },
      { key: 'maxTokens', label: 'colMaxTokens', optional: true },
      { key: 'input', label: 'colInput', optional: true },
      { key: 'api', label: 'colApi', optional: true },
      { key: 'baseURL', label: 'colBaseURL', code: true, optional: true },
      { key: '_status', label: 'colStatus' },
      { key: '_latency', label: 'colLatency' },
    ]

    // 状态标签映射（值为词典 key）
    const STATUS_LABEL: Record<TestStatus, keyof Dict> = {
      idle: 'statusIdle',
      testing: 'statusTesting',
      ok: 'statusOk',
      fail: 'statusFail',
      skip: 'statusSkip',
    }
    // 状态 → 圆点颜色 / 文字颜色映射（圆点 + 彩色文字；测试中圆点带脉冲动画）
    const STATUS_DOT_STYLE: Record<TestStatus, CSSProperties> = {
      idle: STYLES.dotIdle,
      testing: STYLES.dotTesting,
      ok: STYLES.dotOk,
      fail: STYLES.dotFail,
      skip: STYLES.dotSkip,
    }
    const STATUS_TEXT_STYLE: Record<TestStatus, CSSProperties> = {
      idle: STYLES.statusTextIdle,
      testing: STYLES.statusTextTesting,
      ok: STYLES.statusTextOk,
      fail: STYLES.statusTextFail,
      skip: STYLES.statusTextSkip,
    }

    /** hover tooltip 状态：横向占满表格，显示在所悬停行的正上方 */
    interface TooltipState {
      left: number
      width: number
      rowTop: number
      error: string
    }

    /**
     * 模型列表 section 组件。
     * fetch /api/model-health/json 获取数据 → 渲染表格。
     * 「测试」按钮 → POST /api/model-health/test 单测该行；
     * 「测试全部」→ 并发（限制 6）逐个更新状态。
     */
    function ModelListSection({ t, locale }: { t: (key: string) => string; locale: LocaleService }): ReactElement {
      const [state, setState] = useState<{
        loading: boolean
        error: string | null
        data: HealthJson | null
      }>({ loading: true, error: null, data: null })
      // testResults: { [modelKey]: TestResult }
      // key 为 provider/modelId（与 host 侧一致），settings 增删/排序不错位；
      // 初始值从 localStorage 读取，实现跨刷新持久化
      const [testResults, setTestResults] = useState<Record<string, TestResult>>(loadStoredResults)
      const [testing, setTesting] = useState(false)
      // 请求序号：同一模型重复触发测试（单测 + 测试全部并发）时，
      // 只有最新一次请求的结果允许写入，避免旧响应覆盖新状态
      const seqRef = useRef<Record<string, number>>({})
      const [progress, setProgress] = useState({ done: 0, total: 0 })
      // 可选列显示状态：{ [colKey]: boolean }，默认 false
      const [optionalCols, setOptionalCols] = useState<Record<string, boolean>>({})
      const [tooltip, setTooltip] = useState<TooltipState | null>(null)
      // 语言切换时强制重渲染（t 每次调用读取当前激活词典）
      const [localeTick, setLocaleTick] = useState(0)

      useEffect(() => {
        if (!locale || typeof locale.subscribe !== 'function') return
        return locale.subscribe(() => setLocaleTick((n) => n + 1))
      }, [locale])

      const loadData = useCallback(async () => {
        setState((s) => ({ ...s, loading: true, error: null }))
        try {
          const resp = await fetch('/api/model-health/json', { cache: 'no-store' })
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          const json: HealthJson = await resp.json()
          if (!json.ok) throw new Error(json.error || t('unknownError'))
          setState({ loading: false, error: null, data: json })
          // 不清空 testResults，保留上次测试结果
        } catch (e) {
          setState({ loading: false, error: (e as Error).message, data: null })
        }
      }, [])

      useEffect(() => {
        void loadData()
      }, [loadData])

      // 测试单个模型：该行置为 testing → POST /api/model-health/test → 写回结果
      // （「测试全部」与状态列的「测试」按钮共用此逻辑）
      const testModel = useCallback(async (key: string) => {
        const seq = (seqRef.current[key] || 0) + 1
        seqRef.current[key] = seq
        setTestResults((s) => ({ ...s, [key]: { status: 'testing' } }))

        let result: TestResult
        try {
          const resp = await fetch('/api/model-health/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key }),
            cache: 'no-store',
          })
          const json = await resp.json()
          result = !json.ok
            ? { status: 'fail', error: json.error as string | undefined }
            : {
                status: (json.status as TestStatus) || 'fail',
                latency: json.latency as number | undefined,
                error: json.error as string | undefined,
              }
        } catch (e) {
          result = { status: 'fail', error: (e as Error).message }
        }

        // 期间若同一模型又发起了更新的测试，丢弃这份过期结果
        if (seqRef.current[key] !== seq) return
        setTestResults((s) => {
          const next = { ...s, [key]: result }
          saveStoredResults(next)
          return next
        })
      }, [])

      // 测试全部：并发发起所有测试请求，每个完成即更新对应行状态
      const testAll = useCallback(async () => {
        const data = state.data
        if (!data || !data.ok || !data.models || data.models.length === 0) return
        const total = data.models.length
        setTesting(true)
        setProgress({ done: 0, total })

        let done = 0
        // 并发测试，但限制并发数避免压垮 host/网络
        const CONCURRENCY = 6
        const queue = data.models.map((m) => m.key)

        async function worker() {
          while (queue.length > 0) {
            const key = queue.shift()
            if (key === undefined) break
            await testModel(key)
            done++
            setProgress({ done, total })
            if (done >= total) setTesting(false)
          }
        }
        const workers = Array.from(
          { length: Math.min(CONCURRENCY, total) },
          () => worker(),
        )
        await Promise.all(workers)
      }, [state.data, testModel])

      if (state.loading) {
        return (
          <div style={STYLES.wrap}>
            <div style={STYLES.loading}>{t('loading')}</div>
          </div>
        )
      }

      if (state.error) {
        return (
          <div style={STYLES.wrap}>
            <div style={STYLES.error}>{t('loadError')}{state.error}</div>
            <button type="button" style={STYLES.btn} onClick={() => void loadData()}>
              {t('retry')}
            </button>
          </div>
        )
      }

      const data = state.data && state.data.ok ? state.data : { ok: true as const, models: [], count: 0, source: '', updatedAt: '' }
      const models = data.models || []
      // 日期格式跟随当前语言（zh → zh-CN，en → en-US）
      const activeLang =
        locale && typeof locale.getLocale === 'function'
          ? locale.getLocale().active
          : 'zh'
      const updatedAt = new Date(data.updatedAt || Date.now()).toLocaleString(
        activeLang === 'en' ? 'en-US' : 'zh-CN',
      )

      // 统计测试结果
      const stats = { ok: 0, fail: 0, skip: 0, testing: 0 }
      for (const k in testResults) {
        const s = testResults[k].status
        if (s === 'ok') stats.ok++
        else if (s === 'fail') stats.fail++
        else if (s === 'skip') stats.skip++
        else if (s === 'testing') stats.testing++
      }

      // 可见列：非可选列始终显示；可选列根据 optionalCols 状态
      const visibleCols = COLUMNS.filter(
        (col) => !col.optional || optionalCols[col.key],
      )
      const optionalColumns = COLUMNS.filter((col) => col.optional)

      const toggleCol = (key: string) => {
        setOptionalCols((s) => ({ ...s, [key]: !s[key] }))
      }

      // 预计算 provider 连续段的 rowspan：{ [startIdx]: spanLen }
      // 相同 provider 的连续行合并为一个单元格
      const providerSpan: Record<number, number> = {}
      {
        let k = 0
        while (k < models.length) {
          const start = k
          const p = models[k].provider
          while (k < models.length && models[k].provider === p) k++
          providerSpan[start] = k - start
        }
      }

      return (
        <div style={STYLES.wrap}>
          <div style={STYLES.head}>
            <h2 style={STYLES.title}>{t('title')}</h2>
            <span style={STYLES.count}>{data.count || models.length}</span>
          </div>
          <div style={STYLES.toolbar}>
            <span style={STYLES.meta}>
              {t('updatedAt')}{updatedAt}
            </span>
            {/* 测试统计 */}
            {stats.ok + stats.fail + stats.skip > 0 && (
              <span style={STYLES.progress}>
                ✓ {stats.ok}  ✗ {stats.fail}
                {stats.skip > 0 ? `  ⊘ ${stats.skip}` : ''}
              </span>
            )}
            {testing && (
              <span style={STYLES.progress}>
                {progress.done}/{progress.total}
              </span>
            )}
            {/* 测试全部按钮 */}
            <button
              type="button"
              style={{
                ...STYLES.btn,
                ...STYLES.btnPrimary,
                ...(testing ? STYLES.btnDisabled : {}),
              }}
              disabled={testing || models.length === 0}
              onClick={() => void testAll()}
            >
              {testing ? t('testingBtn') : t('testAll')}
            </button>
          </div>
          {/* 可选列 toggle 按钮组 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' }}>
              {t('showCols')}
            </span>
            {optionalColumns.map((col) => {
              const active = !!optionalCols[col.key]
              return (
                <button
                  key={col.key}
                  type="button"
                  onClick={() => toggleCol(col.key)}
                  style={{
                    boxSizing: 'border-box',
                    height: 24,
                    padding: '0 10px',
                    fontSize: 12,
                    cursor: 'pointer',
                    border: active
                      ? '1px solid var(--dsw-alias-button-primary-fill, #4f46e5)'
                      : '1px solid var(--dsw-alias-border-l2, #ddd)',
                    borderRadius: 12,
                    background: active
                      ? 'var(--dsw-alias-button-primary-fill, #4f46e5)'
                      : 'transparent',
                    color: active
                      ? 'var(--dsw-alias-label-primary-foreground, #fff)'
                      : 'var(--dsw-alias-label-secondary, #555)',
                  }}
                >
                  {t(col.label)}
                </button>
              )
            })}
          </div>
          {models.length === 0 ? (
            <div style={STYLES.center}>{t('empty')}</div>
          ) : (
            <div style={STYLES.tableWrap}>
              <table style={STYLES.table}>
                <thead>
                  <tr>
                    {visibleCols.map((col) => (
                      <th key={col.key} style={STYLES.th}>
                        {t(col.label)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {models.map((row, i) => {
                    const tr = testResults[row.key] || { status: 'idle' as TestStatus }
                    const labelKey = STATUS_LABEL[tr.status]
                    const statusLabel = labelKey ? t(labelKey) : tr.status
                    const dotStyle = STATUS_DOT_STYLE[tr.status]
                    const textStyle = STATUS_TEXT_STYLE[tr.status]
                    const latencyText = tr.latency != null ? `${tr.latency}ms` : '-'
                    return (
                      <tr key={(row.modelId || '') + i}>
                        {visibleCols.map((col) => {
                          if (col.key === 'provider') {
                            const span = providerSpan[i]
                            if (span === undefined) return null // 被合并，跳过
                            return (
                              <td
                                key={col.key}
                                rowSpan={span}
                                style={{ ...STYLES.td, verticalAlign: 'middle', fontWeight: 600 }}
                              >
                                {row.provider}
                              </td>
                            )
                          }
                          if (col.key === '_status') {
                            // 未测试：显示可点击的"测试"按钮，点击即测单个模型
                            if (tr.status === 'idle') {
                              return (
                                <td key={col.key} style={STYLES.td}>
                                  <button
                                    type="button"
                                    style={STYLES.btnTestSmall}
                                    title={t('testOneTip')}
                                    onClick={() => void testModel(row.key)}
                                  >
                                    {t('testOne')}
                                  </button>
                                </td>
                              )
                            }
                            const hasError = Boolean(tr.error) && tr.status === 'fail'
                            return (
                              <td key={col.key} style={STYLES.td}>
                                <span
                                  style={{
                                    ...STYLES.statusWrap,
                                    ...textStyle,
                                    cursor: hasError ? 'help' : 'default',
                                  }}
                                  onMouseEnter={
                                    hasError
                                      ? (e: MouseEvent<HTMLSpanElement>) => {
                                          const rowEl = e.currentTarget.closest('tr')
                                          const tableEl = e.currentTarget.closest('table')
                                          if (rowEl && tableEl) {
                                            const rowRect = rowEl.getBoundingClientRect()
                                            const tableRect = tableEl.getBoundingClientRect()
                                            setTooltip({
                                              left: tableRect.left,
                                              width: tableRect.width,
                                              rowTop: rowRect.top,
                                              error: tr.error || '',
                                            })
                                          }
                                        }
                                      : undefined
                                  }
                                  onMouseLeave={hasError ? () => setTooltip(null) : undefined}
                                >
                                  <span style={{ ...STYLES.dot, ...dotStyle }} />
                                  {statusLabel}
                                </span>
                              </td>
                            )
                          }
                          if (col.key === '_latency') {
                            return (
                              <td key={col.key} style={STYLES.td}>
                                {latencyText}
                              </td>
                            )
                          }
                          const value = row[col.key as keyof ModelRow] ?? '-'
                          return (
                            <td key={col.key} style={STYLES.td}>
                              {col.code
                                ? <code style={STYLES.code}>{String(value)}</code>
                                : String(value)}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {/* 全宽 hover tooltip：横向占满表格，显示在所悬停行的正上方 */}
          {tooltip && (
            <div
              style={{
                position: 'fixed',
                left: `${tooltip.left}px`,
                width: `${tooltip.width}px`,
                top: `${tooltip.rowTop}px`,
                transform: 'translateY(-100%)',
                marginTop: -4,
                padding: '8px 12px',
                background: 'var(--dsw-alias-state-error-bg, #2a2a2a)',
                color: 'var(--dsw-alias-state-error-primary, #ff6b6b)',
                fontSize: 12,
                lineHeight: '16px',
                borderRadius: 6,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-all',
                zIndex: 1000,
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                border: '1px solid var(--dsw-alias-border-l2, #444)',
                pointerEvents: 'none',
              }}
            >
              {tooltip.error}
            </div>
          )}
        </div>
      )
    }

    // client 侧依赖：slots（注册 UI slot 的服务）+ locale（多语言词典）
    const inject = ['slots', 'locale']

    function apply(ctx: ClientContext): void {
      ensureStatusCss()
      // 注册 zh/en 词典；t 每次调用读取当前激活语言
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-model-health: dictionaries')
      const t = ctx.locale.bind(NS)

      ctx.slots.inject('settings.section', () =>
        ctx.slots.register(
          {
            name: 'settings.section',
            id: 'model-health',
            order: 50,
            label: () => t('tab'),
            locale: NS,
          },
          () => <ModelListSection t={t} locale={ctx.locale} />,
        ),
      )
    }

    return { apply, inject }
  },
})
