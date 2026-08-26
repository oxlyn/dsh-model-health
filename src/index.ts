// dsh-model-health — host 侧入口（cordis 插件）。
//
// 本文件只做服务接线：注册 list_models 工具 + 两条 HTTP 路由。
// 具体实现按职责拆分于 src/host/*：
//
//   config.ts      settings.yaml 读取/解析（mtime 缓存）
//   models.ts      模型收集（llm-pi-ai / llm-deepseek）
//   markdown.ts    list_models 的 Markdown 表格渲染
//   http.ts        JSON 响应 / 请求体读取工具
//   model-test.ts  POST /api/model-health/test 的 handler 工厂
//   services.d.ts  webServer / credentials 服务类型补充
//
// API 参考（来自 DSH 源码类型定义）：
// - ctx.tools.register(defineTool({...}))  — @deepseek-ai/dsh-tools
// - ctx.webServer.register({kind,path,handler})  — @deepseek-ai/dsh-host-webserver

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { join } from 'node:path'
import { readSettingsCached, dshHome } from './host/config'
import { collectModels, toPublicRow } from './host/models'
import { renderMarkdownTable } from './host/markdown'
import { sendJson } from './host/http'
import { createTestRouteHandler } from './host/model-test'

export const name = 'dsh-model-health'

// 声明所有用到的服务：
// - tools：Tool 插件
// - webServer：HTTP 路由
// - credentials：通过 apiKeyEnv 名解析实际 API Key（DSH 的 credential seam）
export const inject = ['tools', 'webServer', 'credentials']

export function apply(ctx: Context) {
  // ── 1. Tool 插件（对话中调用，返回 Markdown 表格）──────────────────
  ctx.tools.register(defineTool({
    name: 'list_models',
    description:
      '列出当前 DSH 配置（$DSH_HOME/settings.yaml）中已配置的所有模型，' +
      '以 Markdown 表格展示。用于在对话中查看当前可用模型清单。',
    parameters: {},
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text', text: value }],
    },
    async execute() {
      return renderMarkdownTable(collectModels(readSettingsCached()))
    },
  }))

  // ── 2. HTTP 路由（返回 JSON，供 client 侧 React 组件 fetch）─────────
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/model-health/json',
    handler: (_req, res) => {
      try {
        const rows = collectModels(readSettingsCached())
        sendJson(res, 200, {
          ok: true,
          count: rows.length,
          source: join(dshHome(), 'settings.yaml'),
          updatedAt: new Date().toISOString(),
          models: rows.map(toPublicRow),
        })
      } catch (e) {
        sendJson(res, 500, { ok: false, error: `读取模型列表失败：${(e as Error).message}` })
      }
    },
  })

  // ── 3. HTTP 路由（测试单个模型可用性）──────────────────────────────
  //    POST /api/model-health/test  body: { "key": "<provider>/<modelId>" }
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/model-health/test',
    handler: createTestRouteHandler(async (ref) => {
      try {
        // credentials.resolve 从 DSH 的 secret store 读取；
        // resolve 可能抛错（如 ref 未配置），按未设置处理
        return (await ctx.credentials.resolve(ref))?.value
      } catch {
        return undefined
      }
    }),
  })

  console.log(
    `[dsh-model-health] ready — tool "list_models" + routes GET /api/model-health/json, POST /api/model-health/test`,
  )
}
