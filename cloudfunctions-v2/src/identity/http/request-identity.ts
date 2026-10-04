import type { IncomingHttpHeaders } from 'node:http'

import {
  PlatformCredentialEvidenceError,
  type VerifiedPlatformIdentityEvidence
} from '../provider/platform-credential-evidence.js'

/**
 * 从 HTTP 请求头产出平台验真证据的端口。
 * 实现必须只信任可证明由平台网关注入、客户端无法伪造的字段；无法验真时抛出
 * `PlatformCredentialEvidenceError('PRINCIPAL_INVALID')`，不得降级为匿名或猜测主体。
 */
export type RequestIdentityVerifier = (
  headers: IncomingHttpHeaders
) => Promise<VerifiedPlatformIdentityEvidence>

/**
 * 可信平台身份 Provider 尚未证实时的生产默认验真器：拒绝一切请求。
 * CloudBase 官方文档说明，微信小程序经 `wx.cloud.callHTTPFunction` 调用时会注入
 * `x-wx-openid` / `x-wx-appid`；但未证明公开网关会拒绝或覆盖客户端伪造的同名头。
 * 在该信任边界得到验证之前，不得仅凭 HTTP 请求头建立平台身份。
 */
export const rejectUnprovenPlatformIdentity: RequestIdentityVerifier = async () => {
  throw new PlatformCredentialEvidenceError('PRINCIPAL_INVALID', '可信平台身份 Provider 尚未接入')
}

const bearerFormat = /^Bearer ([\x21-\x7E]+)$/u

/**
 * 从 `Authorization` 头提取 Bearer 原文；缺失、方案不符或含空白时返回 null。
 * 原文只在当前调用栈内传递给 Principal 解析，不得记录或回显。
 */
export function extractBearerToken(headers: IncomingHttpHeaders): string | null {
  const authorization = headers.authorization
  if (typeof authorization !== 'string') {
    return null
  }
  return bearerFormat.exec(authorization)?.[1] ?? null
}
