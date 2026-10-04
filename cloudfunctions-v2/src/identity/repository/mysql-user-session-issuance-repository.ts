import type { VerifiedPlatformIdentityEvidence } from '../provider/platform-credential-evidence.js'
import type { UserSessionPersistenceMaterial } from '../domain/user-session-issuance-material.js'
import type { UserRef } from '../../contracts/types.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import {
  toSqlParameters,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'

/** Identity 会话签发 Repository 可安全映射的稳定持久化错误。 */
export type IdentitySessionIssuancePersistenceErrorType =
  | 'IDENTITY_BINDING_RACE'
  | 'IDENTITY_SESSION_DATA_INVALID'
  | 'PRINCIPAL_INVALID'
  | 'IDENTITY_SESSION_WRITE_CONFLICT'

/** 持久化错误不携带 SQL、凭证、平台主体或数据库内部主键。 */
export class IdentitySessionIssuancePersistenceError extends Error {
  /** 供应用层区分可恢复的唯一绑定争用和其他失败。 */
  readonly type: IdentitySessionIssuancePersistenceErrorType

  /** 创建可安全分类的身份会话持久化错误。 */
  constructor(type: IdentitySessionIssuancePersistenceErrorType, message: string) {
    super(message)
    this.name = 'IdentitySessionIssuancePersistenceError'
    this.type = type
  }
}

/** 原子创建或复用统一用户及平台绑定，并在同一事务插入新登录会话的输入。 */
export type PersistIdentitySessionIssuanceInput = {
  /** 仅含 Provider 验真后生成的平台主体 HMAC 候选，不含主体原文。 */
  readonly identity: Readonly<VerifiedPlatformIdentityEvidence>
  /** 服务端生成的高熵统一用户公开引用；仅新建用户时使用。 */
  readonly newUserRef: UserRef
  /** 不含 Bearer 原文的会话持久化材料。 */
  readonly session: Readonly<UserSessionPersistenceMaterial>
}

/** 已完成持久化后仅在当前应用调用栈中使用的结果。 */
export type PersistIdentitySessionIssuanceResult = {
  /** 统一用户的撤销版本；写入新会话以供后续 Principal 校验。 */
  readonly sessionVersion: number
}

/** Identity 会话 Repository 对事务的唯一写入入口。 */
export type IdentitySessionIssuanceRepository<TTransaction extends TransactionExecutionContext> = {
  /** 原子复用/创建用户、平台绑定并新增一个会话。 */
  readonly persist: (
    transaction: TTransaction,
    input: PersistIdentitySessionIssuanceInput
  ) => Promise<PersistIdentitySessionIssuanceResult>
}

/** InnoDB 查询行只允许 BIGINT 主键以十进制文本流转，避免 JavaScript 数值精度损失。 */
type IdentitySessionSqlRow = Readonly<Record<string, unknown>>

/** 新建用户及平台身份时使用的当前初始会话版本。 */
const initialSessionVersion = Number('1')
/** 一条受控身份绑定或会话写入必须恰好影响一行。 */
const oneAffectedRow = Number('1')
/** 平台主体 HMAC 摘要仅允许小写 SHA-256 十六进制。 */
const sha256Pattern = /^[a-f0-9]{64}$/u
/** 身份域公开用户引用格式；它不是数据库内部主键。 */
const userRefPattern = /^usr_[A-Za-z0-9_-]{8,}$/u
/** 本次登录合同允许的统一平台身份枚举。 */
const allowedPlatforms = new Set(['wechat', 'douyin', 'xiaohongshu', 'phone'])

/** 将未知数据库字段收窄为非空字符串，拒绝损坏行继续进入会话签发。 */
function readSqlString(row: IdentitySessionSqlRow, field: string): string {
  const value = row[field]
  if (typeof value !== 'string' || value.length === Number('0')) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '身份数据库记录不合法'
    )
  }
  return value
}

/** 验证数据库 BIGINT 内部主键的十进制文本，不把它转换成浮点数。 */
function verifyInternalId(value: string): string {
  if (!/^[1-9][0-9]*$/u.test(value)) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '身份数据库主键不合法'
    )
  }
  return value
}

