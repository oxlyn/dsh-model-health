# dsh-model-health

> DeepSeek Harness (DSH) 插件：在设置页展示「模型健康」面板——列出所有已配置模型，并支持一键批量测试可用性与延迟。

## 功能 / Features

读取 `$DSH_HOME/settings.yaml`（默认 `~/.dsh/settings.yaml`），提供三种使用方式：

| # | 形式 | 入口 | 说明 |
|---|------|------|------|
| 1 | 设置页面板「模型健康」 | Web UI → 设置 → 模型健康 | React 表格：Provider / 模型 ID / 名称 / 上下文窗口 / 最大输出 / 输入模态 / API 协议 / BaseURL 等列（可选列可切换显示） |
| 2 | 一键测试全部 | 面板内「测试全部」按钮 | 并发（上限 6）对每个模型发一次 `max_tokens=1` 的最小 chat completions 请求，10s 超时；逐行显示 可用 / 不可用 / 跳过 / 延迟，失败原因悬停查看，结果持久化到 localStorage |
| 3 | Tool 插件 `list_models` | 对话中调用 | 返回 Markdown 表格，供模型在对话中查看模型清单 |

支持 `llm-pi-ai`（多协议自定义提供商）与 `llm-deepseek`（官方）两类配置；测试支持 `openai-completions` 与 `deepseek` 协议，其余标记为「跳过」。API Key 通过 DSH credential service 解析，不会输出到浏览器。

## 安装 / Install

一句话安装（npm 包，发布后可用）：

```sh
dsh plugin --profile my-profile add dsh-model-health
```

## 源码安装 / Install from source

```sh
git clone https://github.com/<你的用户名>/dsh-model-health.git
cd dsh-model-health
pnpm install
pnpm run build        # tsc → dist/index.js (pure ESM) + dist/client.js

# 在插件的父目录执行（dsh plugin add 的相对路径锚定调用目录）：
cd ..
dsh plugin --profile my-profile add ./dsh-model-health
dsh --profile my-profile
# 启动日志应出现：[dsh-model-health] ready — tool "list_models" + routes GET /api/model-health/json, POST /api/model-health/test
```

无 API key 也可验证加载：

```sh
dsh --profile my-profile --dump-config | grep dsh-model-health   # 配置层含本行
```

## Dependencies pinned / 依赖锁定

- `@deepseek-ai/dsh-tools`: `0.1.0-rc.8` (exact — the **`next`**-tag line; npm `latest` is stale).
- `@deepseek-ai/cordis`: `^4.0.1` (peerDependency — host provides it; types-only in code).

## Pitfalls / 坑（从真实 spike 提炼，防呆）

1. Node version: DSH requires Node ^22.19.0 || >=24.0.0. Older Node (e.g. v22.17) only warns EBADENGINE but may hit runtime issues — upgrade if you can.
   - Node 版本：DSH 要求 ^22.19.0 || >=24.0.0。旧版本（如 v22.17）只告警 EBADENGINE，不阻断，但建议升级。

2. npm dist-tag trap (the big one): `@deepseek-ai/dsh-tools` `latest` is a STALE 0.0.1-rc.1; the real line is under the `next` tag (0.1.0-rc.x). This scaffold pins the next-tag version for you — never `npm i @deepseek-ai/dsh-tools` over it.
   - npm dist-tag 坑（最大）：`@deepseek-ai/dsh-tools` 的 latest 是过期的 0.0.1-rc.1，正确版本在 next tag。本脚手架已锁 next 版本，勿再手动 npm i 覆盖。

3. Version-line alignment: keep every `@deepseek-ai/dsh-*` package on the same `0.1.0-rc.x` line so pnpm does not install two module copies.
   - 版本线对齐：所有 @deepseek-ai/dsh-* 包统一用同一 0.1.0-rc.x 线，避免 pnpm 装两份模块。

4. `@deepseek-ai/cordis` is a peerDependency: import only `type { Context }` (erased at compile). At runtime the host hands you `ctx` — never import cordis values at runtime.
   - @deepseek-ai/cordis 是 peerDep：只 import type（编译期擦除），运行时 ctx 由宿主传入。

5. Pure ESM: package.json must set `"type": "module"`; build with `module: esnext` + `moduleResolution: bundler` to keep bare specifiers.
   - 纯 ESM：package.json 必须 "type": "module"；tsc 用 module:esnext + moduleResolution:bundler 保留 bare specifier。

6. `dsh plugin add <dir>` anchors relative paths to the INVOKING directory — run it from the parent directory, not from inside the plugin.
   - dsh plugin add <dir> 的相对路径锚定调用目录——要在插件的父目录执行。

7. In the bundle `cordis.patch.yml`, `name` is a package name (resolved via node_modules / `$DSH_HOME/profiles/node_modules`), not a relative path.
   - bundle 的 cordis.patch.yml 里 name 用包名（走 node_modules 解析），不要用相对路径。

8. Registrations are effects: `ctx.tools.register()` / `ctx.on()` auto-dispose on unload. Wrap your OWN resources (timers/connections) in `ctx.effect(() => { acquire; return cleanup })`.
   - 注册是 effect：ctx.tools.register()/ctx.on() 卸载自动清理；自己的资源（timer/连接）要包 ctx.effect(() => {…; return cleanup})。

9. Load order = service dependencies, never file order: `export const inject = ['tools']` makes the plugin wait until `ctx.tools` is ready.
   - 加载顺序靠服务依赖（inject），不靠文件顺序。

10. Full end-to-end (model actually calls your tool) needs `DEEPSEEK_API_KEY`; without it `--verify` proves load/list/event, and the model call fails with MISSING_CREDENTIAL.
    - 端到端（模型真正调工具）需 DEEPSEEK_API_KEY；无 key 时 --verify 只能证明加载/列出/事件，模型调用会 MISSING_CREDENTIAL。
