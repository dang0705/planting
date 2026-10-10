import { createSecretKey } from 'node:crypto'
import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import {
  createVerifyPlatformCredentialUseCase,
  PlatformCredentialEvidenceError,
  type VerifiedPlatformIdentityEvidence
} from './platform-credential-evidence.js'
import { createDouyinMiniprogramCredentialProvider } from './douyin-miniprogram-credential-provider.js'
import { createWechatLoginVerifier } from './wechat-login-verifier.js'

/** 各平台登录 Provider 总时限（毫秒）；未注入时取代码层注册表默认（已批准档案 5000，用户 2026-10-09 三平台同标准）。 */
export interface PlatformLoginDeadlines {
  /** 微信 code2Session 总时限毫秒；入口从环境变量层读取（白名单运维覆盖）。 */
  readonly wechatTotalDeadlineMs?: number
  /** 抖音 code2Session 总时限毫秒；入口从环境变量层读取（白名单运维覆盖）。 */
  readonly douyinTotalDeadlineMs?: number
}
/** 平台主体 HMAC 密钥最少字节数（256 位）。 */
const minimumHmacKeyBytes = 32

/** 分派器读取的环境变量名（凭证引用）；值只在进程内使用。 */
export interface PlatformLoginEnvironment {
  /** 微信小程序 AppID。 */
  readonly WECHAT_MINIPROGRAM_APPID?: string
  /** 微信小程序 AppSecret。 */
  readonly WECHAT_MINIPROGRAM_PRIVATE_KEY?: string
  /** 抖音小程序 AppID。 */
  readonly DOUYIN_APPID?: string
  /** 抖音小程序 AppSecret。 */
  readonly DOUYIN_APP_SECRET?: string
  /** 平台主体 HMAC 密钥 v1，base64 编码。 */
  readonly PLATFORM_SUBJECT_HMAC_KEY_V1?: string
}

/** 登录支持的平台。 */
export type LoginPlatform = 'wechat' | 'douyin' | 'xiaohongshu'

/** 配置缺失时的统一错误；不含任何变量值。 */
const configurationInvalid = () => new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_CONFIGURATION_INVALID', '平台登录配置缺失或无效')

/** 构建失败时返回始终失败关闭的验真函数，不影响其他平台。 */
function failClosed(): (code: string) => Promise<VerifiedPlatformIdentityEvidence> {
  return async () => { throw configurationInvalid() }
}

/** 抖音登录验真：抖音适配器＋同一把平台主体 HMAC 密钥。 */
function createDouyinLoginVerifier(environment: PlatformLoginEnvironment, fetchImplementation: typeof globalThis.fetch, totalDeadlineMs: number) {
  const appId = environment.DOUYIN_APPID?.trim()
  const appSecret = environment.DOUYIN_APP_SECRET?.trim()
  const keyBytes = Buffer.from(environment.PLATFORM_SUBJECT_HMAC_KEY_V1?.trim() ?? '', 'base64')
  if (!appId || !appSecret || keyBytes.length < minimumHmacKeyBytes) { throw configurationInvalid() }
  const verify = createVerifyPlatformCredentialUseCase({
    provider: createDouyinMiniprogramCredentialProvider({ fetch: fetchImplementation, appId, appSecret, totalDeadlineMs }),
    keyRing: { current: { keyVersion: 'v1', secretKey: createSecretKey(keyBytes) }, retiring: [] },
  })
  return (code: string) => verify({ platform: 'douyin', appScope: appId, credential: code })
}

/**
 * 多平台登录分派（identity-session-issuance.md，用户 2026-10-09 冻结）。
 * 每个平台独立构建：某平台缺配置只让该平台失败关闭；小红书 AppSecret 未配置前一律失败关闭。
 */
export function createPlatformLoginDispatcher(
  environment: PlatformLoginEnvironment,
  fetchImplementation: typeof globalThis.fetch,
  deadlines: PlatformLoginDeadlines = {}
): (platform: LoginPlatform, code: string) => Promise<VerifiedPlatformIdentityEvidence> {
  const build = (factory: () => (code: string) => Promise<VerifiedPlatformIdentityEvidence>) => {
    try { return factory() } catch { return failClosed() }
  }
  const verifiers: Record<LoginPlatform, (code: string) => Promise<VerifiedPlatformIdentityEvidence>> = {
    wechat: build(() => createWechatLoginVerifier(environment, fetchImplementation, deadlines.wechatTotalDeadlineMs)),
    douyin: build(() => createDouyinLoginVerifier(environment, fetchImplementation,
      deadlines.douyinTotalDeadlineMs ?? RUNTIME_PARAMETERS.identity.douyinLoginTotalDeadlineMs.value)),
    xiaohongshu: failClosed(),
  }
  return (platform, code) => {
    const verify = Object.hasOwn(verifiers, platform) ? verifiers[platform] : null
    return verify ? verify(code) : Promise.reject(configurationInvalid())
  }
}
