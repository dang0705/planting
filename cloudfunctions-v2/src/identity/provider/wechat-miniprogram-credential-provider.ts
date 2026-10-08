import {
  PlatformCredentialEvidenceError,
  type PlatformCredentialProvider,
  type PlatformCredentialVerificationInput,
  type VerifiedPlatformSubject
} from './platform-credential-evidence.js'

/** 微信官方 code2Session 端点。 */
const code2SessionEndpoint = 'https://api.weixin.qq.com/sns/jscode2session'
/** 官方定义为“凭证无效/已使用”的错误码；前端应重新调用 wx.login 取新 code。 */
const invalidCredentialErrorCodes = new Set([40029, 40163])
/** wx.login code 是短字符串；超长输入直接拒绝，不发请求。 */
const maximumCodeLength = 128

/** 适配器依赖；AppSecret 只在调用栈内使用，不得记录或回显。 */
export interface WechatMiniprogramProviderDependencies {
  /** 原生 fetch 或等价实现，必须支持 AbortSignal。 */
  readonly fetch: typeof globalThis.fetch
  /** 小程序 AppID，同时作为身份的应用范围。 */
  readonly appId: string
  /** 小程序 AppSecret，来自凭证引用 env:WECHAT_MINIPROGRAM_PRIVATE_KEY。 */
  readonly appSecret: string
  /** 配置目录 wechat_miniprogram_login 档案的总时限（毫秒）。 */
  readonly totalDeadlineMs: number
}

/** 不携带任何敏感原值的 Provider 不可用错误。 */
const providerUnavailable = () => new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_PROVIDER_INVALID', '平台登录服务暂时不可用')
/** 不携带任何敏感原值的凭证无效错误。 */
const credentialInvalid = () => new PlatformCredentialEvidenceError('PRINCIPAL_INVALID', '平台登录凭证无效')

/**
 * 创建微信小程序 code2Session 适配器（已批准档案：只调用 1 次、不重试、总时限 5 秒）。
 * 成功只返回 openid 作为规范主体，session_key 与 unionid 立即丢弃；不写日志、不落库。
 */
export function createWechatMiniprogramCredentialProvider(dependencies: WechatMiniprogramProviderDependencies): PlatformCredentialProvider<string> {
  if (typeof dependencies.appId !== 'string' || dependencies.appId.trim() === ''
    || typeof dependencies.appSecret !== 'string' || dependencies.appSecret.trim() === '') {
    throw new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_CONFIGURATION_INVALID', '微信登录配置缺失')
  }
  const { appId, appSecret } = dependencies
  return {
    async verify(input: PlatformCredentialVerificationInput<string>): Promise<VerifiedPlatformSubject> {
      if (input.platform !== 'wechat' || input.appScope !== appId) { throw credentialInvalid() }
      const code = input.credential
      if (typeof code !== 'string' || code.trim() === '' || code.length > maximumCodeLength) { throw credentialInvalid() }
      const url = new URL(code2SessionEndpoint)
      url.search = new URLSearchParams({ appid: appId, secret: appSecret, js_code: code, grant_type: 'authorization_code' }).toString()
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), dependencies.totalDeadlineMs)
      let body: unknown
      try {
        const response = await dependencies.fetch(url.toString(), { method: 'GET', signal: controller.signal })
        if (!response.ok) { throw providerUnavailable() }
        body = JSON.parse(await response.text())
      } catch (error) {
        // 网络、超时、非 JSON 一律归为 Provider 不可用；原始错误可能含 URL 中的 secret，不得传播。
        if (error instanceof PlatformCredentialEvidenceError) { throw error }
        throw providerUnavailable()
      } finally {
        clearTimeout(timer)
      }
      if (!body || typeof body !== 'object' || Array.isArray(body)) { throw providerUnavailable() }
      const record = body as Record<string, unknown>
      if (typeof record.errcode === 'number' && record.errcode !== 0) {
        throw invalidCredentialErrorCodes.has(record.errcode) ? credentialInvalid() : providerUnavailable()
      }
      const openid = record.openid
      if (typeof openid !== 'string' || openid.length === 0 || openid.trim() !== openid) { throw providerUnavailable() }
      return { platform: 'wechat', appScope: appId, normalizedSubject: openid }
    },
  }
}
