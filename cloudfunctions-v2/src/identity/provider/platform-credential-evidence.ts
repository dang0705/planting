import { createHmac, type KeyObject } from 'node:crypto'

import type { PlatformAuthenticationEntry } from '../domain/resolve-user-principal.js'

/** 平台凭证验证失败或受控身份配置损坏时使用的内部稳定错误类别。 */
export type PlatformCredentialEvidenceErrorType =
  | 'PRINCIPAL_INVALID'
  | 'INTERNAL_IDENTITY_PROVIDER_INVALID'
  | 'INTERNAL_IDENTITY_CONFIGURATION_INVALID'

/** 平台凭证验证和主体摘要阶段的稳定错误；消息不得包含凭证、主体或密钥。 */
export class PlatformCredentialEvidenceError extends Error {
  /** 供上层映射公开错误的稳定内部类型。 */
  readonly type: PlatformCredentialEvidenceErrorType

  /** 创建不携带敏感原值的平台身份错误。 */
  constructor(type: PlatformCredentialEvidenceErrorType, message: string) {
    super(message)
    this.name = 'PlatformCredentialEvidenceError'
    this.type = type
  }
}

/** 交给受控平台 Provider 的最小凭证验证输入。 */
export type PlatformCredentialVerificationInput<TCredential = unknown> = {
  /** 客户端声明且已经通过 DTO 白名单校验的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 当前小程序或应用的稳定范围，禁止跨应用复用主体。 */
  readonly appScope: string
  /** Provider 专属短时凭证；只存在当前调用栈，不得落库、记录或回显。 */
  readonly credential: TCredential
}

/** Provider 验真后返回给身份边界的短生命周期主体。 */
export type VerifiedPlatformSubject = {
  /** Provider 实际验证的平台，必须与请求平台一致。 */
  readonly platform: PlatformAuthenticationEntry
  /** Provider 实际验证的应用范围，必须与请求范围一致。 */
  readonly appScope: string
  /** Provider 规范化后的主体原文；仅用于当前调用栈内生成 HMAC，随后立即丢弃。 */
  readonly normalizedSubject: string
}

/** 各平台认证 Adapter 必须实现的统一验真端口。 */
export type PlatformCredentialProvider<TCredential = unknown> = {
  /** 验证短时凭证并返回已规范化主体；不得把无效凭证伪造成匿名或登录用户。 */
  readonly verify: (
    input: PlatformCredentialVerificationInput<TCredential>
  ) => Promise<VerifiedPlatformSubject>
}

/** 单个 HMAC 密钥版本的进程内受控句柄。 */
export type PlatformSubjectHmacKey = {
  /** 可审计的密钥版本引用；数据库只保存该引用，不保存密钥材料。 */
  readonly keyVersion: string
  /** 从受控凭证系统装载的 Node secret KeyObject；不得序列化或写入配置数据库。 */
  readonly secretKey: KeyObject
}

/** 平台主体摘要轮换期间的当前和退役中密钥集合。 */
export type PlatformSubjectHmacKeyRing = {
  /** 新绑定和受控重算使用的当前密钥版本。 */
  readonly current: PlatformSubjectHmacKey
  /** 登录兼容窗口内仍可用于查找旧摘要的退役中密钥，按声明顺序尝试。 */
  readonly retiring: readonly PlatformSubjectHmacKey[]
}

/** 单个密钥版本生成的不可逆平台主体检索候选。 */
export type PlatformSubjectHashCandidate = {
  /** 规范化平台主体的 HMAC-SHA-256 小写十六进制摘要。 */
  readonly platformSubjectHash: string
  /** 生成摘要的密钥版本引用，不含密钥材料。 */
  readonly subjectHashKeyVersion: string
}

/** Provider 验真和密钥轮换处理后的最小安全证据。 */
export type VerifiedPlatformIdentityEvidence = {
  /** 已验证的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 已验证的平台应用范围。 */
  readonly appScope: string
  /** 当前密钥优先、退役中密钥随后排列的摘要候选；不含主体原文。 */
  readonly hashCandidates: readonly PlatformSubjectHashCandidate[]
}

