// 单模型可用性测试：POST /api/model-health/test 的路由 handler 工厂。
// 测试语义：按 key 定位模型 → 发起一次最小 chat completions 请求（max_tokens=1，
// 超时 10s）→ 校验响应体确实是成功应答 → 返回 { ok, key, status, latency, error? }。

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readSettingsCached } from './config'
import { collectModels, type ModelRow } from './models'
import { readJsonBody, sendJson, isLocalOrigin } from './http'

/** 解析 API Key；失败/未配置返回 undefined。 */
export type ResolveApiKey = (ref: string) => Promise<string | undefined>

/** 错误体最多读这么多字节就提前取消（展示时也只取前 300 字符） */
const MAX_ERROR_BODY_BYTES = 1024
/** 成功响应体较大（含 usage 等），最多读 4KB 用于成功校验 */
const SUCCESS_BODY_MAX_CHARS = 4096
const PROBE_TIMEOUT_MS = 10_000

/** 读取响应体前若干字符：超大响应（如 HTML 错误页）不整体载入内存。 */
async function readBodySnippet(resp: Response, maxChars: number): Promise<string> {
  const len = Number(resp.headers.get('content-length') || 0)
  if (len > MAX_ERROR_BODY_BYTES) return ''
  const reader = resp.body?.getReader()
  if (!reader) return ''
  const decoder = new TextDecoder()
  let text = ''
  try {
    while (text.length < maxChars) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    // flush 多字节字符被截断的尾半部分，避免边界乱码
    text += decoder.decode()
  } finally {
    await reader.cancel().catch(() => {})
  }
  return text.slice(0, maxChars)
}

/** 校验 200 响应体确实是该协议的成功应答（部分网关 200 但 body 是错误对象）。 */
export function validateSuccessBody(_api: string, text: string): string | undefined {
  if (!text.trim()) return '响应体为空'
  let json: any
  try {
    json = JSON.parse(text)
  } catch {
    return '响应体不是合法 JSON'
  }
  if (json?.error) {
    const detail = typeof json.error === 'string' ? json.error : JSON.stringify(json.error)
    return `响应体含错误：${detail.slice(0, 200)}`
  }
  if (!Array.isArray(json?.choices)) return '响应缺少 choices 字段'
  return undefined
}

/** 发起最小测试请求（max_tokens=1，超时 10s），返回结果对象。 */
async function probeModel(row: ModelRow, apiKey: string): Promise<{
  status: 'ok' | 'fail'
  latency: number
  error?: string
}> {
  const url = row.baseURL.replace(/\/$/, '') + '/chat/completions'
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
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
    const latency = Date.now() - start
    // 响应体读取仍受 10s 超时约束：对端发完响应头后停滞不会永久挂起
    const snippet = await readBodySnippet(resp, resp.ok ? SUCCESS_BODY_MAX_CHARS : 300).catch(() => '')
    if (!resp.ok) {
      return { status: 'fail', latency, error: `HTTP ${resp.status}: ${snippet.slice(0, 300)}` }
    }
    const problem = validateSuccessBody(row.api, snippet)
    return problem ? { status: 'fail', latency, error: problem } : { status: 'ok', latency }
  } catch (e: any) {
    const latency = Date.now() - start
    const msg = e?.name === 'AbortError' ? `超时（${PROBE_TIMEOUT_MS / 1000}s）` : (e?.message || String(e))
    return { status: 'fail', latency, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

export function createTestRouteHandler(resolveApiKey: ResolveApiKey) {
  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 0. 本地性校验：测试接口会以宿主身份对外发请求，拒绝局域网内其他页面借
    //    CSRF 调用（浏览器跨站请求带 Origin 头；非浏览器/同源请求无此头，放行）
    if (!isLocalOrigin(req)) {
      sendJson(res, 403, { ok: false, error: '拒绝非本地来源的请求' })
      return
    }

    // 1. 解析并校验参数
    let key: unknown
    try {
      key = (await readJsonBody(req)).key
      if (typeof key !== 'string' || key === '') throw new Error('key 必须是非空字符串')
    } catch (e) {
      sendJson(res, 400, { ok: false, error: `参数错误：${(e as Error).message}` })
      return
    }

    // 2. 按 key 定位模型配置（settings 增删/排序后不错位）
    let row: ModelRow
    try {
      const rows = collectModels(readSettingsCached())
      const found = rows.find((r) => r.key === key)
      if (!found) {
        sendJson(res, 404, { ok: false, error: `未找到 key 为 ${key} 的模型（配置可能已变化，请刷新列表）` })
        return
      }
      row = found
    } catch (e) {
      sendJson(res, 500, { ok: false, error: (e as Error).message })
      return
    }

    // 3. 仅支持 openai-completions / deepseek 协议，其余跳过
    if (row.api !== 'openai-completions' && row.api !== 'deepseek') {
      sendJson(res, 200, {
        ok: true, key, status: 'skip',
        error: `不支持 ${row.api} 协议的测试`,
      })
      return
    }

    // 4. 解析 API Key（credential service 从 DSH secret store 读取，无需进程环境变量）
    let apiKey = ''
    if (row.apiKeyEnv) {
      apiKey = (await resolveApiKey(row.apiKeyEnv)) || ''
    }
    if (!apiKey) {
      sendJson(res, 200, {
        ok: true, key, status: 'fail',
        error: `未配置 ${row.apiKeyEnv} 的 API Key（请在 设置 → 模型 中添加）`,
      })
      return
    }

    // 5. 探测
    const probe = await probeModel(row, apiKey)
    sendJson(res, 200, { ok: true, key, ...probe })
  }
}
