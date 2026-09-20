import {
  USER_PLANT_INITIAL_VERSION,
  type CreateUserPlantResponseDto,
  type UserPlantRef,
  type UserRef
} from '../../contracts/types.js'
import type { 事务执行上下文 } from '../../foundation/database/transaction-runner.js'

const 零 = Number('0')
const 一 = Number('1')
const 用户公开引用格式 = /^usr_[A-Za-z0-9_-]{8,}$/u
const 用户植物公开引用格式 = /^upl_[A-Za-z0-9_-]{8,}$/u
const 正整数文本格式 = /^[1-9][0-9]*$/u
const 非负整数文本格式 = /^(?:0|[1-9][0-9]*)$/u

/** 用户植物持久化层可以产生的稳定内部错误类型。 */
export type 用户植物持久化错误类型 =
  | 'PRINCIPAL_INVALID'
  | 'USER_PLANT_NOT_FOUND'
  | 'INTERNAL_DATA_INVALID'

/**
 * Repository 错误只能由应用层映射为稳定公开错误。
 * 消息不携带 SQL、数据库内部主键、平台主体或凭证。
 */
export class 用户植物持久化错误 extends Error {
  /** 稳定错误类型；内部数据错误对外必须泛化。 */
  readonly type: 用户植物持久化错误类型

  constructor(type: 用户植物持久化错误类型, message: string) {
    super(message)
    this.name = '用户植物持久化错误'
    this.type = type
  }
}

/** MySQL 驱动返回的最小写入结果。 */
export type 用户植物SQL写入结果 = {
  /** 参数化语句真实影响的行数。 */
  readonly affectedRows: number
}

/** 锁定统一用户时允许读回的最小行。 */
export type 用户植物用户SQL行 = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'user'
  /** 统一用户 BIGINT 内部主键的十进制文本，只在 Repository 内传递。 */
  readonly user_internal_id: string
  /** 统一用户当前状态。 */
  readonly user_status: 'active' | 'suspended' | 'deleting' | 'deleted'
}

/** active 用户植物数量查询的最小行。 */
export type 用户植物数量SQL行 = {
  /** SQL 行判别字段，不对应数据库列。 */
  readonly kind: 'count'
  /** COUNT 结果的非负十进制文本。 */
  readonly active_count: string
}