/** 平台凭证验证用例依赖。 */
export type VerifyPlatformCredentialDependencies<TCredential = unknown> = {
  /** 已审计且与目标平台绑定的 Provider Adapter。 */
  readonly provider: PlatformCredentialProvider<TCredential>
  /** 请求开始时锁定的只读 HMAC 密钥轮换快照。 */
  readonly keyRing: PlatformSubjectHmacKeyRing
}

const supportedPlatforms = new Set<PlatformAuthenticationEntry>([
  'wechat',
  'douyin',
  'xiaohongshu',
  'phone'
])
const appScopeFormat = /^[A-Za-z0-9._-]{1,64}$/u
const keyVersionFormat = /^[A-Za-z0-9._-]{1,64}$/u

/** 在创建用例时验证密钥快照，避免处理真实凭证后才发现配置损坏。 */
function verifyKeyRing(keyRing: PlatformSubjectHmacKeyRing): readonly PlatformSubjectHmacKey[] {
  const keys = [keyRing.current, ...keyRing.retiring]
  const versions = new Set<string>()
  for (const key of keys) {
    if (!keyVersionFormat.test(key.keyVersion) || key.secretKey.type !== 'secret') {
      throw new PlatformCredentialEvidenceError(
        'INTERNAL_IDENTITY_CONFIGURATION_INVALID',
        '平台主体 HMAC 密钥配置不合法'
      )
    }
    if (versions.has(key.keyVersion)) {
      throw new PlatformCredentialEvidenceError(
        'INTERNAL_IDENTITY_CONFIGURATION_INVALID',
        '平台主体 HMAC 密钥版本不得重复'
      )
    }
    versions.add(key.keyVersion)
  }
  return keys
}

/** 在调用外部 Provider 前拒绝不属于公开白名单的平台和应用范围。 */
function verifyRequestScope<TCredential>(
  input: PlatformCredentialVerificationInput<TCredential>
): void {
  if (!supportedPlatforms.has(input.platform) || !appScopeFormat.test(input.appScope)) {
    throw new PlatformCredentialEvidenceError('PRINCIPAL_INVALID', '平台登录凭证无效')
  }
}

/** 复核 Provider 没有切换平台、跨应用或返回未经规范化的空主体。 */
function verifyProviderResult<TCredential>(
  input: PlatformCredentialVerificationInput<TCredential>,
  result: VerifiedPlatformSubject
): void {
  if (result.platform !== input.platform || result.appScope !== input.appScope) {
    throw new PlatformCredentialEvidenceError(
      'INTERNAL_IDENTITY_PROVIDER_INVALID',
      '平台凭证验证结果与请求范围不一致'
    )
  }
  if (
    result.normalizedSubject.length === Number('0') ||
    result.normalizedSubject.trim() !== result.normalizedSubject
  ) {
    throw new PlatformCredentialEvidenceError(
      'INTERNAL_IDENTITY_PROVIDER_INVALID',
      '平台凭证验证结果缺少规范主体'
    )
  }
}

/** 使用单个受控密钥生成平台主体检索摘要。 */
function createSubjectHashCandidate(
  normalizedSubject: string,
  key: PlatformSubjectHmacKey
): PlatformSubjectHashCandidate {
  return {
    platformSubjectHash: createHmac('sha256', key.secretKey)
      .update(normalizedSubject, 'utf8')
      .digest('hex'),
    subjectHashKeyVersion: key.keyVersion
  }
}

/**
 * 创建“Provider 验真 → 当前/退役密钥 HMAC → 最小安全证据”的身份用例。
 * 本用例不决定 Provider 超时或重试，也不访问数据库；这些值必须来自后续已发布配置。
 */
export function createVerifyPlatformCredentialUseCase<TCredential>(
  dependencies: VerifyPlatformCredentialDependencies<TCredential>
): (
  input: PlatformCredentialVerificationInput<TCredential>
) => Promise<VerifiedPlatformIdentityEvidence> {
  const keys = verifyKeyRing(dependencies.keyRing)
  return async input => {
    verifyRequestScope(input)
    const result = await dependencies.provider.verify(input)
    verifyProviderResult(input, result)
    return {
      platform: result.platform,
      appScope: result.appScope,
      hashCandidates: keys.map(key => createSubjectHashCandidate(result.normalizedSubject, key))
    }
  }
}
