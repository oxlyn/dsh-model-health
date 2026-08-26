# dsh-model-health 项目总结

> 生成时间：2026-08-21
> 项目路径：`/Users/lin/Projects/dsh-model-test/dsh-model-health`

## 一、项目定位

**dsh-model-health** 是一个 [DeepSeek Harness (DSH)](https://www.npmjs.com/package/create-dsh-plugin) 工具插件，由 `create-dsh-plugin` 脚手架生成。

核心能力：读取 `$DSH_HOME/settings.yaml` 配置，把当前已配置的所有模型以表格形式展示出来，并支持对单个模型发起最小化连通性测试。

- **版本**：0.1.0
- **协议**：MIT
- **模块类型**：纯 ESM（`"type": "module"`）
- **主入口**：`./dist/index.js`

## 二、目录结构

```
dsh-model-health/
├── src/
│   ├── index.ts            # host 入口（Tool + HTTP 路由接线，薄装配层）
│   ├── host/               # host 实现
│   │   ├── config.ts       #   settings.yaml 读取/解析（mtime 缓存）
│   │   ├── models.ts       #   模型收集 + toPublicRow
│   │   ├── markdown.ts     #   list_models 表格渲染
│   │   ├── http.ts         #   JSON 响应 / 请求体工具
│   │   ├── model-test.ts   #   单模型测试 handler 工厂
│   │   └── services.d.ts   #   webServer / credentials 类型补充
│   ├── client.tsx          # 浏览器入口壳（注入 React，装配导出）
│   └── client/             # client 实现
│       ├── types.ts        #   领域类型 + 运行时服务接口
│       ├── runtime.ts      #   React 注入容器（加载器契约解耦点）
│       ├── i18n.ts         #   zh/en 词典
│       ├── storage.ts      #   localStorage 持久化
│       ├── api.ts          #   host HTTP API 封装
│       ├── styles.ts       #   内联样式表
│       ├── columns.ts      #   列定义 + 状态视觉映射
│       ├── use-test-results.ts  # 测试状态机 hook
│       ├── apply.tsx       #   服务接线（词典 + slot 注册）
│       └── components/     #   ModelListSection / StatusCell / ErrorTooltip
├── cordis.patch.yml    # bundle 层 patch 声明（注册到 profile）
├── package.json        # 依赖、构建脚本、dsh 字段
├── tsconfig.json       # TypeScript 配置（ESM + bundler 解析）
├── README.md           # 使用说明与避坑指南
└── .gitignore
```

构建产物（`dist/`）：
- `dist/index.js` —— tsdown 打包的 Node ESM（依赖外部化）
- `dist/client.js` —— 由 tsdown 从 `src/client.tsx` 打包为 IIFE（JSX 编译为 React.createElement，react 运行时仍由 harness require() 提供）

## 三、核心功能

插件对外暴露三个能力，均在 `src/index.ts` 的 `apply(ctx)` 中注册：

| # | 能力 | 触发方式 | 输出 |
|---|------|---------|------|
| 1 | Tool `list_models` | 对话中模型调用 | Markdown 表格（含 Provider / 模型 ID / 名称 / 上下文窗口 / 最大输出 / 输入模态 / API 协议 / BaseURL） |
| 2 | HTTP 路由 `GET /api/model-health/json` | client 侧 `fetch` | JSON `{ ok, count, source, updatedAt, models[] }`，已剔除 `apiKeyEnv` 字段 |
| 3 | HTTP 路由 `POST /api/model-health/test` | client 侧"测试全部"按钮 | JSON `{ ok, index, status, latency?, error? }`，对单模型发一次 `max_tokens=1` 的最小 chat completions 请求，10s 超时 |

### 数据来源

`settings.yaml` 解析逻辑见 `collectModels(cfg)`，覆盖两类 provider：

1. **`llm-pi-ai`**：通用多协议提供商，按 `providers.<route>` 遍历，每条 route 下可挂多个 model；模型字段缺省时回退到 provider 级默认值（`defaultContextWindow` / `defaultMaxTokens` / `defaultInput`）。
2. **`llm-deepseek`**：官方 DeepSeek 提供商，固定 `api=deepseek`、`baseURL=https://api.deepseek.com`，`apiKeyEnv` 缺省回退到 `DEEPSEEK_API_KEY`。

### 安全设计

- `ModelRow.apiKeyEnv` 字段仅用于 host 侧测试，**不输出到 JSON**（`toPublicRow` 剥离）。
- API Key 不读进程环境变量，而是通过 DSH credential service `ctx.credentials.resolve(ref)` 解析，避免明文泄露。

## 四、客户端 UI

`src/client.tsx` 是浏览器入口壳：通过 DSH 浏览器模块加载器 `window.__ModuleLoader__.load(...)` 注册，factory 内把宿主 React 注入 `client/runtime.ts` 容器；`apply()`（`client/apply.tsx`）向 `settings.section` 注入一个名为"模型列表"的 section。

组件 `ModelListSection` 特性：

- **数据获取**：`fetch('/api/model-health/json')` → 渲染表格
- **测试全部**：并发 `POST /api/model-health/test`，并发上限 6（worker pool），每完成一项即更新对应行状态徽章（未测试 / 测试中 / 可用 / 不可用 / 跳过）
- **结果持久化**：测试结果存 `localStorage`（key: `dsh-model-health:test-results`），刷新后仍可见
- **可选列**：模型 ID / 上下文窗口 / 最大输出 / 输入模态 / API 协议 / BaseURL 等列默认隐藏，通过 toggle 按钮组按需展开
- **Provider 合并**：相同 provider 的连续行 `rowSpan` 合并单元格
- **错误 tooltip**：失败状态 hover 时显示全宽 tooltip，悬停行正上方展示错误信息
- **主题适配**：全部使用 DSH CSS 变量（`--dsw-alias-*`），自动适配明暗主题

## 五、构建与发布

### 构建

```sh
pnpm install
pnpm run build        # tsdown → dist/index.js + dist/client.js
pnpm run typecheck    # 仅类型检查，不产物
```

TypeScript 配置要点：
- `module: esnext` + `moduleResolution: bundler` —— 保留 bare specifier
- `verbatimModuleSyntax: true` —— 强制 `import type` 编译期擦除
- `target: es2022`、`strict: true`

### 发布字段（package.json `dsh`）

```json
{
  "bundle": { "patch": "./cordis.patch.yml" },
  "client": {
    "inject": ["@deepseek-ai/dsh-client-runtime", "@deepseek-ai/dsh-client-ui-settings"],
    "platform": "web"
  }
}
```

- `bundle.patch`：指向 `cordis.patch.yml`，声明该 bundle 在 profile 中注册的层（`id: dsh-model-health`，`name: dsh-model-health` 走包名解析）
- `client.inject`：浏览器侧运行时依赖
- `files`：仅发布 `dist/` 与 `cordis.patch.yml`

## 六、依赖

| 依赖 | 版本 | 角色 |
|------|------|------|
| `@deepseek-ai/dsh-tools` | `0.1.0-rc.8`（精确锁） | `defineTool()` 工具注册 API |
| `@deepseek-ai/cordis` | `^4.0.1`（peer） | 仅 import `type { Context }`，运行时由宿主提供 |
| `js-yaml` | `^4.1.0` | 解析 `settings.yaml` |
| `typescript` / `@types/node` / `@types/js-yaml` | dev | 构建期 |

### 关键避坑点（README 已固化）

1. **Node 版本**：DSH 要求 `^22.19.0 || >=24.0.0`，旧版只告警 EBADENGINE 但有运行时风险。
2. **npm dist-tag 陷阱**：`@deepseek-ai/dsh-tools` 的 `latest` 是过期 0.0.1-rc.1，真实版本在 `next` tag，本插件已锁定 `0.1.0-rc.8`，勿手动覆盖。
3. **版本线对齐**：所有 `@deepseek-ai/dsh-*` 包须同处一条 `0.1.0-rc.x` 线，否则 pnpm 装两份模块。
4. **cordis 是 peer**：只 `import type`，运行时 `ctx` 由宿主注入，**勿** import cordis 运行时值。
5. **纯 ESM**：`package.json` 必须 `"type": "module"`。
6. **`dsh plugin add <dir>` 相对路径锚定调用目录**：要在插件父目录执行。
7. **`cordis.patch.yml` 的 `name` 是包名**（走 node_modules 解析），不是相对路径。
8. **注册即 effect**：`ctx.tools.register()` / `ctx.on()` 自动清理；自有资源须包 `ctx.effect(() => { ... return cleanup })`。
9. **加载顺序靠 inject**：`export const inject = ['tools', 'webServer', 'credentials']` 让插件等服务就绪后再加载。
10. **端到端需 `DEEPSEEK_API_KEY`**：无 key 时只能验证加载/列出/事件，模型调用会 `MISSING_CREDENTIAL`。

## 七、安装与验证

```sh
# 从父目录安装到指定 profile
dsh plugin --profile my-profile add ./dsh-model-health
dsh --profile my-profile       # 关注日志：[dsh-model-health] ready — ...

# 无 key 验证
dsh --profile my-profile --dump-config | grep dsh-model-health
dsh plugin --profile headless add ./dsh-model-health
dsh --profile headless "run a probe"
```

## 八、类型扩展

由于 DSH 上层服务（`webServer`、`credentials`）的类型不在 cordis 核心包中，`src/index.ts` 用 `declare module '@deepseek-ai/cordis'` 对 `Context` 接口做了局部扩展：

```ts
interface Context {
  webServer: { register(route: WebRoute): () => void }
  credentials: { resolve(ref: string): Promise<{ value: string } | undefined> }
}
```

## 九、总结

| 维度 | 评价 |
|------|------|
| 功能完整度 | 工具 + JSON 接口 + 测试接口 + 设置页 UI 四位一体，覆盖查看与连通性测试两个场景 |
| 安全性 | API Key 不落 client、走 credential service，公开字段已剥离 |
| 工程质量 | 严格 TS、纯 ESM、依赖精确锁、避坑文档完备 |
| 可维护性 | 服务端逻辑集中在 `index.ts` 单文件，client 是无构建的预编译 IIFE，结构清晰 |
| 可扩展性 | 新增协议测试或列字段只需改 `collectModels` 与 `COLUMNS`，改动局部 |

该项目是一个"麻雀虽小五脏俱全"的 DSH 插件样板：既演示了 Tool 注册、HTTP 路由、credential 解析三个 host 侧能力，又演示了 client 侧 slots 注入与 React 渲染，可作为后续 DSH 插件开发的参考模板。
