import { createHash, randomBytes } from 'node:crypto'

import type { IdentitySessionPolicySnapshot } from '../../configuration/identity-session-policy.js'

/** 身份会话材料生成失败时使用的脱敏稳定内部错误类别。 */
export type UserSessionIssuanceMaterialErrorType =
  | 'IDENTITY_SESSION_POLICY_UNAVAILABLE'
  | 'IDENTITY_SESSION_POLICY_INVALID'
  | 'IDENTITY_SESSION_TIME_INVALID'
  | 'IDENTITY_SESSION_EXPIRY_OUT_OF_RANGE'

/** 会话材料生成错误不包含 Bearer、配置正文、身份主体或数据库信息。 */
export class UserSessionIssuanceMaterialError extends Error {
  /** 供上层按稳定类别映射错误的内部错误类型。 */
  readonly type: UserSessionIssuanceMaterialErrorType

  /** 创建不含敏感原值的会话材料错误。 */
  constructor(type: UserSessionIssuanceMaterialErrorType, message: string) {
    super(message)
    this.name = 'UserSessionIssuanceMaterialError'
    this.type = type
  }
}

/** 交给 identity Repository 的最小可持久化会话投影；不含可恢复的 Bearer 原文。 */
export type UserSessionPersistenceMaterial = {
  /** 原始 Bearer 的 SHA-256 小写十六进制摘要，DDL 唯一保存此摘要。 */
  readonly sessionRefHash: string
  /** 本次会话实际签发时刻，UTC 毫秒。 */
  readonly issuedAtMs: number
  /** 由本次锁定策略快照计算的绝对失效时刻，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 本次会话签发所用的不可变身份策略发布版本，用于后续审计与策略追溯。 */
  readonly policyReleaseVersion: string
  /** 会话签发使用的统一请求级配置快照 SHA-256；不含用户或凭证数据。 */
  readonly policySnapshotSha256: string
}

/** 当前请求可读取的一次性签发材料；Bearer 只允许交给首次成功响应。 */
export type UserSessionIssuanceMaterial = {
  /** 青花植签发的高熵 opaque Bearer；仅供当前首次成功响应，禁止持久化或日志记录。 */
  readonly bearerForImmediateDelivery: string
  /** 不含原始 Bearer 的会话写入投影。 */
  readonly record: Readonly<UserSessionPersistenceMaterial>
}

/** 创建会话材料所需的显式策略快照和服务端时间。 */
export type CreateUserSessionIssuanceMaterialInput = {
  /** 请求开始时解析并锁定的有效身份会话策略；无发布时必须传 null 并失败关闭。 */
  readonly policySnapshot: Readonly<IdentitySessionPolicySnapshot> | null
  /** 当前请求可信的 UTC Unix 毫秒，不使用函数内的系统墙钟。 */
  readonly issuedAtMs: number
}

/** 32 个密码学安全随机字节提供固定 256-bit 熵；这是固定安全构造而非业务配置。 */
const sessionBearerEntropyBytes = 32
/** UTC 时间戳和绝对过期时间必须可由 JavaScript 安全整数精确表示。 */
const millisecondsPerHour = 3_600_000
/** 身份会话策略 v1 不允许静默续期。 */
const noRefreshWindowHours = 0
/** 会话有效期必须至少覆盖一个正数毫秒。 */
const zero = Number('0')

/** 拒绝未解析策略、损坏快照和不可能由 v1 解释的刷新窗口。 */
function verifyPolicySnapshot(
  policySnapshot: Readonly<IdentitySessionPolicySnapshot> | null
): asserts policySnapshot is Readonly<IdentitySessionPolicySnapshot> {
  if (policySnapshot === null) {
    throw new UserSessionIssuanceMaterialError(
      'IDENTITY_SESSION_POLICY_UNAVAILABLE',
      '当前没有可用于签发登录会话的有效策略'
    )
  }

  if (
    policySnapshot.contractVersion !== 'identity-session-policy/v1' ||
    policySnapshot.scopeCode !== 'identity_sessions' ||
    !Number.isSafeInteger(policySnapshot.sessionTtlHours) ||
    policySnapshot.sessionTtlHours <= zero ||
    policySnapshot.refreshWindowHours !== noRefreshWindowHours ||
    !/^[a-f0-9]{64}$/u.test(policySnapshot.contentSha256) ||
    !/^[a-f0-9]{64}$/u.test(policySnapshot.configurationSnapshot.snapshotSha256)
  ) {
    throw new UserSessionIssuanceMaterialError(
      'IDENTITY_SESSION_POLICY_INVALID',
      '身份会话策略快照不适用于签发'
    )
  }
}

/** 使用显式请求时间和已锁定快照计算绝对失效时刻；绝不补 TTL 默认值。 */
function calculateExpiresAtMs(
  issuedAtMs: number,
  policySnapshot: Readonly<IdentitySessionPolicySnapshot>
): number {
  if (!Number.isSafeInteger(issuedAtMs) || issuedAtMs < zero) {
    throw new UserSessionIssuanceMaterialError(
      'IDENTITY_SESSION_TIME_INVALID',
      '会话签发时间不合法'
    )
  }

  const ttlMs = policySnapshot.sessionTtlHours * millisecondsPerHour
  const expiresAtMs = issuedAtMs + ttlMs
  if (
    !Number.isSafeInteger(ttlMs) ||
    ttlMs <= zero ||
    !Number.isSafeInteger(expiresAtMs) ||
    expiresAtMs <= issuedAtMs
  ) {
    throw new UserSessionIssuanceMaterialError(
      'IDENTITY_SESSION_EXPIRY_OUT_OF_RANGE',
      '会话失效时间超出安全范围'
    )
  }

  return expiresAtMs
}

/**
 * 生成一次性响应 Bearer 和只含不可逆摘要的持久化投影。
 *
 * 调用方必须在所有幂等、身份事务与策略校验允许首次签发之后调用，并只在已确认提交后
 * 向当前调用者交付 `bearerForImmediateDelivery`。Repository 只能接收 `record`；不得把整个
 * 返回对象序列化、持久化、放入 outbox、幂等响应、审计或日志。
 *
 * @param input 已冻结的会话策略快照与显式 UTC 毫秒时钟。
 * @returns 当前调用栈的一次性 Bearer，以及绝不含原文的会话持久化投影。
 * @throws {UserSessionIssuanceMaterialError} 策略缺失/损坏或时间无法安全计算时失败关闭。
 */
export function createUserSessionIssuanceMaterial(
  input: CreateUserSessionIssuanceMaterialInput
): Readonly<UserSessionIssuanceMaterial> {
  verifyPolicySnapshot(input.policySnapshot)
  const expiresAtMs = calculateExpiresAtMs(input.issuedAtMs, input.policySnapshot)
  const bearerForImmediateDelivery = randomBytes(sessionBearerEntropyBytes).toString('base64url')
  const sessionRefHash = createHash('sha256')
    .update(bearerForImmediateDelivery, 'utf8')
    .digest('hex')

  return Object.freeze({
    bearerForImmediateDelivery,
    record: Object.freeze({
      sessionRefHash,
      issuedAtMs: input.issuedAtMs,
      expiresAtMs,
      policyReleaseVersion: input.policySnapshot.releaseVersion,
      policySnapshotSha256: input.policySnapshot.configurationSnapshot.snapshotSha256
    })
  })
}