/** 校验 Provider 验真材料与密钥轮换候选，避免空摘要或重复候选写入身份表。 */
function verifyIdentityEvidence(identity: Readonly<VerifiedPlatformIdentityEvidence>): void {
  if (
    !allowedPlatforms.has(identity.platform) ||
    !/^[A-Za-z0-9._-]{1,64}$/u.test(identity.appScope) ||
    identity.hashCandidates.length === Number('0')
  ) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '已验证平台身份材料不合法'
    )
  }

  const versions = new Set<string>()
  for (const candidate of identity.hashCandidates) {
    if (
      !sha256Pattern.test(candidate.platformSubjectHash) ||
      !/^[A-Za-z0-9._-]{1,64}$/u.test(candidate.subjectHashKeyVersion) ||
      versions.has(candidate.subjectHashKeyVersion)
    ) {
      throw new IdentitySessionIssuancePersistenceError(
        'IDENTITY_SESSION_DATA_INVALID',
        '已验证平台身份摘要候选不合法'
      )
    }
    versions.add(candidate.subjectHashKeyVersion)
  }
}

/** 仅把 MySQL ER_DUP_ENTRY 映射成身份绑定争用；死锁和其他 SQL 错误原样上抛。 */
function isMysqlUniqueConstraintViolation(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false
  }
  const mysqlError = error as { readonly code?: unknown; readonly errno?: unknown }
  return mysqlError.code === 'ER_DUP_ENTRY' || mysqlError.errno === Number('1062')
}

/** 锁定统一用户行并读取当前会话撤销版本。 */
async function lockActiveUser(
  transaction: MysqlTransactionContext<Mysql2QueryConnection>,
  userInternalId: string
): Promise<number> {
  const rows = await transaction.connection.query(
    `SELECT \`public_user_id\`, \`status\`, CAST(\`session_version\` AS CHAR) AS \`session_version\`
     FROM \`users\` WHERE \`id\` = ? FOR UPDATE`,
    toSqlParameters([userInternalId])
  )
  const row = rows[Number('0')]
  if (rows.length !== Number('1') || row === undefined) {
    throw new IdentitySessionIssuancePersistenceError('PRINCIPAL_INVALID', '统一用户不可用')
  }
  if (
    !userRefPattern.test(readSqlString(row, 'public_user_id')) ||
    readSqlString(row, 'status') !== 'active'
  ) {
    throw new IdentitySessionIssuancePersistenceError('PRINCIPAL_INVALID', '统一用户不可用')
  }
  const sessionVersion = readSqlString(row, 'session_version')
  if (!/^[1-9][0-9]*$/u.test(sessionVersion) || !Number.isSafeInteger(Number(sessionVersion))) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '统一用户会话版本不合法'
    )
  }
  return Number(sessionVersion)
}

