// 测试结果的 localStorage 持久化：刷新页面后仍可见上次结果。

import type { TestResult, TestStatus } from './types'

const STORAGE_KEY = 'dsh-model-health:test-results'

const VALID_STATUSES = new Set<TestStatus>(['idle', 'testing', 'ok', 'fail', 'skip'])

/**
 * 清洗任意来源（localStorage / 旧版本数据）的结果对象：
 * - 残留的 testing（测试中刷新页面）归一为 idle
 * - 旧版按数组下标存的纯数字 key 直接丢弃
 * 纯函数，可单测。
 */
export function sanitizeStoredResults(parsed: unknown): Record<string, TestResult> {
  const cleaned: Record<string, TestResult> = {}
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return cleaned
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (/^\d+$/.test(k)) continue
    if (!v || typeof v !== 'object') continue
    const raw = v as Record<string, unknown>
    const status = raw.status as TestStatus
    if (!VALID_STATUSES.has(status)) continue
    const result: TestResult = {
      status: status === 'testing' ? 'idle' : status,
    }
    if (typeof raw.latency === 'number' && raw.latency >= 0) result.latency = raw.latency
    if (typeof raw.error === 'string') result.error = raw.error
    cleaned[k] = result
  }
  return cleaned
}

export function loadStoredResults(): Record<string, TestResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? sanitizeStoredResults(JSON.parse(raw)) : {}
  } catch {
    return {}
  }
}

export function saveStoredResults(results: Record<string, TestResult>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(results))
  } catch {
    // ignore quota errors
  }
}
