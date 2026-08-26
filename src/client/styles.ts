// 内联样式表（适配 DSH 明暗主题的 CSS 变量）。

import type { CSSProperties } from 'react'

export const STYLES = {
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
  // 已出结果的状态徽章改为可点击重测：按钮外观重置为纯文字，
  // 颜色沿用各状态文字色，hover 反馈（下划线/↻ 显形）由注入的 CSS 类提供
  retestBtn: {
    border: 'none',
    background: 'transparent',
    padding: 0,
    margin: 0,
    font: 'inherit',
    fontSize: 12,
    lineHeight: '16px',
    textAlign: 'left',
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
} satisfies Record<string, CSSProperties>

/** 可选列 toggle 小按钮（激活/未激活两种态） */
export function colToggleStyle(active: boolean): CSSProperties {
  return {
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
  }
}

/** 全宽 hover 错误 tooltip 的定位样式 */
export function errorTooltipStyle(tip: { left: number; width: number; rowTop: number }): CSSProperties {
  return {
    position: 'fixed',
    left: `${tip.left}px`,
    width: `${tip.width}px`,
    top: `${tip.rowTop}px`,
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
  }
}
