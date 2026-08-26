// 状态列单元格：
// - 未测试（idle）→ 可点击「测试」文字链
// - 测试中（testing）→ 圆点 + 文字（不可点，避免重复触发）
// - 已出结果（ok/fail/skip）→ 整个状态徽章可点击重新测试，
//   hover 下划线提示可点；失败且带错误信息时悬停触发全宽错误 tooltip

import { getReact } from '../runtime'
import type { MouseEvent, ReactElement } from 'react'
import type { TestResult, TooltipState } from '../types'
import { STYLES } from '../styles'
import { STATUS_DOT_STYLE, STATUS_LABEL, STATUS_TEXT_STYLE } from '../columns'

export interface StatusCellProps {
  modelKey: string
  result: TestResult
  t: (key: string) => string
  /** 点击行内「测试」按钮 / 可重测状态徽章 */
  onTest: (key: string) => void
  /** 悬停显示 / 移出清除错误 tooltip */
  onErrorTip: (tip: TooltipState) => void
  onClearTip: () => void
}

export function StatusCell(props: StatusCellProps): ReactElement {
  const React = getReact()
  const { modelKey, result: tr, t, onTest, onErrorTip, onClearTip } = props

  // 未测试：显示"测试"文字链（下划线提示可点，hover 提亮为主题色）
  if (tr.status === 'idle') {
    return (
      <td style={STYLES.td}>
        <button
          type="button"
          className="dsmh-test-link"
          style={STYLES.testLink}
          title={t('testOneTip')}
          onClick={() => onTest(modelKey)}
        >
          {t('testOne')}
        </button>
      </td>
    )
  }

  const hasError = Boolean(tr.error) && tr.status === 'fail'
  const labelKey = STATUS_LABEL[tr.status]
  const statusLabel = labelKey ? t(labelKey) : tr.status
  const showTip = hasError
    ? (e: MouseEvent<HTMLElement>) => {
        const rowEl = e.currentTarget.closest('tr')
        const tableEl = e.currentTarget.closest('table')
        if (rowEl && tableEl) {
          const rowRect = rowEl.getBoundingClientRect()
          const tableRect = tableEl.getBoundingClientRect()
          onErrorTip({
            left: tableRect.left,
            width: tableRect.width,
            rowTop: rowRect.top,
            error: tr.error || '',
          })
        }
      }
    : undefined

  // 已出结果：徽章整体可点击 → 单模型重测（复用 testOne 状态机）
  if (tr.status !== 'testing') {
    return (
      <td style={STYLES.td}>
        <button
          type="button"
          className="dsmh-retest"
          title={t('retestTip')}
          style={{
            ...STYLES.statusWrap,
            ...STYLES.retestBtn,
            ...STATUS_TEXT_STYLE[tr.status],
          }}
          onClick={() => onTest(modelKey)}
          onMouseEnter={showTip}
          onMouseLeave={hasError ? onClearTip : undefined}
        >
          <span style={{ ...STYLES.dot, ...STATUS_DOT_STYLE[tr.status] }} />
          <span className="dsmh-status-label">{statusLabel}</span>
        </button>
      </td>
    )
  }

  // 测试中：进行中不可点击
  return (
    <td style={STYLES.td}>
      <span
        style={{
          ...STYLES.statusWrap,
          ...STATUS_TEXT_STYLE[tr.status],
          cursor: hasError ? 'help' : 'default',
        }}
        onMouseEnter={showTip}
        onMouseLeave={hasError ? onClearTip : undefined}
      >
        <span style={{ ...STYLES.dot, ...STATUS_DOT_STYLE[tr.status] }} />
        {statusLabel}
      </span>
    </td>
  )
}
