// dsh-model-health — client 侧入口壳（浏览器端模块）。
//
// 构建产物 dist/client.js 保持 DSH 浏览器侧的模块加载器格式：
//   window.__ModuleLoader__.load({ id, factory: (require) => {...} })
//
// factory 只做一件事：把宿主提供的 React 注入 runtime 容器，
// 然后返回 apply.tsx 装配好的插件导出。其余功能全部位于 src/client/*：
//
//   types.ts        领域类型 + 运行时服务接口
//   runtime.ts      React 注入容器（加载器契约与 UI 的解耦点）
//   i18n.ts         zh/en 词典
//   storage.ts      测试结果 localStorage 持久化
//   api.ts          host HTTP API 封装
//   styles.ts       内联样式表
//   columns.ts      列定义 + 状态视觉映射
//   use-test-results.ts  测试状态机 hook（单测/测试全部）
//   components/     ModelListSection / StatusCell / ErrorTooltip
//   apply.tsx       服务接线（注册词典与 slot）

import { provideReact } from './client/runtime'
import { apply, inject } from './client/apply'

window.__ModuleLoader__.load({
  id: 'dsh-model-health',
  factory: (require) => {
    // React 由 harness 加载器在运行时提供，全应用共享同一实例
    provideReact(require('react'))
    return { apply, inject }
  },
})
