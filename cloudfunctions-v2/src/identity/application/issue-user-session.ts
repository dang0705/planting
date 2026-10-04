import { randomBytes } from 'node:crypto'

import type { UserRef } from '../../contracts/types.js'
import type { IdentitySessionPolicySnapshot } from '../../configuration/identity-session-policy.js'
import type {
  DatabaseTransactionDriver,
  TransactionExecutionContext
} from '../../foundation/database/transaction-runner.js'
import { runDatabaseTransaction } from '../../foundation/database/transaction-runner.js'
import {
  createUserSessionIssuanceMaterial,
  type UserSessionIssuanceMaterial
} from '../domain/user-session-issuance-material.js'
import {
  IdentitySessionIssuancePersistenceError,
  type IdentitySessionIssuanceRepository,
  type PersistIdentitySessionIssuanceInput
} from '../repository/mysql-user-session-issuance-repository.js'
import type { VerifiedPlatformIdentityEvidence } from '../provider/platform-credential-evidence.js'

/** 登录应用命令；只能由 HTTP 层在严格校验并完成 Provider 验真后构造。 */
export type IssueUserSessionCommand = {
  /** Provider 验真且已生成受控 HMAC 候选的平台主体证据。 */
  readonly identity: Readonly<VerifiedPlatformIdentityEvidence>
  /** 本次请求开始时解析并锁定的有效身份策略快照。 */
  readonly policySnapshot: Readonly<IdentitySessionPolicySnapshot>
  /** 服务端可信 UTC 毫秒时钟，不从请求字段读取。 */
  readonly issuedAtMs: number
}

/** 登录成功公开数据；只允许首次成功响应持有 accessToken 原文。 */
export type IssueUserSessionResult = {
  /** 青花植自签的高熵不透明 Bearer，只在当前响应一次性交付。 */
  readonly accessToken: string
  /** 与数据库会话绝对过期毫秒值一致的 ISO 8601 UTC 文本。 */
  readonly expiresAt: string
}

/** 统一用户公开引用生成器；数据库内部自增主键永不进入此应用用例。 */
function createUserRef(): UserRef {
  return `usr_${randomBytes(Number('24')).toString('base64url')}` as UserRef
}

/** 把策略时限转换为公开 UTC 文本；不可表示时在开始数据库事务前失败。 */
function toExpiresAt(expiresAtMs: number): string {
  try {
    return new Date(expiresAtMs).toISOString()
  } catch {
    throw new Error('会话过期时间无法表示')
  }
}

/** 只把 Repository 已识别的身份唯一绑定争用视为可重读场景。 */
function isRecoverableBindingRace(error: unknown): boolean {
  return (
    error instanceof IdentitySessionIssuancePersistenceError &&
    error.type === 'IDENTITY_BINDING_RACE'
  )
}

/**
 * 创建“已验证平台身份 → 同一 MySQL 事务写入用户/绑定/会话”的登录用例。
 *
 * 只在平台身份唯一键争用且事务已回滚时重新开启一次事务，由 Repository 读回赢家并复用其用户；
 * 死锁、数据库错误和 COMMIT 结果未知均不自动重试。任何错误都不会把 Bearer 原文交给调用方。
 */
export function createIssueUserSessionUseCase<
  TTransaction extends TransactionExecutionContext
>(dependencies: {
  /** 事务生命周期驱动；每次尝试必须获取独占、全新的事务连接。 */
  readonly driver: DatabaseTransactionDriver<TTransaction>
  /** 唯一可写入统一用户、平台绑定和会话的身份 Repository。 */
  readonly repository: IdentitySessionIssuanceRepository<TTransaction>
}): (command: IssueUserSessionCommand) => Promise<Readonly<IssueUserSessionResult>> {
  return async command => {
    const material: Readonly<UserSessionIssuanceMaterial> = createUserSessionIssuanceMaterial({
      policySnapshot: command.policySnapshot,
      issuedAtMs: command.issuedAtMs
    })
    const expiresAt = toExpiresAt(material.record.expiresAtMs)
    const persistenceInput: Readonly<PersistIdentitySessionIssuanceInput> = {
      identity: command.identity,
      newUserRef: createUserRef(),
      session: material.record
    }

    let persisted = false
    let bindingRaceRetried = false
    while (!persisted) {
      try {
        await runDatabaseTransaction(dependencies.driver, transaction =>
          dependencies.repository.persist(transaction, persistenceInput)
        )
        persisted = true
      } catch (error: unknown) {
        if (!bindingRaceRetried && isRecoverableBindingRace(error)) {
          bindingRaceRetried = true
          continue
        }
        throw error
      }
    }

    return Object.freeze({
      accessToken: material.bearerForImmediateDelivery,
      expiresAt
    })
  }
}
