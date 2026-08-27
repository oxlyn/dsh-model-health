// 单模型可用性测试：POST /api/model-health/test 的路由 handler 工厂。
// 测试语义：按 key 定位模型 → 发起一次最小 chat completions 请求（max_tokens=1，
// 超时 10s）→ 返回 { ok, key, status, latency, error? }。

import type { IncomingMessage, ServerResponse } from 'node:http'
import { readSettingsCached } from './config'
import { collectModels, type ModelRow } from './models'
import { readJsonBody, sendJson } from './http'

/** 通过 DSH credential service 解析 API Key；失败/未配置返回 undefined。 */
export type ResolveApiKey = (ref: string) => Promise<string | undefined>

/** 发起最小测试请求（max_tokens=1，超时 10s），返回结果对象。 */
async function probeModel(row: ModelRow, apiKey: string): Promise<{
  status: 'ok' | 'fail'
  latency: number
  error?: string
}> {
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
    const latency = Date.now() - start
    if (resp.ok) {
      clearTimeout(timer)
      return { status: 'ok', latency }
    }
    // 错误体读取仍受 10s 超时约束：对端发完响应头后停滞不会永久挂起
    const text = await resp.text().catch(() => '')
    clearTimeout(timer)
    return { status: 'fail', latency, error: `HTTP ${resp.status}: ${text.slice(0, 300)}` }
  } catch (e: any) {
    clearTimeout(timer)
    const latency = Date.now() - start
    const msg = e?.name === 'AbortError' ? '超时（10s）' : (e?.message || String(e))
    return { status: 'fail', latency, error: msg }
  }
}

export function createTestRouteHandler(resolveApiKey: ResolveApiKey) {
  return async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
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
