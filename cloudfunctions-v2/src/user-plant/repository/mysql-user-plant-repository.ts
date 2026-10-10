import {
  USER_PLANT_INITIAL_VERSION,
  type CreateUserPlantResponseDto,
  type PlantIdentityRef,
  type UserPlantDto,
  type UserPlantRef,
  type UserRef
} from '../../contracts/types.js'
import type { TransactionExecutionContext } from '../../foundation/database/transaction-runner.js'
import { projectPublicProfile, type PublicProfileRow } from '../domain/public-profile.js'

const zero = Number('0')
const one = Number('1')
const userPublicRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const userPlantPublicRefFormat = /^upl_[A-Za-z0-9_-]{8,}$/u
const positiveIntegerTextFormat = /^[1-9][0-9]*$/u
const nonNegativeIntegerTextFormat = /^(?:0|[1-9][0-9]*)$/u
const plantIdentityPublicRefFormat = /^pid_[A-Za-z0-9_-]{8,}$/u

/** 用户植物持久化层可以产生的稳定内部错误类型。 */
export type UserPlantPersistenceErrorType =
  | 'PRINCIPAL_INVALID'
  | 'USER_PLANT_NOT_FOUND'
  | 'INTERNAL_DATA_INVALID'

/**
 * Repository 错误只能由应用层映射为稳定公开错误。
 * 消息不携带 SQL、数据库内部主键、平台主体或凭证。
 */
export class UserPlantPersistenceError extends Error {
  /** 稳定错误类型；内部数据错误对外必须泛化。 */
  readonly type: UserPlantPersistenceErrorType

  constructor(type: UserPlantPersistenceErrorType, message: string) {
    super(message)
    this.name = '用户植物持久化错误'
    this.type = type
  }
}

/** MySQL 驱动返回的最小写入结果。 */
export type UserPlantSqlWriteResult = {
  /** 参数化语句真实影响的行数。 */
  readonly affectedRows: number
}

/** 锁定统一用户时允许读回的最小行。 */
export type UserPlantUserSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'user'
  /** 统一用户 BIGINT 内部主键的十进制文本，只在 Repository 内传递。 */
  readonly user_internal_id: string
  /** 统一用户当前状态。 */
  readonly user_status: 'active' | 'suspended' | 'deleting' | 'deleted'
}

/** active 用户植物数量查询的最小行。 */
export type UserPlantCountSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'count'
  /** COUNT 结果的非负十进制文本。 */
  readonly active_count: string
}

/** 创建后按公开引用读回的最小用户植物行。 */
export type UserPlantCreateProjectionSqlRow = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'plant'
  /** 高熵用户植物公开引用。 */
  readonly public_user_plant_id: string
  /** 创建切片只允许 active 生命周期。 */
  readonly lifecycle_status: string
  /** 创建切片只允许 unidentified 身份状态。 */
  readonly current_identity_status: string
  /** 乐观锁版本的十进制文本。 */
  readonly version: string
  /** 创建时间 UTC 毫秒的十进制文本。 */
  readonly created_at_ms: string
  /** 更新时间 UTC 毫秒的十进制文本。 */
  readonly updated_at_ms: string
}

/** 单株读取查询返回的最小、已脱敏投影行。 */
export type UserPlantReadProjectionSqlRow = PublicProfileRow & {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'read-plant'
  /** 用户植物高熵公开引用。 */
  readonly public_user_plant_id: string
  /** 数据库生命周期原值；普通用户查询仅允许 active/archived。 */
  readonly lifecycle_status: string
  /** 用户植物当前身份状态原值。 */
  readonly current_identity_status: string
  /** 乐观锁版本的十进制文本。 */
  readonly version: string
  /** 创建时间 UTC 毫秒的十进制文本。 */
  readonly created_at_ms: string
  /** 更新时间 UTC 毫秒的十进制文本。 */
  readonly updated_at_ms: string
  /** 只有确认身份时才允许返回的已发布植物身份公开引用；无确认身份时必须为空。 */
  readonly confirmed_identity_ref: string | null
}

/** 用户植物 Repository 的全部受控 SQL 行联合类型。 */
export type UserPlantSqlRow =
  | UserPlantUserSqlRow
  | UserPlantCountSqlRow
  | UserPlantCreateProjectionSqlRow
  | UserPlantReadProjectionSqlRow

