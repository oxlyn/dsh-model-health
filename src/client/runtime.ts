// React 注入容器。
//
// DSH 浏览器侧的模块加载器约定：React 只能通过 factory(require("react"))
// 在入口处获取，无法作为普通 ESM 导入。为了让其余 UI 模块与加载器契约解耦，
// 入口在 factory 内调用 provideReact() 注入，各组件通过 getReact() 取用。

type ReactModule = typeof import('react')

let injected: ReactModule | null = null

/** 入口在 factory 内注入宿主提供的 React 实例。 */
export function provideReact(react: ReactModule): void {
  injected = react
}

/** 取用注入的 React。必须在 provideReact 之后（即任意渲染发生前）调用。 */
export function getReact(): ReactModule {
  if (!injected) {
    throw new Error('[dsh-model-health] React 尚未注入：entry 需先调用 provideReact()')
  }
  return injected
}
