import type { UserRef } from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import type { PlatformAuthenticationEntry } from '../domain/resolve-user-principal.js'

/** 平台身份绑定持久化可能产生的稳定内部错误。 */
export type PlatformIdentityBindingPersistenceErrorType =
  | 'INTERNAL_IDENTITY_DATA_INVALID'
  | 'PRINCIPAL_INVALID'
  | 'IDENTITY_BINDING_CONFLICT'
  | 'IDENTITY_LAST_BINDING_REQUIRED'
  | 'WRITE_CONFLICT'

/** 平台身份绑定错误只允许由应用层映射为脱敏公开错误。 */
export class PlatformIdentityBindingPersistenceError extends Error {
  /** 稳定内部错误类型。 */
  readonly type: PlatformIdentityBindingPersistenceErrorType

  constructor(type: PlatformIdentityBindingPersistenceErrorType, message: string) {
    super(message)
    this.name = '平台身份绑定持久化错误'
    this.type = type
  }
}

/** 创建或恢复平台身份绑定的内部输入，只接受受控摘要与密文。 */
export type BindOrRestorePlatformIdentityInput = {
  /** 当前已认证统一用户公开引用。 */
  readonly userRef: UserRef
  /** 已完成 Provider 验证的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 当前小程序或应用的稳定范围。 */
  readonly appScope: string
  /** 平台主体原文的 HMAC-SHA-256。 */
  readonly platformSubjectHash: string
  /** HMAC 密钥版本引用，不含密钥。 */
  readonly subjectHashKeyVersion: string
  /** 可选服务端密文或其受控引用；不得进入公开响应或日志。 */
  readonly platformSubjectCiphertext: string | null
  /** 服务端可信业务时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 解绑当前应用范围内一个平台入口的内部输入。 */
export type RevokePlatformIdentityInput = {
  /** 当前已认证统一用户公开引用。 */
  readonly userRef: UserRef
  /** 需要解绑的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 当前小程序或应用的稳定范围，禁止跨范围删除。 */
  readonly appScope: string
  /** 服务端可信解绑时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** 创建、恢复或安全重放平台绑定后的脱敏内部结果。 */
export type BindOrRestorePlatformIdentityResult = {
  /** 本次实际状态转换类别。 */
  readonly kind: 'created' | 'restored' | 'replayed'
  /** 已绑定的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 已绑定的应用范围。 */
  readonly appScope: string
}

/** 成功解绑平台入口后的脱敏内部结果。 */
export type RevokePlatformIdentityResult = {
  /** 已解绑的平台入口。 */
  readonly platform: PlatformAuthenticationEntry
  /** 已解绑的应用范围。 */
  readonly appScope: string
  /** 解绑后统一用户的新会话撤销版本。 */
  readonly nextSessionVersion: number
}

/** 用户行锁查询的最小 SQL 行。 */
export type PlatformIdentityUserSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'user'
  /** users BIGINT 内部主键十进制文本，仅限当前事务。 */
  readonly user_internal_id: string
  /** 当前会话撤销版本十进制文本。 */
  readonly session_version: string
}

/** 平台身份行锁查询的最小 SQL 行。 */
export type PlatformIdentityBindingSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'binding'
  /** 平台身份 BIGINT 内部主键十进制文本，仅限当前事务。 */
  readonly binding_internal_id: string
  /** 绑定所属用户 BIGINT 内部主键十进制文本。 */
  readonly owner_internal_id: string
  /** 平台身份记录对应的认证入口类型。 */
  readonly platform: PlatformAuthenticationEntry
  /** 平台身份记录所属的小程序或应用范围。 */
  readonly app_scope: string
  /** 平台主体 HMAC-SHA-256。 */
  readonly platform_subject_hash: string
  /** HMAC 密钥版本引用。 */
  readonly subject_hash_key_version: string
  /** 平台身份绑定当前状态。 */
  readonly binding_status: 'active' | 'revoked' | 'conflicted'
}

/** 平台绑定 Repository 可以读取的受控 SQL 行。 */
export type PlatformIdentitySqlRow = PlatformIdentityUserSqlRow | PlatformIdentityBindingSqlRow