/** 用户植物 Repository 使用的参数化 SQL 执行端口。 */
export type UserPlantSqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在调用方事务中执行参数化查询；行锁服从同一事务生命周期。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly UserPlantSqlRow[]>
  /** 在调用方事务中执行参数化 INSERT 或 UPDATE。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<UserPlantSqlWriteResult>
}

/** 串行化 active 数量检查所需的锁定结果。 */
export type LockedUserPlantCount = {
  /** 统一用户 BIGINT 内部主键文本；只允许继续传给同一事务内的 Repository。 */
  readonly userInternalId: string
  /** 持有用户行锁后读取的 active 用户植物数量。 */
  readonly activeCount: number
}

/** 插入一株暂未识别用户植物所需的内部持久化输入。 */
export type InsertUnidentifiedUserPlantInput = {
  /** 已在同一事务锁定的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 服务端生成的高熵用户植物公开引用。 */
  readonly userPlantRef: UserPlantRef
  /** 创建发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** MySQL 用户植物 Repository 的创建和单株读取端口。 */
export type MysqlUserPlantRepository<TTransaction extends TransactionExecutionContext> = {
  /** 锁定统一用户行后读取 active 数量，串行化同一用户的并发创建。 */
  readonly lockUserAndCountActive: (
    transaction: TTransaction,
    userRef: UserRef
  ) => Promise<LockedUserPlantCount>
  /** 在已锁定同一用户的事务中插入固定初态用户植物。 */
  readonly insertUnidentifiedUserPlant: (
    transaction: TTransaction,
    input: InsertUnidentifiedUserPlantInput
  ) => Promise<void>
  /** 按统一用户与用户植物公开引用读回刚创建的固定初始投影。 */
  readonly readCreateInitialProjection: (
    transaction: TTransaction,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ) => Promise<CreateUserPlantResponseDto>
  /** 以统一用户和公开植物引用执行归属查询，并遮蔽删除中或已删除资源。 */
  readonly getOwnedUserPlant: (
    transaction: TTransaction,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ) => Promise<UserPlantDto>
}

/** 把数据库 BIGINT 文本验证为正整数，但不转换成可能丢精度的 JavaScript number。 */
function verifyInternalPrimaryKey(value: string): void {
  if (!positiveIntegerTextFormat.test(value)) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物内部归属数据不合法')
  }
}

/** 把安全范围内的十进制文本转换为 JavaScript 整数。 */
function resolveSafeNonNegativeInteger(value: string, message: string): number {
  if (!nonNegativeIntegerTextFormat.test(value)) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < zero) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  return parsed
}

/** 把数据库十进制文本验证为安全正整数。 */
function resolveSafePositiveInteger(value: string, message: string): number {
  const parsed = resolveSafeNonNegativeInteger(value, message)
  if (parsed === zero) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  return parsed
}

/** 将数据库 UTC 毫秒严格转换为可表示的标准 ISO-8601 时间。 */
function resolveUtcTimestamp(value: string, message: string): string {
  const milliseconds = resolveSafeNonNegativeInteger(value, message)
  const date = new Date(milliseconds)
  if (Number.isNaN(date.getTime())) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  return date.toISOString()
}

/** 要求查询恰好返回一个指定判别类型的行。 */
function readSingleRow<TType extends UserPlantSqlRow['kind']>(
  rows: readonly UserPlantSqlRow[],
  kind: TType,
  message: string
): Extract<UserPlantSqlRow, { readonly kind: TType }> {
  const row = rows[zero]
  if (rows.length !== one || row?.kind !== kind) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', message)
  }
  return row as Extract<UserPlantSqlRow, { readonly kind: TType }>
}

/** 单株与列表共用的只读投影 SQL（SELECT 列 + JOIN）；调用方只追加归属与生命周期 WHERE。 */
export const READ_PLANT_PROJECTION_SQL = `SELECT 'read-plant' AS \`kind\`, \`p\`.\`public_user_plant_id\`, \`p\`.\`lifecycle_status\`,
              \`p\`.\`current_identity_status\`, CAST(\`p\`.\`version\` AS CHAR) AS \`version\`,
              CAST(\`p\`.\`created_at_ms\` AS CHAR) AS \`created_at_ms\`,
              CAST(\`p\`.\`updated_at_ms\` AS CHAR) AS \`updated_at_ms\`,
              \`i\`.\`public_identity_ref\` AS \`confirmed_identity_ref\`,
              CAST(\`f\`.\`id\` AS CHAR) AS \`profile_internal_id\`, \`f\`.\`nickname\` AS \`profile_nickname\`,
              \`f\`.\`pot_profile_json\` AS \`profile_pot_json\`, \`f\`.\`_openid\` AS \`profile_openid\`
       FROM \`user_plants\` AS \`p\`
       JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`p\`.\`user_internal_id\`
       LEFT JOIN \`plant_identities\` AS \`i\` ON \`i\`.\`id\` = \`p\`.\`confirmed_identity_internal_id\`
       LEFT JOIN \`user_plant_profiles\` AS \`f\` ON \`f\`.\`user_plant_internal_id\` = \`p\`.\`id\` AND \`f\`.\`user_internal_id\` = \`p\`.\`user_internal_id\``

