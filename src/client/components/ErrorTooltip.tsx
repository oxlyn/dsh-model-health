// 全宽 hover 错误 tooltip：横向占满表格，显示在所悬停行的正上方。

import { getReact } from '../runtime'
import type { ReactElement } from 'react'
import type { TooltipState } from '../types'
import { errorTooltipStyle } from '../styles'

export function ErrorTooltip({ tip }: { tip: TooltipState }): ReactElement {
  const React = getReact()
  return <div style={errorTooltipStyle(tip)}>{tip.error}</div>
}
