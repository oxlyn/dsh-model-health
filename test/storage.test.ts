// sanitizeStoredResults：localStorage 数据清洗的契约测试。

import { describe, expect, it } from 'vitest'
import { sanitizeStoredResults } from '../src/client/storage'

describe('sanitizeStoredResults', () => {
  it('丢弃旧版数字 key 与非法结构', () => {
    expect(sanitizeStoredResults({ '0': { status: 'ok' }, '1': 'x', bad: null })).toEqual({})
  })

  it('testing 归一为 idle', () => {
    expect(sanitizeStoredResults({ a: { status: 'testing' } })).toEqual({ a: { status: 'idle' } })
  })

  it('非法 status 丢弃；字段类型校验', () => {
    expect(sanitizeStoredResults({ a: { status: 'bogus' } })).toEqual({})
    const r = sanitizeStoredResults({
      b: { status: 'ok', latency: 88, testedAt: 123, history: [1, 'x', 2, -3], error: 42 },
    }).b
    expect(r).toEqual({ status: 'ok', latency: 88 })
  })

  it('非对象输入返回空对象', () => {
    expect(sanitizeStoredResults(null)).toEqual({})
    expect(sanitizeStoredResults([1, 2])).toEqual({})
    expect(sanitizeStoredResults('x')).toEqual({})
  })
})