/** 已存在的身份绑定在事务外普通读探测后，再按主键加锁并复核关键字段。 */
async function lockActiveBinding(
  transaction: MysqlTransactionContext<Mysql2QueryConnection>,
  observed: IdentitySessionSqlRow,
  identity: Readonly<VerifiedPlatformIdentityEvidence>
): Promise<{
  readonly bindingInternalId: string
  readonly userInternalId: string
  readonly sessionVersion: number
}> {
  const bindingInternalId = verifyInternalId(readSqlString(observed, 'binding_internal_id'))
  const userInternalId = verifyInternalId(readSqlString(observed, 'user_internal_id'))
  const observedHash = readSqlString(observed, 'platform_subject_hash')
  const observedKeyVersion = readSqlString(observed, 'subject_hash_key_version')
  const expectedCandidate = identity.hashCandidates.find(
    candidate =>
      candidate.platformSubjectHash === observedHash &&
      candidate.subjectHashKeyVersion === observedKeyVersion
  )
  if (!expectedCandidate) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '平台身份摘要与当前密钥快照不匹配'
    )
  }

  // 固定先锁用户、再锁绑定，与现有绑定撤销流程保持一致，避免反向锁顺序。
  const sessionVersion = await lockActiveUser(transaction, userInternalId)
  const rows = await transaction.connection.query(
    `SELECT CAST(\`user_internal_id\` AS CHAR) AS \`user_internal_id\`, \`platform\`,
            \`app_scope\`, \`platform_subject_hash\`, \`subject_hash_key_version\`, \`binding_status\`
     FROM \`platform_identities\` WHERE \`id\` = ? FOR UPDATE`,
    toSqlParameters([bindingInternalId])
  )
  const row = rows[Number('0')]
  if (rows.length !== Number('1') || row === undefined) {
    throw new IdentitySessionIssuancePersistenceError('PRINCIPAL_INVALID', '平台身份不可用')
  }
  if (
    readSqlString(row, 'user_internal_id') !== userInternalId ||
    readSqlString(row, 'platform') !== identity.platform ||
    readSqlString(row, 'app_scope') !== identity.appScope ||
    readSqlString(row, 'platform_subject_hash') !== expectedCandidate.platformSubjectHash ||
    readSqlString(row, 'subject_hash_key_version') !== expectedCandidate.subjectHashKeyVersion ||
    readSqlString(row, 'binding_status') !== 'active'
  ) {
    throw new IdentitySessionIssuancePersistenceError('PRINCIPAL_INVALID', '平台身份不可用')
  }
  return { bindingInternalId, userInternalId, sessionVersion }
}

/** 插入一行并以同一事务连接读取精确的自增 BIGINT 文本。 */
async function insertAndReadInternalId(
  transaction: MysqlTransactionContext<Mysql2QueryConnection>,
  sql: string,
  parameters: readonly unknown[]
): Promise<string> {
  const result = await transaction.connection.execute(sql, toSqlParameters(parameters))
  if (result.affectedRows !== oneAffectedRow) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_WRITE_CONFLICT',
      '身份数据写入未完成'
    )
  }
  const rows = await transaction.connection.query(
    'SELECT CAST(LAST_INSERT_ID() AS CHAR) AS internal_id',
    []
  )
  const row = rows[Number('0')]
  if (rows.length !== Number('1') || row === undefined) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '身份数据写入结果不可读'
    )
  }
  return verifyInternalId(readSqlString(row, 'internal_id'))
}

/** 读取候选 HMAC 对应的已有身份；缺失时使用普通一致性读，不锁唯一索引间隙。 */
async function findObservedBinding(
  transaction: MysqlTransactionContext<Mysql2QueryConnection>,
  identity: Readonly<VerifiedPlatformIdentityEvidence>
): Promise<IdentitySessionSqlRow | null> {
  const placeholders = identity.hashCandidates.map(() => '?').join(', ')
  const rows = await transaction.connection.query(
    `SELECT CAST(\`id\` AS CHAR) AS \`binding_internal_id\`,
            CAST(\`user_internal_id\` AS CHAR) AS \`user_internal_id\`, \`platform\`, \`app_scope\`,
            \`platform_subject_hash\`, \`subject_hash_key_version\`, \`binding_status\`
     FROM \`platform_identities\`
     WHERE \`platform\` = ? AND \`app_scope\` = ? AND \`platform_subject_hash\` IN (${placeholders})`,
    toSqlParameters([
      identity.platform,
      identity.appScope,
      ...identity.hashCandidates.map(candidate => candidate.platformSubjectHash)
    ])
  )
  if (rows.length > Number('1')) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '平台身份摘要匹配到多条绑定'
    )
  }
  return rows[Number('0')] ?? null
}

