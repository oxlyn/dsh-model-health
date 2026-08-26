// client 插件装配点：注册词典与 settings.section slot。
// UI 渲染入口为 ModelListSection；本模块只做服务接线。

import type { ClientContext } from './types'
import { getReact } from './runtime'
import { NS, zh, en } from './i18n'
import { ModelListSection } from './components/ModelListSection'
import { registerSettingsNavIcon, ensureNavIconCss } from './nav-icon'

/** client 侧依赖：slots（注册 UI slot 的服务）+ locale（多语言词典） */
export const inject = ['slots', 'locale']

/** 注入内联样式无法表达的规则：@keyframes 脉冲动画 + 可重测状态徽章的 hover 反馈。 */
function ensureStatusCss(): void {
  const id = 'dsh-model-health-status-style'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = `
@keyframes dsmh-pulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }
/* 可点击重测的状态徽章：hover/聚焦 下划线提示可点 */
.dsmh-retest { cursor: pointer; }
.dsmh-retest:hover .dsmh-status-label,
.dsmh-retest:focus-visible .dsmh-status-label { text-decoration: underline; text-underline-offset: 3px; }
.dsmh-retest:focus-visible { outline: 1px solid currentColor; outline-offset: 2px; border-radius: 2px; }
/* 未测试行的"测试"文字链：hover 提亮为主题色 */
.dsmh-test-link { transition: color .15s ease; }
.dsmh-test-link:hover,
.dsmh-test-link:focus-visible { color: var(--dsw-alias-button-primary-fill, #4f46e5); }
`
  document.head.appendChild(el)
}

export function apply(ctx: ClientContext): void {
  const React = getReact()
  ensureStatusCss()
  ensureNavIconCss()
  // 注册 zh/en 词典；t 每次调用读取当前激活语言
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-model-health: dictionaries')
  const t = ctx.locale.bind(NS)

  // 给本插件的设置导航行打 marker，CSS 用 mask 注入脉搏线图标。
  // 必须先有 t 再 effect：marker 需要 label 解析器（locale 切换会重新求值）。
  // effect 包装负责在 HMR / 插件卸载时执行返回的 disposer。
  ctx.effect(
    () => registerSettingsNavIcon(() => t('tab')),
    'dsh-model-health: settings navigation icon',
  )

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
