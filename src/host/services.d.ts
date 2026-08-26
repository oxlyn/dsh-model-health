// DSH 运行时上层服务的类型补充（不在 cordis 核心类型中）：
// - webServer：HTTP 路由注册
//   WebRoute = { kind: 'exact'|'prefix', path, handler }
// - credentials：DSH credential service，通过环境变量名解析 API Key

import type { IncomingMessage, ServerResponse } from 'node:http'

declare module '@deepseek-ai/cordis' {
  interface Context {
    webServer: {
      register(route: {
        kind: 'exact' | 'prefix'
        path: string
        handler: (req: IncomingMessage, res: ServerResponse) => void | Promise<void>
      }): () => void
    }
    credentials: {
      /** resolve(ref) 返回 { value } 或 undefined */
      resolve(ref: string): Promise<{ value: string } | undefined>
    }
  }
}
