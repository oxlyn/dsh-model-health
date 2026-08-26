// 测试状态管理 hook：「测试全部」与行内「测试」按钮共用的状态机。
// 纯逻辑（无 JSX）；React hooks 经 runtime 容器获取。

import type { ModelRow, TestResult } from './types'
import { getReact } from './runtime'
import { loadStoredResults, saveStoredResults } from './storage'
import { requestModelTest } from './api'

/** 并发测试上限，避免压垮 host/网络 */
const CONCURRENCY = 6

export interface TestRunState {
  /** modelKey（provider/modelId）→ 最近一次测试结果 */
  results: Record<string, TestResult>
  /** 「测试全部」是否进行中 */
  testing: boolean
  progress: { done: number; total: number }
  /** 测试单个模型：置 testing → 请求 → 写回结果 */
  testOne: (key: string) => Promise<void>
  /** 测试全部：并发（限 CONCURRENCY）逐个更新 */
  testAll: (models: ModelRow[]) => Promise<void>
}

export function useTestResults(): TestRunState {
  const { useState, useRef, useCallback } = getReact()
  // 初始值从 localStorage 读取，实现跨刷新持久化；
  // key 为 provider/modelId（与 host 侧一致），settings 增删/排序不错位
  const [results, setResults] = useState<Record<string, TestResult>>(loadStoredResults)
  const [testing, setTesting] = useState(false)
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  // 请求序号：同一模型重复触发测试（单测 + 测试全部并发）时，
  // 只有最新一次请求的结果允许写入，避免旧响应覆盖新状态
  const seqRef = useRef<Record<string, number>>({})

  const writeResult = useCallback((key: string, seq: number, result: TestResult) => {
    // 期间若同一模型又发起了更新的测试，丢弃这份过期结果
    if (seqRef.current[key] !== seq) return
    setResults((s) => {
      const next = { ...s, [key]: result }
      saveStoredResults(next)
      return next
    })
  }, [])

  const testOne = useCallback(async (key: string): Promise<void> => {
    const seq = (seqRef.current[key] || 0) + 1
    seqRef.current[key] = seq
    setResults((s) => ({ ...s, [key]: { status: 'testing' as const } }))
    const result = await requestModelTest(key)
    writeResult(key, seq, result)
  }, [writeResult])

  const testAll = useCallback(async (models: ModelRow[]): Promise<void> => {
    if (models.length === 0) return
    const total = models.length
    setTesting(true)
    setProgress({ done: 0, total })

    let done = 0
    const queue = models.map((m) => m.key)

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const key = queue.shift()
        if (key === undefined) break
        await testOne(key)
        done++
        setProgress({ done, total })
        if (done >= total) setTesting(false)
      }
    }
    await Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()),
    )
  }, [testOne])

  return { results, testing, progress, testOne, testAll }
}
