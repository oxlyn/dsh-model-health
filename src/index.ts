// dsh-model-health — 在设置页展示模型列表的 DSH 插件。
//
// 提供两种查看方式：
// 1. Tool 插件 list_models：对话中调用，返回 Markdown 表格
// 2. HTTP 路由 /api/model-health/json：返回 JSON，供 client 侧 React 组件 fetch 后直接渲染
//
// API 参考（来自 DSH 源码类型定义）：
// - ctx.tools.register(defineTool({...}))  — @deepseek-ai/dsh-tools
// - ctx.webServer.register({kind,path,handler})  — @deepseek-ai/dsh-host-webserver
//   WebRoute = { kind: 'exact'|'prefix', path: string, handler: (req,res)=>void }
//
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { readFileSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { load as parseYaml } from 'js-yaml'

// 为 ctx.webServer 和 ctx.credentials 补类型声明（DSH 运行时上层服务，类型不在 cordis 核心中）
declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
    }
    // DSH credential service：通过环境变量名解析 API Key
    // resolve(ref) 返回 { value } 或 undefined
    credentials: {
      resolve(ref: string): Promise<{ value: string } | undefined>
    }
  }
}

export const name = 'dsh-model-health'

// 声明所有用到的服务：
// - tools：Tool 插件
// - webServer：HTTP 路由
// - credentials：通过 apiKeyEnv 名解析实际 API Key（DSH 的 credential seam）
export const inject = ['tools', 'webServer', 'credentials']

export interface ModelRow {
  provider: string
  displayName: string
  modelId: string
  modelName: string
  contextWindow: number | string
  maxTokens: number | string
  input: string
  api: string
  baseURL: string
  /** 环境变量名（不输出到 JSON，仅 host 侧测试用） */
  apiKeyEnv: string
}

/** JSON 输出时去掉 apiKeyEnv（不暴露到浏览器） */
function toPublicRow(r: ModelRow) {
  const { apiKeyEnv: _omit, ...public_ } = r
  return public_
}

/** 解析 DSH 配置目录：优先 $DSH_HOME，回退到 ~/.dsh。 */
function dshHome(): string {
  return process.env.DSH_HOME || join(homedir(), '.dsh')
}

/** 读取并解析 settings.yaml。 */
function readSettings(): Record<string, any> {
  const settingsPath = join(dshHome(), 'settings.yaml')
  let raw: string
  try {
    raw = readFileSync(settingsPath, 'utf8')
  } catch (e) {
    throw new Error(
      `无法读取 settings.yaml (${settingsPath})：${(e as Error).message}。` +
      `请在 设置 → 模型 中配置后重试。`
    )
  }
  const cfg = parseYaml(raw) as Record<string, any>
  return cfg && typeof cfg === 'object' ? cfg : {}
}

/** 从 settings 配置对象中收集所有已配置的模型。 */
export function collectModels(cfg: Record<string, any>): ModelRow[] {
  const rows: ModelRow[] = []

  // 1. 通用多协议提供商 llm-pi-ai
  const piAi = cfg['llm-pi-ai']
  if (piAi && typeof piAi === 'object') {
    const providers = piAi.providers || {}
    for (const [route, p] of Object.entries(providers as Record<string, any>)) {
      if (!p || typeof p !== 'object') continue
      const models = Array.isArray(p.models) ? p.models : []
      for (const m of models) {
        rows.push({
          provider: route,
          displayName: p.displayName || route,
          modelId: m.id || '',
          modelName: m.name || m.id || '',
          contextWindow: m.contextWindow ?? p.defaultContextWindow ?? '-',
          maxTokens: m.maxTokens ?? p.defaultMaxTokens ?? '-',
          input: Array.isArray(m.input) ? m.input.join('/')
            : (p.defaultInput || ['text']).join('/'),
          api: p.api || '-',
          baseURL: p.baseURL || '-',
          apiKeyEnv: p.apiKeyEnv || '',
        })
      }
    }
  }

  // 2. 官方 DeepSeek 提供商 llm-deepseek
  const ds = cfg['llm-deepseek']
  if (ds && typeof ds === 'object') {
    const models = Array.isArray(ds.models) ? ds.models : []
    for (const m of models) {
      rows.push({
        provider: 'deepseek',
        displayName: 'DeepSeek',
        modelId: m.id || '',
        modelName: m.name || m.id || '',
        contextWindow: m.contextWindow ?? '-',
        maxTokens: m.maxTokens ?? '-',
        input: Array.isArray(m.input) ? m.input.join('/') : 'text',
        api: 'deepseek',
        baseURL: 'https://api.deepseek.com',
        apiKeyEnv: ds.apiKeyEnv || 'DEEPSEEK_API_KEY',
      })
    }
  }

  return rows
}