/** 创建后按公开引用读回的最小用户植物行。 */
export type 用户植物创建投影SQL行 = {
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

/** 用户植物 Repository 的全部受控 SQL 行联合类型。 */
export type 用户植物SQL行 =
  | 用户植物用户SQL行
  | 用户植物数量SQL行
  | 用户植物创建投影SQL行

/** 用户植物 Repository 使用的参数化 SQL 执行端口。 */
export type 用户植物SQL执行器<T事务 extends 事务执行上下文> = {
  /** 在调用方事务中执行参数化查询；行锁服从同一事务生命周期。 */
  readonly 执行查询: (
    事务: T事务,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly 用户植物SQL行[]>
  /** 在调用方事务中执行参数化 INSERT 或 UPDATE。 */
  readonly 执行写入: (
    事务: T事务,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<用户植物SQL写入结果>
}

/** 串行化 active 数量检查所需的锁定结果。 */
export type 已锁定用户植物数量 = {
  /** 统一用户 BIGINT 内部主键文本；只允许继续传给同一事务内的 Repository。 */
  readonly userInternalId: string
  /** 持有用户行锁后读取的 active 用户植物数量。 */
  readonly activeCount: number
}

/** 插入一株暂未识别用户植物所需的内部持久化输入。 */
export type 插入暂未识别用户植物输入 = {
  /** 已在同一事务锁定的统一用户 BIGINT 内部主键文本。 */
  readonly userInternalId: string
  /** 服务端生成的高熵用户植物公开引用。 */
  readonly userPlantRef: UserPlantRef
  /** 创建发生时间，UTC 毫秒。 */
  readonly occurredAtMs: number
}

/** MySQL 用户植物 Repository 的最小创建切片端口。 */
export type MySQL用户植物Repository<T事务 extends 事务执行上下文> = {
  /** 锁定统一用户行后读取 active 数量，串行化同一用户的并发创建。 */
  readonly 锁定用户并统计Active数量: (
    事务: T事务,
    userRef: UserRef
  ) => Promise<已锁定用户植物数量>
  /** 在已锁定同一用户的事务中插入固定初态用户植物。 */
  readonly 插入暂未识别用户植物: (
    事务: T事务,
    输入: 插入暂未识别用户植物输入
  ) => Promise<void>
  /** 按统一用户与用户植物公开引用读回刚创建的固定初始投影。 */
  readonly 读取创建初始投影: (
    事务: T事务,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ) => Promise<CreateUserPlantResponseDto>
}

/** 把数据库 BIGINT 文本验证为正整数，但不转换成可能丢精度的 JavaScript number。 */
function 验证内部主键(value: string): void {
  if (!正整数文本格式.test(value)) {
    throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', '用户植物内部归属数据不合法')
  }
}

/** 把安全范围内的十进制文本转换为 JavaScript 整数。 */
function 解析安全非负整数(value: string, message: string): number {
  if (!非负整数文本格式.test(value)) {
    throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', message)
  }
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed < 零) {
    throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', message)
  }
  return parsed
}

/** 要求查询恰好返回一个指定判别类型的行。 */
function 读取唯一行<T类型 extends 用户植物SQL行['kind']>(
  rows: readonly 用户植物SQL行[],
  kind: T类型,
  message: string
): Extract<用户植物SQL行, { readonly kind: T类型 }> {
  const row = rows[零]
  if (rows.length !== 一 || row?.kind !== kind) {
    throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', message)
  }
  return row as Extract<用户植物SQL行, { readonly kind: T类型 }>
}

/** 创建只访问 identity 用户表与 user-plant 聚合根的 MySQL Repository。 */
export function 创建MySQL用户植物Repository<T事务 extends 事务执行上下文>(
  执行器: 用户植物SQL执行器<T事务>
): MySQL用户植物Repository<T事务> {
  const 锁定用户并统计Active数量 = async (
    事务: T事务,
    userRef: UserRef
  ): Promise<已锁定用户植物数量> => {
    if (!用户公开引用格式.test(userRef)) {
      throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', '统一用户公开引用不合法')
    }
    const 用户行 = 读取唯一行(
      await 执行器.执行查询(
        事务,
        `SELECT 'user' AS \`kind\`, CAST(\`id\` AS CHAR) AS \`user_internal_id\`, \`status\` AS \`user_status\`
         FROM \`users\`
         WHERE \`public_user_id\` = ?
         FOR UPDATE`,
        [userRef]
      ),
      'user',
      '统一用户锁定结果不完整'
    )
    验证内部主键(用户行.user_internal_id)
    if (用户行.user_status !== 'active') {
      throw new 用户植物持久化错误('PRINCIPAL_INVALID', '登录主体已经失效')
    }

    const 数量行 = 读取唯一行(
      await 执行器.执行查询(
        事务,
        `SELECT 'count' AS \`kind\`, CAST(COUNT(*) AS CHAR) AS \`active_count\`
         FROM \`user_plants\`
         WHERE \`user_internal_id\` = ? AND \`lifecycle_status\` = 'active'`,
        [用户行.user_internal_id]
      ),
      'count',
      '用户植物数量读回不完整'
    )

    return {
      userInternalId: 用户行.user_internal_id,
      activeCount: 解析安全非负整数(数量行.active_count, '用户植物数量不合法')
    }
  }

  const 插入暂未识别用户植物 = async (
    事务: T事务,
    输入: 插入暂未识别用户植物输入
  ): Promise<void> => {
    验证内部主键(输入.userInternalId)
    if (
      !用户植物公开引用格式.test(输入.userPlantRef) ||
      !Number.isSafeInteger(输入.occurredAtMs) ||
      输入.occurredAtMs < 零
    ) {
      throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', '用户植物创建数据不合法')
    }
    const result = await 执行器.执行写入(
      事务,
      `INSERT INTO \`user_plants\`
       (\`public_user_plant_id\`, \`user_internal_id\`, \`lifecycle_status\`, \`current_identity_status\`, \`confirmed_identity_internal_id\`, \`version\`, \`created_at_ms\`, \`updated_at_ms\`)
       VALUES (?, ?, 'active', 'unidentified', NULL, ${USER_PLANT_INITIAL_VERSION}, ?, ?)`,
      [输入.userPlantRef, 输入.userInternalId, 输入.occurredAtMs, 输入.occurredAtMs]
    )
    if (result.affectedRows !== 一) {
      throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', '用户植物创建写入未完成')
    }
  }

  const 读取创建初始投影 = async (
    事务: T事务,
    userRef: UserRef,
    userPlantRef: UserPlantRef
  ): Promise<CreateUserPlantResponseDto> => {
    if (!用户公开引用格式.test(userRef) || !用户植物公开引用格式.test(userPlantRef)) {
      throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', '用户植物公开引用不合法')
    }
    const row = 读取唯一行(
      await 执行器.执行查询(
        事务,
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
    const version = 解析安全非负整数(row.version, '用户植物版本不合法')
    const createdAtMs = 解析安全非负整数(row.created_at_ms, '用户植物创建时间不合法')
    const updatedAtMs = 解析安全非负整数(row.updated_at_ms, '用户植物更新时间不合法')
    if (
      row.public_user_plant_id !== userPlantRef ||
      row.lifecycle_status !== 'active' ||
      row.current_identity_status !== 'unidentified' ||
      version !== USER_PLANT_INITIAL_VERSION ||
      updatedAtMs !== createdAtMs
    ) {
      throw new 用户植物持久化错误('INTERNAL_DATA_INVALID', '用户植物创建投影不符合固定初态')
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

  return { 锁定用户并统计Active数量, 插入暂未识别用户植物, 读取创建初始投影 }
}
