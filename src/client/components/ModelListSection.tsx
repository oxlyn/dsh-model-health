// 模型列表 section 主组件：数据加载 + 工具栏 + 可选列开关 + 表格组装。
// 行内状态渲染委托 StatusCell，错误 tooltip 委托 ErrorTooltip，
// 测试状态机来自 useTestResults hook。

import { getReact } from '../runtime'
import type { ReactElement } from 'react'
import type { HealthJson, LocaleService, TooltipState } from '../types'
import { fetchModelList } from '../api'
import { STYLES, colToggleStyle } from '../styles'
import { COLUMNS } from '../columns'
import { useTestResults } from '../use-test-results'
import { StatusCell } from './StatusCell'
import { ErrorTooltip } from './ErrorTooltip'

export interface ModelListSectionProps {
  t: (key: string) => string
  locale: LocaleService
}

export function ModelListSection({ t, locale }: ModelListSectionProps): ReactElement {
  const React = getReact()
  const { useState, useEffect, useCallback } = React
  const run = useTestResults()

  const [state, setState] = useState<{
    loading: boolean
    error: string | null
    data: HealthJson | null
  }>({ loading: true, error: null, data: null })
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
      const json = await fetchModelList()
      if (!json.ok) throw new Error(json.error || t('unknownError'))
      setState({ loading: false, error: null, data: json })
      // 不清空 testResults，保留上次测试结果
    } catch (e) {
      setState({ loading: false, error: (e as Error).message, data: null })
    }
  }, [t])

  useEffect(() => {
    void loadData()
  }, [loadData])

  const toggleCol = (key: string): void => {
    setOptionalCols((s) => ({ ...s, [key]: !s[key] }))
  }

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

  const data = state.data && state.data.ok
    ? state.data
    : { ok: true as const, models: [], count: 0, source: '', updatedAt: '' }
  const models = data.models || []
  // 日期格式跟随当前语言（zh → zh-CN，en → en-US）
  const activeLang =
    locale && typeof locale.getLocale === 'function' ? locale.getLocale().active : 'zh'
  const updatedAt = new Date(data.updatedAt || Date.now()).toLocaleString(
    activeLang === 'en' ? 'en-US' : 'zh-CN',
  )

  // 统计测试结果
  const stats = { ok: 0, fail: 0, skip: 0 }
  for (const k in run.results) {
    const s = run.results[k].status
    if (s === 'ok') stats.ok++
    else if (s === 'fail') stats.fail++
    else if (s === 'skip') stats.skip++
  }

  // 可见列：非可选列始终显示；可选列根据 optionalCols 状态
  const visibleCols = COLUMNS.filter((col) => !col.optional || optionalCols[col.key])
  const optionalColumns = COLUMNS.filter((col) => col.optional)

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
        {run.testing && (
          <span style={STYLES.progress}>
            {run.progress.done}/{run.progress.total}
          </span>
        )}
        {/* 测试全部按钮 */}
        <button
          type="button"
          style={{
            ...STYLES.btn,
            ...STYLES.btnPrimary,
            ...(run.testing ? STYLES.btnDisabled : {}),
          }}
          disabled={run.testing || models.length === 0}
          onClick={() => void run.testAll(models)}
        >
          {run.testing ? t('testingBtn') : t('testAll')}
        </button>
      </div>
      {/* 可选列 toggle 按钮组 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--dsw-alias-label-tertiary, #888)' }}>
          {t('showCols')}
        </span>
        {optionalColumns.map((col) => (
          <button
            key={col.key}
            type="button"
            onClick={() => toggleCol(col.key)}
            style={colToggleStyle(!!optionalCols[col.key])}
          >
            {t(col.label)}
          </button>
        ))}
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
                const tr = run.results[row.key] || { status: 'idle' as const }
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
                        return (
                          <StatusCell
                            key={col.key}
                            modelKey={row.key}
                            result={tr}
                            t={t}
                            onTest={(key) => void run.testOne(key)}
                            onErrorTip={setTooltip}
                            onClearTip={() => setTooltip(null)}
                          />
                        )
                      }
                      if (col.key === '_latency') {
                        return (
                          <td key={col.key} style={STYLES.td}>
                            {tr.latency != null ? `${tr.latency}ms` : '-'}
                          </td>
                        )
                      }
                      const value = row[col.key as keyof typeof row] ?? '-'
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
      {/* 全宽 hover tooltip */}
      {tooltip && <ErrorTooltip tip={tooltip} />}
    </div>
  )
}