/**
 * 把一行只读投影转换为公开 UserPlantDto；deleting/deleted 视为不可见，损坏数据失败关闭。
 * 单株读取与列表共用，保证列表每一项与单株读取完全一致。
 */
export function projectReadPlantRow(row: UserPlantReadProjectionSqlRow, userPlantRef: UserPlantRef): UserPlantDto {
  if (row.lifecycle_status === 'deleting' || row.lifecycle_status === 'deleted') {
    throw new UserPlantPersistenceError('USER_PLANT_NOT_FOUND', '用户植物不可见')
  }
  if (row.lifecycle_status !== 'active' && row.lifecycle_status !== 'archived') {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物生命周期不合法')
  }
  const version = resolveSafePositiveInteger(row.version, '用户植物版本不合法')
  const createdAtMs = resolveSafeNonNegativeInteger(row.created_at_ms, '用户植物创建时间不合法')
  const updatedAtMs = resolveSafeNonNegativeInteger(row.updated_at_ms, '用户植物更新时间不合法')
  if (updatedAtMs < createdAtMs) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物更新时间早于创建时间')
  }
  const createdAt = resolveUtcTimestamp(row.created_at_ms, '用户植物创建时间不合法')
  const updatedAt = resolveUtcTimestamp(row.updated_at_ms, '用户植物更新时间不合法')
  let profile: ReturnType<typeof projectPublicProfile>
  try { profile = projectPublicProfile(row) } catch {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物档案投影不合法')
  }
  const profileFields = profile === undefined ? {} : { profile }

  if (row.current_identity_status === 'confirmed') {
    if (
      row.confirmed_identity_ref === null ||
      !plantIdentityPublicRefFormat.test(row.confirmed_identity_ref)
    ) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '已确认植物身份引用不合法')
    }
    return {
      user_plant_id: userPlantRef,
      lifecycle: row.lifecycle_status,
      identityStatus: 'confirmed',
      confirmedIdentityRef: row.confirmed_identity_ref as PlantIdentityRef,
      ...profileFields,
      version,
      createdAt,
      updatedAt
    }
  }
  if (
    (row.current_identity_status !== 'unidentified' &&
      row.current_identity_status !== 'candidate_pending') ||
    row.confirmed_identity_ref !== null
  ) {
    throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物身份投影不合法')
  }
  return {
    user_plant_id: userPlantRef,
    lifecycle: row.lifecycle_status,
    identityStatus: row.current_identity_status,
    ...profileFields,
    version,
    createdAt,
    updatedAt
  }
}

