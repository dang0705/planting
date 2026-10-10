import { createSecretKey } from 'node:crypto'
import { RUNTIME_PARAMETERS } from '../../configuration/runtime-parameters.js'
import {
  createVerifyPlatformCredentialUseCase,
  PlatformCredentialEvidenceError,
  type VerifiedPlatformIdentityEvidence
} from './platform-credential-evidence.js'
import { createWechatMiniprogramCredentialProvider } from './wechat-miniprogram-credential-provider.js'

/** 平台主体 HMAC 密钥最少字节数（256 位）。 */
const minimumHmacKeyBytes = 32
/** 当前密钥版本；数据库只保存该引用，不保存密钥材料。 */
const currentKeyVersion = 'v1'

/** 工厂读取的环境变量名（凭证引用），值只在进程内使用。 */
export interface WechatLoginEnvironment {
  /** 小程序 AppID。 */
  readonly WECHAT_MINIPROGRAM_APPID?: string
  /** 小程序 AppSecret（凭证引用 env:WECHAT_MINIPROGRAM_PRIVATE_KEY）。 */
  readonly WECHAT_MINIPROGRAM_PRIVATE_KEY?: string
  /** 平台主体 HMAC 密钥 v1，base64 编码。 */
  readonly PLATFORM_SUBJECT_HMAC_KEY_V1?: string
}

/** 配置缺失时的统一错误；不含任何变量值。 */
const configurationInvalid = () => new PlatformCredentialEvidenceError('INTERNAL_IDENTITY_CONFIGURATION_INVALID', '微信登录配置缺失或无效')

/**
 * 组装“微信 code2Session 验真 → 平台主体 HMAC 摘要”的登录验真函数，供 identity 入口注入。
 * 配置在创建时校验，缺失即拒绝启动登录能力，不回退默认值。
 */
export function createWechatLoginVerifier(
  environment: WechatLoginEnvironment,
  fetchImplementation: typeof globalThis.fetch,
  /** 总时限毫秒；省略时取代码层注册表（配置目录 wechat_miniprogram_login 档案 totalDeadlineMs）。 */
  totalDeadlineMs: number = RUNTIME_PARAMETERS.identity.wechatLoginTotalDeadlineMs.value
): (code: string) => Promise<VerifiedPlatformIdentityEvidence> {
  const appId = environment.WECHAT_MINIPROGRAM_APPID?.trim()
  const appSecret = environment.WECHAT_MINIPROGRAM_PRIVATE_KEY?.trim()
  const encodedKey = environment.PLATFORM_SUBJECT_HMAC_KEY_V1?.trim()
  if (!appId || !appSecret || !encodedKey) { throw configurationInvalid() }
  const keyBytes = Buffer.from(encodedKey, 'base64')
  if (keyBytes.length < minimumHmacKeyBytes) { throw configurationInvalid() }
  const provider = createWechatMiniprogramCredentialProvider({ fetch: fetchImplementation, appId, appSecret, totalDeadlineMs })
  const verify = createVerifyPlatformCredentialUseCase({
    provider,
    keyRing: { current: { keyVersion: currentKeyVersion, secretKey: createSecretKey(keyBytes) }, retiring: [] },
  })
  return code => verify({ platform: 'wechat', appScope: appId, credential: code })
}
