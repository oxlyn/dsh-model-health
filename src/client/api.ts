// host 侧 HTTP API 的浏览器端封装（纯 fetch，不含任何 UI 状态）。

import type { HealthJson, TestResult } from './types'

/** 拉取已配置模型列表；网络层错误抛出，业务语义（ok:false）交由调用方处理。 */
export async function fetchModelList(): Promise<HealthJson> {
  const resp = await fetch('/api/model-health/json', { cache: 'no-store' })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  return resp.json()
}

/** 测试单个模型可用性；无论结果如何都解析为 TestResult（不抛错）。 */
export async function requestModelTest(key: string): Promise<TestResult> {
  try {
    const resp = await fetch('/api/model-health/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key }),
      cache: 'no-store',
    })
    const json = await resp.json()
    if (!json.ok) {
      return { status: 'fail', error: json.error as string | undefined }
    }
    return {
      status: (json.status as TestResult['status']) || 'fail',
      latency: json.latency as number | undefined,
      error: json.error as string | undefined,
    }
  } catch (e) {
    return { status: 'fail', error: (e as Error).message }
  }
}