/** 参数化 SQL 写入结果。 */
export type PlatformIdentitySqlWriteResult = {
  /** SQL 实际影响行数。 */
  readonly affectedRows: number
}

/** 平台绑定 Repository 使用的事务内参数化 SQL 端口。 */
export type PlatformIdentitySqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务中执行受控锁定查询。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly PlatformIdentitySqlRow[]>
  /** 在调用方事务中执行受控写入。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<PlatformIdentitySqlWriteResult>
}

/** 平台身份绑定 Repository 端口。 */
export type MysqlPlatformIdentityBindingRepository<
  TTransaction extends TransactionExecutionContext
> = {
  /** 创建、恢复或安全重放当前用户的平台身份绑定。 */
  readonly bindOrRestore: (
    transaction: TTransaction,
    input: BindOrRestorePlatformIdentityInput
  ) => Promise<BindOrRestorePlatformIdentityResult>
  /** 解绑非最后一个登录入口，并原子撤销旧会话。 */
  readonly revoke: (
    transaction: TTransaction,
    input: RevokePlatformIdentityInput
  ) => Promise<RevokePlatformIdentityResult>
}

const zero = Number('0')
const one = Number('1')
const sha256Format = /^[a-f0-9]{64}$/u
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const supportedPlatforms = new Set<PlatformAuthenticationEntry>([
  'wechat',
  'douyin',
  'xiaohongshu',
  'phone'
])

/** 校验 BIGINT 内部主键文本，不转换为可能丢精度的 JavaScript number。 */
function verifyInternalId(value: string, label: string): string {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new PlatformIdentityBindingPersistenceError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      `${label}格式不合法`
    )
  }
  return value
}

/** 解析正整数会话版本。 */
function parseVersion(value: string): number {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new PlatformIdentityBindingPersistenceError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '用户会话版本格式不合法'
    )
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < one) {
    throw new PlatformIdentityBindingPersistenceError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '用户会话版本超出安全范围'
    )
  }
  return parsed
}

/** 校验两类命令共有的用户、平台、应用范围和时间。 */
function verifyCommonInput(input: RevokePlatformIdentityInput): void {
  if (
    !userRefFormat.test(input.userRef) ||
    !supportedPlatforms.has(input.platform) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(input.appScope) ||
    !Number.isSafeInteger(input.occurredAtMs) ||
    input.occurredAtMs < zero
  ) {
    throw new PlatformIdentityBindingPersistenceError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '平台身份绑定命令不合法'
    )
  }
}

/** 校验绑定命令中的摘要、密钥版本与受控密文。 */
function verifyBindInput(input: BindOrRestorePlatformIdentityInput): void {
  verifyCommonInput(input)
  if (
    !sha256Format.test(input.platformSubjectHash) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(input.subjectHashKeyVersion) ||
    (input.platformSubjectCiphertext !== null &&
      (input.platformSubjectCiphertext.length === zero ||
        input.platformSubjectCiphertext.length > Number('8192')))
  ) {
    throw new PlatformIdentityBindingPersistenceError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '平台主体摘要或密文不合法'
    )
  }
}

/** 读取并校验唯一活跃用户行锁。 */
async function lockUser<TTransaction extends TransactionExecutionContext>(
  executor: PlatformIdentitySqlExecutor<TTransaction>,
  transaction: TTransaction,
  userRef: UserRef
): Promise<{ readonly userInternalId: string; readonly sessionVersion: number }> {
  const rows = await executor.executeQuery(
    transaction,
    `SELECT 'user' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`user_internal_id\`,
            CAST(\`session_version\` AS CHAR) AS \`session_version\`
     FROM \`users\` WHERE \`public_user_id\` = ? AND \`status\` = 'active' FOR UPDATE`,
    [userRef]
  )
  const row = rows[zero]
  if (rows.length !== one || row?.kind !== 'user') {
    throw new PlatformIdentityBindingPersistenceError('PRINCIPAL_INVALID', '统一用户不存在或已失效')
  }
  return {
    userInternalId: verifyInternalId(row.user_internal_id, '统一用户内部主键'),
    sessionVersion: parseVersion(row.session_version)
  }
}

