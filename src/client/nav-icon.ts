// 设置导航「模型健康」行的图标替换。
//
// 背景：DSH 0.1.x 的 settings.section slot 契约只携带 id / order / label，
// 宿主 ui-settings-general 把所有未知 section id 一律回退到齿轮。插件无法
// 官方声明自己的导航图标。临时方案：JS 精准打 marker，CSS 用 ::before + mask
// 把齿轮 svg 隐藏、注入想要的图形，颜色继承 currentColor 随主题走。
//
// 参考：dsh-better-sidebar 的 src/client/settings-nav-icon.ts（同样的方案）。
// 等 settings.section 契约补上 icon 字段，这部分就可以删了。

/** 本插件导航行按钮的 marker（参考 better-sidebar 的命名风格） */
export const SETTINGS_NAV_MARKER = 'data-dsh-model-health-settings-nav'

/**
 * 在设置弹窗挂载期间，给本插件的导航行按钮持续打上 marker。
 * label 解析器返回当前激活语言的 tab 文案（i18n 切换会重新求值），与导航行
 * 按钮的 textContent 严格相等才算匹配——保证不会误伤其他插件的同名/相似 section。
 * @param label - locale-aware label resolver used by the section registration
 * @returns disposer: HMR / 插件卸载时断开观察器并清理已打的 marker
 */
export function registerSettingsNavIcon(label: () => string): () => void {
  let disposed = false
  // rAF 合帧：MutationObserver 会高频触发（尤其 characterData），把全量
  // querySelectorAll 合并到每帧最多一次，避免拖慢设置弹窗的渲染
  let scheduled = false

  const run = (): void => {
    if (disposed) return
    const currentLabel = label().trim()
    const buttons = document.querySelectorAll<HTMLButtonElement>('[role="dialog"] nav button')
    for (let i = 0; i < buttons.length; i++) {
      const button = buttons[i]
      const matches = currentLabel.length > 0 && button.textContent && button.textContent.trim() === currentLabel
      if (matches) button.setAttribute(SETTINGS_NAV_MARKER, '')
      else button.removeAttribute(SETTINGS_NAV_MARKER)
    }
  }

  const sync = (): void => {
    if (scheduled || disposed) return
    scheduled = true
    requestAnimationFrame(() => {
      scheduled = false
      run()
    })
  }

  run()
  // childList+subtree 覆盖弹窗挂载/卸载；characterData 覆盖 i18n 切换只改文本
  // 节点的情形——漏掉这一项就是「英文/中文切换后齿轮又回来」的根因
  const observer = new MutationObserver(sync)
  observer.observe(document.body, { childList: true, subtree: true, characterData: true })

  return () => {
    disposed = true
    observer.disconnect()
    document.querySelectorAll(`[${SETTINGS_NAV_MARKER}]`)
      .forEach((el) => { el.removeAttribute(SETTINGS_NAV_MARKER) })
  }
}

/** 注入图标样式：隐藏 marker 行的齿轮 svg，用 ::before 注入脉搏线（mask 方案）。
 *  16px 与宿主图标节奏一致；background: currentColor 让颜色跟随 nav 文案色
 *  （普通态 / hover / 选中态 / 明暗主题全自动）。 */
export function ensureNavIconCss(): void {
  const id = 'dsh-model-health-nav-icon-style'
  if (document.getElementById(id)) return
  const el = document.createElement('style')
  el.id = id
  // data: URL 里的 svg 用 stroke='black' 描边；实际显示颜色由 currentColor 提供
  const mask = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='22 12 18 12 15 21 9 3 6 12 2 12'/%3E%3C/svg%3E\") center / contain no-repeat"
  el.textContent = `
[data-dsh-model-health-settings-nav] > svg:first-child { display: none; }
[data-dsh-model-health-settings-nav]::before {
  content: '';
  flex: none;
  width: 16px;
  height: 16px;
  background: currentColor;
  -webkit-mask: ${mask};
          mask: ${mask};
}
`
  document.head.appendChild(el)
}
