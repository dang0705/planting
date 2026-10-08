import {
  PlatformCredentialEvidenceError,
  type PlatformCredentialProvider,
  type PlatformCredentialVerificationInput,
  type VerifiedPlatformSubject
} from './platform-credential-evidence.js'

/** 抖音官方 jscode2session v2 端点。 */
const jscode2sessionEndpoint = 'https://developer.toutiao.com/api/apps/v2/jscode2session'
/** 官方定义为凭证无效的错误码：40018 code 无效，40019 anonymous_code 无效。 */
const invalidCredentialErrorCodes = new Set([40018, 40019])
/** 一次性 code 长度上限；超长直接拒绝，不发请求。 */
const maximumCodeLength = 256

/** 抖音适配器依赖；AppSecret 只在调用栈内使用。 */
export interface DouyinMiniprogramProviderDependencies {
  /** 原生 fetch 或等价实现，必须支持 AbortSignal。 */
  readonly fetch: typeof globalThis.fetch
  /** 抖音小程序 AppID，同时作为身份的应用范围。 */
  readonly appId: string
  /** 抖音小程序 AppSecret（凭证引用 env:DOUYIN_APP_SECRET）。 */
  readonly appSecret: string
  /** 配置目录 douyin_miniprogram_login 的总时限（毫秒）。 */
  readonly totalDeadlineMs: number
}

/** 抖音适配器：平台登录验真＋游客防刷用的匿名信号换取。 */
export interface DouyinMiniprogramProvider extends PlatformCredentialProvider<string> {
  /** 用 tt.login 的 anonymousCode 换 anonymous_openid；仅作防刷键，不作业务主键。 */
  readonly exchangeAnonymousCode: (anonymousCode: string) => Promise<string>
}

/** 不含敏感原值的 Provider 不可用错误。 */
const providerUnavailable = () => new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_PROVIDER_INVALID', '平台登录服务暂时不可用')
/** 不含敏感原值的凭证无效错误。 */
const credentialInvalid = () => new PlatformCredentialEvidenceError('PRINCIPAL_INVALID', '平台登录凭证无效')
/** 一次性 code 必须为非空且长度受限的字符串。 */
const validCode = (value: unknown): value is string => typeof value === 'string' && value.trim() !== '' && value.length <= maximumCodeLength

/**
 * 创建抖音 jscode2session 适配器（已批准档案：只调用 1 次、不重试、总时限 5 秒）。
 * 成功只返回所需字段，session_key 与 unionid 立即丢弃；不写日志、不落库。
 */
export function createDouyinMiniprogramCredentialProvider(dependencies: DouyinMiniprogramProviderDependencies): DouyinMiniprogramProvider {
  if (typeof dependencies.appId !== 'string' || dependencies.appId.trim() === ''
    || typeof dependencies.appSecret !== 'string' || dependencies.appSecret.trim() === '') {
    throw new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_CONFIGURATION_INVALID', '抖音登录配置缺失')
  }
  const { appId, appSecret } = dependencies

  /** 发起一次 code2session 交换并返回 data 对象；错误统一映射为不含原值的稳定类型。 */
  async function exchange(body: Record<string, string>): Promise<Record<string, unknown>> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), dependencies.totalDeadlineMs)
    let parsed: unknown
    try {
      const response = await dependencies.fetch(jscode2sessionEndpoint, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ appid: appId, secret: appSecret, ...body }), signal: controller.signal,
      })
      if (!response.ok) { throw providerUnavailable() }
      parsed = JSON.parse(await response.text())
    } catch (error) {
      if (error instanceof PlatformCredentialEvidenceError) { throw error }
      throw providerUnavailable()
    } finally {
      clearTimeout(timer)
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) { throw providerUnavailable() }
    const record = parsed as Record<string, unknown>
    if (record.err_no !== 0) {
      throw typeof record.err_no === 'number' && invalidCredentialErrorCodes.has(record.err_no) ? credentialInvalid() : providerUnavailable()
    }
    const data = record.data
    if (!data || typeof data !== 'object' || Array.isArray(data)) { throw providerUnavailable() }
    return data as Record<string, unknown>
  }

  /** 平台主体字段必须非空且无首尾空白。 */
  const subject = (value: unknown): string => {
    if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) { throw providerUnavailable() }
    return value
  }

  return {
    async verify(input: PlatformCredentialVerificationInput<string>): Promise<VerifiedPlatformSubject> {
      if (input.platform !== 'douyin' || input.appScope !== appId || !validCode(input.credential)) { throw credentialInvalid() }
      const data = await exchange({ code: input.credential })
      return { platform: 'douyin', appScope: appId, normalizedSubject: subject(data.openid) }
    },
    async exchangeAnonymousCode(anonymousCode: string): Promise<string> {
      if (!validCode(anonymousCode)) { throw credentialInvalid() }
      const data = await exchange({ anonymous_code: anonymousCode })
      return subject(data.anonymous_openid)
    },
  }
}
