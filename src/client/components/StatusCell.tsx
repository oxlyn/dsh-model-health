// 状态列单元格：未测试 → 可点击「测试」按钮；其余 → 圆点 + 彩色文字，
// 失败且带错误信息时悬停触发全宽错误 tooltip。

import { getReact } from '../runtime'
import type { MouseEvent, ReactElement } from 'react'
import type { TestResult, TooltipState } from '../types'
import { STYLES } from '../styles'
import { STATUS_DOT_STYLE, STATUS_LABEL, STATUS_TEXT_STYLE } from '../columns'

export interface StatusCellProps {
  modelKey: string
  result: TestResult
  t: (key: string) => string
  /** 点击行内「测试」按钮 */
  onTest: (key: string) => void
  /** 悬停显示 / 移出清除错误 tooltip */
  onErrorTip: (tip: TooltipState) => void
  onClearTip: () => void
}

export function StatusCell(props: StatusCellProps): ReactElement {
  const React = getReact()
  const { modelKey, result: tr, t, onTest, onErrorTip, onClearTip } = props

  // 未测试：显示可点击的"测试"按钮，点击即测单个模型
  if (tr.status === 'idle') {
    return (
      <td style={STYLES.td}>
        <button
          type="button"
          style={STYLES.btnTestSmall}
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
  return (
    <td style={STYLES.td}>
      <span
        style={{
          ...STYLES.statusWrap,
          ...STATUS_TEXT_STYLE[tr.status],
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
                  onErrorTip({
                    left: tableRect.left,
                    width: tableRect.width,
                    rowTop: rowRect.top,
                    error: tr.error || '',
                  })
                }
              }
            : undefined
        }
        onMouseLeave={hasError ? onClearTip : undefined}
      >
        <span style={{ ...STYLES.dot, ...STATUS_DOT_STYLE[tr.status] }} />
        {statusLabel}
      </span>
    </td>
  )
}