/** 校验锁定平台身份行的内部字段。 */
function verifyBindingRow(row: PlatformIdentityBindingSqlRow): PlatformIdentityBindingSqlRow {
  verifyInternalId(row.binding_internal_id, '平台身份内部主键')
  verifyInternalId(row.owner_internal_id, '平台身份所属用户内部主键')
  if (
    !supportedPlatforms.has(row.platform) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(row.app_scope) ||
    !sha256Format.test(row.platform_subject_hash) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(row.subject_hash_key_version)
  ) {
    throw new PlatformIdentityBindingPersistenceError(
      'INTERNAL_IDENTITY_DATA_INVALID',
      '平台身份锁定行不合法'
    )
  }
  return row
}

/** 要求一次关键状态写入恰好影响一行。 */
function assertSingleWrite(result: PlatformIdentitySqlWriteResult, message: string): void {
  if (result.affectedRows !== one) {
    throw new PlatformIdentityBindingPersistenceError('WRITE_CONFLICT', message)
  }
}

/** 识别 MySQL 唯一键拒绝；仅在身份绑定 INSERT 边界转换为稳定的业务冲突。 */
function isMysqlUniqueConstraintViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const mysqlError = error as { readonly code?: unknown; readonly errno?: unknown }
  return mysqlError.code === 'ER_DUP_ENTRY' || mysqlError.errno === Number('1062')
}

/** 创建只访问 identity 用户、平台身份和会话表的 Repository。 */
export function createMysqlPlatformIdentityBindingRepository<
  TTransaction extends TransactionExecutionContext