/** 锁定或创建统一用户和平台身份，返回只供同事务写会话使用的内部键。 */
async function resolveOrCreatePrincipal(
  transaction: MysqlTransactionContext<Mysql2QueryConnection>,
  input: PersistIdentitySessionIssuanceInput
): Promise<{
  readonly userInternalId: string
  readonly bindingInternalId: string
  readonly sessionVersion: number
}> {
  const observed = await findObservedBinding(transaction, input.identity)
  if (observed !== null) {
    const locked = await lockActiveBinding(transaction, observed, input.identity)
    return {
      userInternalId: locked.userInternalId,
      bindingInternalId: locked.bindingInternalId,
      sessionVersion: locked.sessionVersion
    }
  }

  if (!userRefPattern.test(input.newUserRef)) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '新建用户引用不合法'
    )
  }
  const userInternalId = await insertAndReadInternalId(
    transaction,
    `INSERT INTO \`users\` (\`public_user_id\`, \`status\`, \`session_version\`, \`created_at_ms\`, \`updated_at_ms\`)
     VALUES (?, 'active', ?, ?, ?)`,
    [input.newUserRef, initialSessionVersion, input.session.issuedAtMs, input.session.issuedAtMs]
  )
  const currentCandidate = input.identity.hashCandidates[Number('0')]
  if (currentCandidate === undefined) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_DATA_INVALID',
      '平台身份摘要候选缺失'
    )
  }
  let bindingInternalId: string
  try {
    bindingInternalId = await insertAndReadInternalId(
      transaction,
      `INSERT INTO \`platform_identities\` (
         \`user_internal_id\`, \`platform\`, \`platform_subject_hash\`, \`subject_hash_key_version\`,
         \`app_scope\`, \`binding_status\`, \`bound_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`
       ) VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`,
      [
        userInternalId,
        input.identity.platform,
        currentCandidate.platformSubjectHash,
        currentCandidate.subjectHashKeyVersion,
        input.identity.appScope,
        input.session.issuedAtMs,
        input.session.issuedAtMs,
        input.session.issuedAtMs
      ]
    )
  } catch (error: unknown) {
    if (isMysqlUniqueConstraintViolation(error)) {
      throw new IdentitySessionIssuancePersistenceError(
        'IDENTITY_BINDING_RACE',
        '平台身份绑定正在由另一请求建立'
      )
    }
    throw error
  }
  return {
    userInternalId,
    bindingInternalId,
    sessionVersion: initialSessionVersion
  }
}

/** 在已获得统一用户和绑定的同一事务内插入 Bearer 摘要会话。 */
async function insertSession(
  transaction: MysqlTransactionContext<Mysql2QueryConnection>,
  input: PersistIdentitySessionIssuanceInput,
  principal: {
    readonly userInternalId: string
    readonly bindingInternalId: string
    readonly sessionVersion: number
  }
): Promise<void> {
  const result = await transaction.connection.execute(
    `INSERT INTO \`user_sessions\` (
       \`session_ref_hash\`, \`user_internal_id\`, \`platform_identity_internal_id\`,
       \`rotated_from_session_internal_id\`, \`session_version\`, \`authenticated_via\`, \`status\`,
       \`issued_at_ms\`, \`expires_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`,
       \`session_policy_release_version\`, \`session_policy_snapshot_sha256\`
     ) VALUES (?, ?, ?, NULL, ?, ?, 'active', ?, ?, ?, ?, ?, ?)`,
    toSqlParameters([
      input.session.sessionRefHash,
      principal.userInternalId,
      principal.bindingInternalId,
      principal.sessionVersion,
      input.identity.platform,
      input.session.issuedAtMs,
      input.session.expiresAtMs,
      input.session.issuedAtMs,
      input.session.issuedAtMs,
      input.session.policyReleaseVersion,
      input.session.policySnapshotSha256
    ])
  )
  if (result.affectedRows !== oneAffectedRow) {
    throw new IdentitySessionIssuancePersistenceError(
      'IDENTITY_SESSION_WRITE_CONFLICT',
      '用户会话写入未完成'
    )
  }
}

/** 创建只访问 users、platform_identities、user_sessions 的身份登录 Repository。 */
export function createMysqlIdentitySessionIssuanceRepository(): IdentitySessionIssuanceRepository<
  MysqlTransactionContext<Mysql2QueryConnection>
> {
  return {
    persist: async (transaction, input) => {
      verifyIdentityEvidence(input.identity)
      const principal = await resolveOrCreatePrincipal(transaction, input)
      await insertSession(transaction, input, principal)
      return { sessionVersion: principal.sessionVersion }
    }
  }
}
