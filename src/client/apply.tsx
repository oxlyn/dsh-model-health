// client 插件装配点：注册词典与 settings.section slot。
// UI 渲染入口为 ModelListSection；本模块只做服务接线。

import type { ClientContext } from './types'
import { getReact } from './runtime'
import { NS, zh, en } from './i18n'
import { ModelListSection } from './components/ModelListSection'

/** client 侧依赖：slots（注册 UI slot 的服务）+ locale（多语言词典） */
export const inject = ['slots', 'locale']

/** 注入测试中圆点的脉冲动画 keyframes（内联样式无法定义 @keyframes）。 */
function ensureStatusCss(): void {
  const id = 'dsh-model-health-status-style'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  el.textContent = '@keyframes dsmh-pulse { 0%,100% { opacity:1; } 50% { opacity:.25; } }'
  document.head.appendChild(el)
}

export function apply(ctx: ClientContext): void {
  const React = getReact()
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
