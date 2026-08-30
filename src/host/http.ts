// HTTP 工具：统一 JSON 响应与请求体读取。

import type { IncomingMessage, ServerResponse } from 'node:http'

/** 统一 JSON 响应：设状态码 + Content-Type + 序列化输出。 */
export function sendJson(res: ServerResponse, code: number, obj: unknown): void {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(obj))
}

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'])

/**
 * 浏览器跨站请求会携带 Origin 头：要求其指向本机（无 Origin 的请求——
 * curl / 服务间调用——放行）。与 readJsonBody 的 Content-Type 门卫叠加，
 * 构成写路由（POST /test）的双层 CSRF/SSRF 缓解。
 */
export function isLocalOrigin(req: IncomingMessage): boolean {
  const origin = String(req.headers.origin ?? '')
  if (!origin) return true
  try {
    return LOCAL_HOSTNAMES.has(new URL(origin).hostname.toLowerCase())
  } catch {
    return false
  }
}

/** 读 JSON body（限 64KB），且必须是 application/json（兼作 CSRF 门卫）。 */
export async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const ct = String(req.headers['content-type'] ?? '')
  if (!ct.includes('application/json')) {
    throw new Error('Content-Type 必须是 application/json')
  }
  let body = ''
  for await (const chunk of req) {
    body += chunk
    if (body.length > 65536) throw new Error('请求体过大')
  }
  if (body === '') return {}
  const parsed = JSON.parse(body) as unknown
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('请求体必须是 JSON 对象')
  }
  return parsed as Record<string, unknown>
}
