// 测试结果的 localStorage 持久化：刷新页面后仍可见上次结果。

import type { TestResult } from './types'

const STORAGE_KEY = 'dsh-model-health:test-results'

export function loadStoredResults(): Record<string, TestResult> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    const cleaned: Record<string, TestResult> = {}
    // 清理：残留的 testing（测试中刷新页面）归一为 idle；
    // 旧版按数组下标存的纯数字 key 直接丢弃
    for (const k in parsed) {
      if (/^\d+$/.test(k)) continue
      const v = parsed[k]
      if (!v || typeof v !== 'object') continue
      cleaned[k] = v.status === 'testing' ? { status: 'idle' } : v
    }
    return cleaned
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