/** 渲染为 Markdown 表格。 */
function renderMarkdownTable(rows: ModelRow[]): string {
  if (rows.length === 0) {
    return [
      '当前 settings.yaml 中未配置任何模型。',
      '',
      '请在 Web UI 的 设置 → 模型 中添加 DeepSeek API Key 或自定义提供商。',
      `配置文件位置：${join(dshHome(), 'settings.yaml')}`,
    ].join('\n')
  }

  const header = '| # | Provider | 模型 ID | 名称 | 上下文窗口 | 最大输出 | 输入模态 | API 协议 | BaseURL |'
  const sep    = '|---|----------|---------|------|-----------|---------|---------|---------|---------|'
  const lines = rows.map((r, i) => {
    return `| ${i + 1} | ${r.provider} | ${r.modelId} | ${r.modelName} | ${r.contextWindow} | ${r.maxTokens} | ${r.input} | ${r.api} | ${r.baseURL} |`
  })

  return [
    `已配置 **${rows.length}** 个模型：`,
    '',
    header,
    sep,
    ...lines,
    '',
    `_来源：${join(dshHome(), 'settings.yaml')}_`,
  ].join('\n')
}

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
      const cfg = readSettings()
      return renderMarkdownTable(collectModels(cfg))
    },
  }))

  // ── 2. HTTP 路由（返回 JSON，供 client 侧 React 组件 fetch）─────────
  //    API: ctx.webServer.register({ kind, path, handler })
  //    handler 签名: (req: IncomingMessage, res: ServerResponse) => void
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/model-health/json',
    handler: (_req, res) => {
      try {
        const cfg = readSettings()
        const rows = collectModels(cfg)
        const payload = JSON.stringify({
          ok: true,
          count: rows.length,
          source: join(dshHome(), 'settings.yaml'),
          updatedAt: new Date().toISOString(),
          models: rows.map(toPublicRow),
        })
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(payload)
      } catch (e) {
        const payload = JSON.stringify({
          ok: false,
          error: `读取模型列表失败：${(e as Error).message}`,
        })
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(payload)
      }
    },
  })

  // ── 3. HTTP 路由（测试单个模型可用性）──────────────────────────────
  //    POST /api/model-health/test  body: { "index": <number> }
  //    对该模型发起一次最小 chat completions 请求，返回 { ok, index, status, latency, error? }
  ctx.webServer.register({
    kind: 'exact',
    path: '/api/model-health/test',
    handler: async (req, res) => {
      // 读取请求体
      let body = ''
      for await (const chunk of req) body += chunk
      let index: number
      try {
        index = JSON.parse(body || '{}').index
        if (typeof index !== 'number' || !Number.isInteger(index) || index < 0) {
          throw new Error('index 必须是非负整数')
        }
      } catch (e) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: `参数错误：${(e as Error).message}` }))
        return
      }

      // 查找模型配置
      let row: ModelRow
      try {
        const cfg = readSettings()
        const rows = collectModels(cfg)
        const found = rows[index]
        if (!found) {
          res.statusCode = 404
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: false, error: `未找到索引为 ${index} 的模型` }))
          return
        }
        row = found
      } catch (e) {
        res.statusCode = 500
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: false, error: (e as Error).message }))
        return
      }

      // 仅支持 openai-completions 协议
      if (row.api !== 'openai-completions' && row.api !== 'deepseek') {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          ok: true, index, status: 'skip',
          error: `不支持 ${row.api} 协议的测试`,
        }))
        return
      }

      // 获取 API Key
      // 通过 DSH credential service 解析 API Key
      // credentials.resolve(ref) 从 DSH 的 secret store 读取，无需进程环境变量
      let apiKey = ''
      if (row.apiKeyEnv) {
        try {
          const hit = await ctx.credentials.resolve(row.apiKeyEnv)
          apiKey = hit?.value || ''
        } catch (e) {
          // resolve 可能抛错（如 ref 未配置），按未设置处理
        }
      }
      if (!apiKey) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({
          ok: true, index, status: 'fail',
          error: `未配置 ${row.apiKeyEnv} 的 API Key（请在 设置 → 模型 中添加）`,
        }))
        return
      }

      // 发起最小测试请求（max_tokens=1，超时 10s）
      const url = row.baseURL.replace(/\/$/, '') + '/chat/completions'
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 10000)
      const start = Date.now()

      try {
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: row.modelId,
            messages: [{ role: 'user', content: 'hi' }],
            max_tokens: 1,
            stream: false,
          }),
          signal: controller.signal,
        })
        clearTimeout(timer)
        const latency = Date.now() - start

        if (resp.ok) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ ok: true, index, status: 'ok', latency }))
        } else {
          const text = await resp.text().catch(() => '')
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({
            ok: true, index, status: 'fail', latency,
            error: `HTTP ${resp.status}: ${text.slice(0, 300)}`,
          }))
        }
      } catch (e: any) {
        clearTimeout(timer)
        const latency = Date.now() - start
        const msg = e?.name === 'AbortError' ? '超时（10s）' : (e?.message || String(e))
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        res.end(JSON.stringify({ ok: true, index, status: 'fail', latency, error: msg }))
      }
    },
  })

  console.log(
    `[dsh-model-health] ready — tool "list_models" + routes GET /api/model-health/json, POST /api/model-health/test`,
  )
}
