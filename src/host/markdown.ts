// list_models 工具的 Markdown 表格渲染。

import { join } from 'node:path'
import type { ModelRow } from './models'
import { dshHome } from './config'

export function renderMarkdownTable(rows: ModelRow[]): string {
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
