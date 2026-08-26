// 表格列定义与测试状态的视觉映射（纯数据，无渲染逻辑）。

import type { CSSProperties } from 'react'
import type { Dict, TestStatus } from './types'
import { STYLES } from './styles'

/** 列定义：optional=true 的列默认不显示，由多选框控制；label 为词典 key */
export interface ColumnDef {
  key: string
  label: keyof Dict
  code?: boolean
  optional?: boolean
}

export const COLUMNS: ColumnDef[] = [
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

/** 状态 → 词典 key */
export const STATUS_LABEL: Record<TestStatus, keyof Dict> = {
  idle: 'statusIdle',
  testing: 'statusTesting',
  ok: 'statusOk',
  fail: 'statusFail',
  skip: 'statusSkip',
}

/** 状态 → 圆点颜色（testing 带脉冲动画） */
export const STATUS_DOT_STYLE: Record<TestStatus, CSSProperties> = {
  idle: STYLES.dotIdle,
  testing: STYLES.dotTesting,
  ok: STYLES.dotOk,
  fail: STYLES.dotFail,
  skip: STYLES.dotSkip,
}

/** 状态 → 文字颜色 */
export const STATUS_TEXT_STYLE: Record<TestStatus, CSSProperties> = {
  idle: STYLES.statusTextIdle,
  testing: STYLES.statusTextTesting,
  ok: STYLES.statusTextOk,
  fail: STYLES.statusTextFail,
  skip: STYLES.statusTextSkip,
}