/** 创建只访问 identity 用户表与 user-plant 聚合根的 MySQL Repository。 */
export function createMysqlUserPlantRepository<TTransaction extends TransactionExecutionContext>(
  executor: UserPlantSqlExecutor<TTransaction>
): MysqlUserPlantRepository<TTransaction> {
  const lockUserAndCountActive = async (
    transaction: TTransaction,
    userRef: UserRef
  ): Promise<LockedUserPlantCount> => {
    if (!userPublicRefFormat.test(userRef)) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '统一用户公开引用不合法')
    }
    const userRow = readSingleRow(
      await executor.executeQuery(
        transaction,
        `SELECT 'user' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`user_internal_id\`, \`status\` AS \`user_status\`
         FROM \`users\`
         WHERE \`public_user_id\` = ?
         FOR UPDATE`,
        [userRef]
      ),
      'user',
      '统一用户锁定结果不完整'
    )
    verifyInternalPrimaryKey(userRow.user_internal_id)
    if (userRow.user_status !== 'active') {
      throw new UserPlantPersistenceError('PRINCIPAL_INVALID', '登录主体已经失效')
    }

    const countRow = readSingleRow(
      await executor.executeQuery(
        transaction,
        `SELECT 'count' AS \`kind\`, CAST(COUNT(*) AS CHAR) AS \`active_count\`
         FROM \`user_plants\`
         WHERE \`user_internal_id\` = ? AND \`lifecycle_status\` = 'active'`,
        [userRow.user_internal_id]
      ),
      'count',
      '用户植物数量读回不完整'
    )

    return {
      userInternalId: userRow.user_internal_id,
      activeCount: resolveSafeNonNegativeInteger(countRow.active_count, '用户植物数量不合法')
    }
  }

  const insertUnidentifiedUserPlant = async (
    transaction: TTransaction,
    input: InsertUnidentifiedUserPlantInput
  ): Promise<void> => {
    verifyInternalPrimaryKey(input.userInternalId)
    if (
      !userPlantPublicRefFormat.test(input.userPlantRef) ||
      !Number.isSafeInteger(input.occurredAtMs) ||
      input.occurredAtMs < zero
    ) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物创建数据不合法')
    }
    const result = await executor.executeWrite(
      transaction,
      `INSERT INTO \`user_plants\`
       (\`public_user_plant_id\`, \`user_internal_id\`, \`lifecycle_status\`, \`current_identity_status\`, \`confirmed_identity_internal_id\`, \`version\`, \`created_at_ms\`, \`updated_at_ms\`)
       VALUES (?, ?, 'active', 'unidentified', NULL, ${USER_PLANT_INITIAL_VERSION}, ?, ?)`,
      [input.userPlantRef, input.userInternalId, input.occurredAtMs, input.occurredAtMs]
    )
    if (result.affectedRows !== one) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物创建写入未完成')
    }
  }

  const readCreateInitialProjection = async (
    transaction: TTransaction,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ): Promise<CreateUserPlantResponseDto> => {
    if (!userPublicRefFormat.test(userRef) || !userPlantPublicRefFormat.test(userPlantRef)) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物公开引用不合法')
    }
    const row = readSingleRow(
      await executor.executeQuery(
        transaction,
        `SELECT 'plant' AS \`kind\`, \`p\`.\`public_user_plant_id\`, \`p\`.\`lifecycle_status\`,
                \`p\`.\`current_identity_status\`, CAST(\`p\`.\`version\` AS CHAR) AS \`version\`,
                CAST(\`p\`.\`created_at_ms\` AS CHAR) AS \`created_at_ms\`,
                CAST(\`p\`.\`updated_at_ms\` AS CHAR) AS \`updated_at_ms\`
         FROM \`user_plants\` AS \`p\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`p\`.\`user_internal_id\`
         WHERE \`u\`.\`public_user_id\` = ? AND \`p\`.\`public_user_plant_id\` = ?`,
        [userRef, userPlantRef]
      ),
      'plant',
      '用户植物创建投影不存在或不唯一'
    )
    const version = resolveSafeNonNegativeInteger(row.version, '用户植物版本不合法')
    const createdAtMs = resolveSafeNonNegativeInteger(row.created_at_ms, '用户植物创建时间不合法')
    const updatedAtMs = resolveSafeNonNegativeInteger(row.updated_at_ms, '用户植物更新时间不合法')
    if (
      row.public_user_plant_id !== userPlantRef ||
      row.lifecycle_status !== 'active' ||
      row.current_identity_status !== 'unidentified' ||
      version !== USER_PLANT_INITIAL_VERSION ||
      updatedAtMs !== createdAtMs
    ) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物创建投影不符合固定初态')
    }

    return {
      user_plant_id: userPlantRef,
      lifecycle: 'active',
      identityStatus: 'unidentified',
      version: USER_PLANT_INITIAL_VERSION,
      createdAt: new Date(createdAtMs).toISOString(),
      updatedAt: new Date(updatedAtMs).toISOString()
    }
  }

  const getOwnedUserPlant = async (
    transaction: TTransaction,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ): Promise<UserPlantDto> => {
    if (!userPublicRefFormat.test(userRef) || !userPlantPublicRefFormat.test(userPlantRef)) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物公开引用不合法')
    }
    const rows = await executor.executeQuery(
      transaction,
      `${READ_PLANT_PROJECTION_SQL}
       WHERE \`u\`.\`public_user_id\` = ?
         AND \`p\`.\`public_user_plant_id\` = ?
         AND \`u\`.\`status\` = 'active' AND \`u\`.\`_openid\` = '' AND \`p\`.\`_openid\` = ''
         AND \`p\`.\`lifecycle_status\` IN ('active', 'archived')`,
      [userRef, userPlantRef]
    )
    if (rows.length === zero) {
      throw new UserPlantPersistenceError('USER_PLANT_NOT_FOUND', '用户植物不可见')
    }
    const row = readSingleRow(rows, 'read-plant', '用户植物读取投影不唯一或不完整')
    if (row.public_user_plant_id !== userPlantRef) {
      throw new UserPlantPersistenceError('INTERNAL_DATA_INVALID', '用户植物公开引用读回不一致')
    }
    return projectReadPlantRow(row, userPlantRef)
  }

  return {
    lockUserAndCountActive,
    insertUnidentifiedUserPlant,
    readCreateInitialProjection,
    getOwnedUserPlant
  }
}
