import type { IncomingMessage, ServerResponse } from 'node:http'

import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import type { PublicErrorResponse } from '../../foundation/http/request-chain.js'

/** 冻结 HTTP JSON 请求体上限，来自配置目录 `http.json_body_limit_bytes` 已确认值（取值见代码层注册表）。 */
const requestBodyLimitBytes = RUNTIME_PARAMETERS.http.jsonBodyLimitBytes.value
/** 所有公开响应固定使用 UTF-8 JSON。 */
const jsonContentType = 'application/json; charset=utf-8'

/** identity 入口的输入边界错误：只表示“请求不合法”，不携带请求体、平台 code 或游客令牌。 */
export class IdentityLoginInputError extends Error {
  /** 创建不含输入原值的请求错误。 */
  constructor() {
    super('请求不合法')
    this.name = 'IdentityLoginInputError'
  }
}

/** 写出稳定 JSON 响应；任何输入、token 或数据库内部信息都不得进入响应。 */
export function writeJson(
  response: ServerResponse,
  status: number,
  body: PublicErrorResponse | { readonly data: unknown }
): void {
  if (response.headersSent || response.writableEnded) {
    response.destroy()
    return
  }
  const serialized = JSON.stringify(body)
  response.writeHead(status, {
    'content-type': jsonContentType,
    'content-length': Buffer.byteLength(serialized, 'utf8'),
    'cache-control': 'no-store'
  })
  response.end(serialized)
}

/** 收集 JSON 正文并在内存中严格限制字节数；超限后不再保存后续数据。 */
export function readJsonBody(request: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let byteLength = Number('0')
    let exceededLimit = false

    request.on('data', (chunk: Buffer | string) => {
      if (exceededLimit) {
        return
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
      byteLength += buffer.byteLength
      if (byteLength > requestBodyLimitBytes) {
        exceededLimit = true
        chunks.length = Number('0')
        return
      }
      chunks.push(buffer)
    })
    request.once('error', () => reject(new IdentityLoginInputError()))
    request.once('end', () => {
      if (exceededLimit) {
        reject(new IdentityLoginInputError())
        return
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
      } catch {
        reject(new IdentityLoginInputError())
      }
    })
  })
}

/** 在读取正文前限定 JSON 媒体类型，不回显客户端声明值。 */
export function verifyJsonContentType(request: IncomingMessage): void {
  const contentType = request.headers['content-type']
  if (typeof contentType !== 'string') {
    throw new IdentityLoginInputError()
  }
  const [mediaType, ...parameters] = contentType.split(';')
  if (mediaType?.trim().toLowerCase() !== 'application/json') {
    throw new IdentityLoginInputError()
  }
  const unsupportedCharset = parameters.some(parameter => {
    const [name, value] = parameter.split('=')
    return (
      name?.trim().toLowerCase() === 'charset' &&
      value?.trim().replaceAll('"', '').toLowerCase() !== 'utf-8'
    )
  })
  if (unsupportedCharset) {
    throw new IdentityLoginInputError()
  }
}
