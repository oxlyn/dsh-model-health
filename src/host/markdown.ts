// list_models 工具的 Markdown 表格渲染。
// host 侧工具执行时拿不到 client 的 locale 服务，故输出采用
// 语言中立的英文表头 + 中英双语提示行，两种语言用户都可读。

import { join } from 'node:path'
import type { ModelRow } from './models'
import { dshHome } from './config'

export function renderMarkdownTable(rows: ModelRow[]): string {
  const settingsPath = join(dshHome(), 'settings.yaml')

  if (rows.length === 0) {
    return [
      '当前 settings.yaml 中未配置任何模型。/ No models are configured in settings.yaml.',
      '',
      '请在 Web UI 的 设置 → 模型 中添加 DeepSeek API Key 或自定义提供商。',
      'Please add a DeepSeek API key or a custom provider in Web UI → Settings → Models.',
      `配置文件位置 / Config file: ${settingsPath}`,
    ].join('\n')
  }

  const header = '| # | Provider | Model ID | Name | Context Window | Max Output | Input | API | BaseURL |'
  const sep    = '|---|----------|----------|------|----------------|------------|-------|-----|---------|'
  const lines = rows.map((r, i) => {
    return `| ${i + 1} | ${r.provider} | ${r.modelId} | ${r.modelName} | ${r.contextWindow} | ${r.maxTokens} | ${r.input} | ${r.api} | ${r.baseURL} |`
  })

  return [
    `已配置 **${rows.length}** 个模型 / **${rows.length}** model(s) configured:`,
    '',
    header,
    sep,
    ...lines,
    '',
    `_来源 / Source: ${settingsPath}_`,
  ].join('\n')
}