>(
  executor: PlatformIdentitySqlExecutor<TTransaction>
): MysqlPlatformIdentityBindingRepository<TTransaction> {
  const bindOrRestore = async (
    transaction: TTransaction,
    input: BindOrRestorePlatformIdentityInput
  ): Promise<BindOrRestorePlatformIdentityResult> => {
    verifyBindInput(input)
    const user = await lockUser(executor, transaction, input.userRef)
    // 先用普通一致性读探测主体；缺失唯一键上的 FOR UPDATE 可能在 InnoDB 下锁住间隙，
    // 让并发创建互相等待甚至死锁。已有记录会在下方按主键重新读取并加行锁。
    const observedSubjectRows = await executor.executeQuery(
      transaction,
      `SELECT 'binding' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`binding_internal_id\`,
              CAST(\`user_internal_id\` AS CHAR) AS \`owner_internal_id\`, \`platform\`,
              \`app_scope\`, \`platform_subject_hash\`, \`subject_hash_key_version\`,
              \`binding_status\`
       FROM \`platform_identities\`
       WHERE \`platform\` = ? AND \`app_scope\` = ? AND \`platform_subject_hash\` = ?`,
      [input.platform, input.appScope, input.platformSubjectHash]
    )
    if (
      observedSubjectRows.length > one ||
      observedSubjectRows.some(row => row.kind !== 'binding')
    ) {
      throw new PlatformIdentityBindingPersistenceError(
        'INTERNAL_IDENTITY_DATA_INVALID',
        '平台主体唯一绑定记录损坏'
      )
    }
    const observedSubjectRow = observedSubjectRows[zero] as
      | PlatformIdentityBindingSqlRow
      | undefined
    let subjectRow: PlatformIdentityBindingSqlRow | undefined
    if (observedSubjectRow !== undefined) {
      verifyBindingRow(observedSubjectRow)
      // 只对已确认存在的记录按主键做当前读并锁行，保护重放、恢复与并发解绑的状态判断。
      const lockedSubjectRows = await executor.executeQuery(
        transaction,
        `SELECT 'binding' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`binding_internal_id\`,
                CAST(\`user_internal_id\` AS CHAR) AS \`owner_internal_id\`, \`platform\`,
                \`app_scope\`, \`platform_subject_hash\`, \`subject_hash_key_version\`,
                \`binding_status\`
         FROM \`platform_identities\`
         WHERE \`id\` = ? FOR UPDATE`,
        [observedSubjectRow.binding_internal_id]
      )
      if (lockedSubjectRows.length !== one || lockedSubjectRows[zero]?.kind !== 'binding') {
        throw new PlatformIdentityBindingPersistenceError(
          'INTERNAL_IDENTITY_DATA_INVALID',
          '平台主体锁定行在事务中消失或损坏'
        )
      }
      const lockedSubjectRow = verifyBindingRow(
        lockedSubjectRows[zero] as PlatformIdentityBindingSqlRow
      )
      if (
        lockedSubjectRow.binding_internal_id !== observedSubjectRow.binding_internal_id ||
        lockedSubjectRow.owner_internal_id !== observedSubjectRow.owner_internal_id ||
        lockedSubjectRow.platform !== input.platform ||
        lockedSubjectRow.app_scope !== input.appScope ||
        lockedSubjectRow.platform_subject_hash !== input.platformSubjectHash
      ) {
        throw new PlatformIdentityBindingPersistenceError(
          'INTERNAL_IDENTITY_DATA_INVALID',
          '平台主体锁定行与查询主体不一致'
        )
      }
      if (
        lockedSubjectRow.owner_internal_id !== user.userInternalId ||
        lockedSubjectRow.binding_status === 'conflicted'
      ) {
        throw new PlatformIdentityBindingPersistenceError(
          'IDENTITY_BINDING_CONFLICT',
          '平台主体已经绑定或处于冲突状态'
        )
      }
      subjectRow = lockedSubjectRow
    }
    const slotRows = await executor.executeQuery(
      transaction,
      `SELECT 'binding' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`binding_internal_id\`,
              CAST(\`user_internal_id\` AS CHAR) AS \`owner_internal_id\`, \`platform\`,
              \`app_scope\`, \`platform_subject_hash\`, \`subject_hash_key_version\`,
              \`binding_status\`
       FROM \`platform_identities\`
       WHERE \`user_internal_id\` = ? AND \`platform\` = ? AND \`app_scope\` = ?
         AND \`active_slot\` = 1
       FOR UPDATE`,
      [user.userInternalId, input.platform, input.appScope]
    )
    if (slotRows.length > one || slotRows.some(row => row.kind !== 'binding')) {
      throw new PlatformIdentityBindingPersistenceError(
        'INTERNAL_IDENTITY_DATA_INVALID',
        '平台身份 active 槽位损坏'
      )
    }
    const slotRow = slotRows[zero] as PlatformIdentityBindingSqlRow | undefined
    if (slotRow !== undefined) {
      verifyBindingRow(slotRow)
      if (
        subjectRow === undefined ||
        slotRow.binding_internal_id !== subjectRow.binding_internal_id
      ) {
        throw new PlatformIdentityBindingPersistenceError(
          'IDENTITY_BINDING_CONFLICT',
          '当前平台应用范围已经存在其他登录入口'
        )
      }
    }
    if (subjectRow?.binding_status === 'active') {
      return { kind: 'replayed', platform: input.platform, appScope: input.appScope }
    }
    if (subjectRow?.binding_status === 'revoked') {
      assertSingleWrite(
        await executor.executeWrite(
          transaction,
          `UPDATE \`platform_identities\`
           SET \`binding_status\` = 'active',
               \`subject_hash_key_version\` = ?, \`platform_subject_ciphertext\` = ?,
               \`revoked_at_ms\` = NULL, \`updated_at_ms\` = ?
           WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`binding_status\` = 'revoked'`,
          [
            input.subjectHashKeyVersion,
            input.platformSubjectCiphertext,
            input.occurredAtMs,
            subjectRow.binding_internal_id,
            user.userInternalId
          ]
        ),
        '平台身份恢复冲突'
      )
      return { kind: 'restored', platform: input.platform, appScope: input.appScope }
    }
    let insertResult: PlatformIdentitySqlWriteResult
    try {
      insertResult = await executor.executeWrite(
        transaction,
        `INSERT INTO \`platform_identities\`
         (\`_openid\`, \`user_internal_id\`, \`platform\`, \`platform_subject_hash\`,
          \`subject_hash_algorithm\`, \`subject_hash_key_version\`,
          \`platform_subject_ciphertext\`, \`app_scope\`, \`binding_status\`,
          \`bound_at_ms\`, \`revoked_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
         VALUES ('', ?, ?, ?, 'HMAC-SHA-256', ?, ?, ?, 'active', ?, NULL, ?, ?)`,
        [
          user.userInternalId,
          input.platform,
          input.platformSubjectHash,
          input.subjectHashKeyVersion,
          input.platformSubjectCiphertext,
          input.appScope,
          input.occurredAtMs,
          input.occurredAtMs,
          input.occurredAtMs
        ]
      )
    } catch (error: unknown) {
      // 仅将数据库明确报告的唯一键冲突映射为稳定业务冲突；死锁等错误须原样上抛并由事务层回滚。
      if (isMysqlUniqueConstraintViolation(error)) {
        throw new PlatformIdentityBindingPersistenceError(
          'IDENTITY_BINDING_CONFLICT',
          '平台主体或当前用户登录槽位已被其他绑定占用'
        )
      }
      throw error
    }
    assertSingleWrite(insertResult, '平台身份创建冲突')
    return { kind: 'created', platform: input.platform, appScope: input.appScope }
  }

  const revoke = async (
    transaction: TTransaction,
    input: RevokePlatformIdentityInput
  ): Promise<RevokePlatformIdentityResult> => {
    verifyCommonInput(input)
    const user = await lockUser(executor, transaction, input.userRef)
    const rows = await executor.executeQuery(
      transaction,
      `SELECT 'binding' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`binding_internal_id\`,
              CAST(\`user_internal_id\` AS CHAR) AS \`owner_internal_id\`, \`platform\`,
              \`app_scope\`, \`platform_subject_hash\`, \`subject_hash_key_version\`,
              \`binding_status\`
       FROM \`platform_identities\`
       WHERE \`user_internal_id\` = ? AND \`binding_status\` = 'active'
       ORDER BY \`id\` FOR UPDATE`,
      [user.userInternalId]
    )
    const bindings = rows.map(row => {
      if (row.kind !== 'binding') {
        throw new PlatformIdentityBindingPersistenceError(
          'INTERNAL_IDENTITY_DATA_INVALID',
          '平台身份 active 列表包含非法行'
        )
      }
      return verifyBindingRow(row)
    })
    const target = bindings.find(
      binding => binding.platform === input.platform && binding.app_scope === input.appScope
    )
    if (target === undefined) {
      throw new PlatformIdentityBindingPersistenceError(
        'PRINCIPAL_INVALID',
        '当前平台登录入口不存在或已经撤销'
      )
    }
    if (bindings.length <= one) {
      throw new PlatformIdentityBindingPersistenceError(
        'IDENTITY_LAST_BINDING_REQUIRED',
        '最后一个登录入口不能解绑'
      )
    }
    assertSingleWrite(
      await executor.executeWrite(
        transaction,
        `UPDATE \`platform_identities\`
         SET \`binding_status\` = 'revoked', \`revoked_at_ms\` = ?, \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`user_internal_id\` = ? AND \`binding_status\` = 'active'`,
        [input.occurredAtMs, input.occurredAtMs, target.binding_internal_id, user.userInternalId]
      ),
      '平台身份解绑冲突'
    )
    await executor.executeWrite(
      transaction,
      `UPDATE \`user_sessions\`
       SET \`status\` = 'expired', \`updated_at_ms\` = ?
       WHERE \`user_internal_id\` = ? AND \`status\` = 'active' AND \`expires_at_ms\` <= ?`,
      [input.occurredAtMs, user.userInternalId, input.occurredAtMs]
    )
    await executor.executeWrite(
      transaction,
      `UPDATE \`user_sessions\`
       SET \`status\` = 'revoked', \`revoked_at_ms\` = ?, \`updated_at_ms\` = ?
       WHERE \`user_internal_id\` = ? AND \`status\` = 'active' AND \`expires_at_ms\` > ?`,
      [input.occurredAtMs, input.occurredAtMs, user.userInternalId, input.occurredAtMs]
    )
    assertSingleWrite(
      await executor.executeWrite(
        transaction,
        `UPDATE \`users\`
         SET \`session_version\` = \`session_version\` + 1, \`updated_at_ms\` = ?
         WHERE \`id\` = ? AND \`status\` = 'active' AND \`session_version\` = ?`,
        [input.occurredAtMs, user.userInternalId, user.sessionVersion]
      ),
      '用户会话版本更新冲突'
    )
    return {
      platform: input.platform,
      appScope: input.appScope,
      nextSessionVersion: user.sessionVersion + one
    }
  }

  return { bindOrRestore, revoke }
}
