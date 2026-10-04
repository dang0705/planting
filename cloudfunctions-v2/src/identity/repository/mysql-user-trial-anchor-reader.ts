import type { UserRef } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import {
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'

/** Identity 域拥有的最小用户事实；不包含试用资格或任何内部主键。 */
export type UserTrialAnchor = {
  /** 统一用户的高熵公开引用。 */
  readonly userRef: UserRef
  /** 当前账户状态；订阅域自行判断是否可授予能力。 */
  readonly status: 'active' | 'suspended' | 'deleting' | 'deleted'
  /** 统一用户首次创建的 UTC 毫秒时刻，而不是某个平台的首次登录时刻。 */
  readonly createdAtMs: number
}

/** 数据库行只允许携带合同规定的三个字段。 */
type TrialAnchorSqlRow = {
  /** 数据库保存的统一用户公开引用。 */
  readonly public_user_id: unknown
  /** 数据库保存的账户状态。 */
  readonly status: unknown
  /** 转成十进制文本读取，避免 BIGINT 被 JavaScript 隐式舍入。 */
  readonly created_at_ms: unknown
}

const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const decimalIntegerFormat = /^(?:0|[1-9][0-9]*)$/u
const firstRowIndex = Number('0')
const maximumUniqueRowCount = Number('1')
const accountStatuses = new Set<UserTrialAnchor['status']>([
  'active',
  'suspended',
  'deleting',
  'deleted'
])

/** 映射 Identity 自有事实；格式损坏时失败关闭，不推断默认创建时刻或状态。 */
function mapTrialAnchor(row: TrialAnchorSqlRow): UserTrialAnchor {
  if (
    typeof row.public_user_id !== 'string' ||
    !userRefFormat.test(row.public_user_id) ||
    typeof row.status !== 'string' ||
    !accountStatuses.has(row.status as UserTrialAnchor['status']) ||
    typeof row.created_at_ms !== 'string' ||
    !decimalIntegerFormat.test(row.created_at_ms)
  ) {
    throw new Error('统一用户试用锚点数据不合法')
  }
  const createdAtMs = Number(row.created_at_ms)
  if (!Number.isSafeInteger(createdAtMs)) {
    throw new Error('统一用户创建时刻超出安全范围')
  }
  return {
    userRef: row.public_user_id as UserRef,
    status: row.status as UserTrialAnchor['status'],
    createdAtMs
  }
}

/**
 * 仅供 Identity 内部用例使用的 MySQL 只读器；服务签名和 scope 由上层入口校验。
 * subscription 不得直接引用此 Repository，必须通过 Identity 内部只读端口取得结果。
 */
export function createMysqlUserTrialAnchorReader(
  connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
): (userRef: UserRef) => Promise<UserTrialAnchor | null> {
  return async userRef => {
    if (!userRefFormat.test(userRef)) {
      throw new Error('统一用户引用不合法')
    }
    return withReadConnection(connectionSource, async connection => {
      const rows = (await connection.query(
        `SELECT public_user_id, status, CAST(created_at_ms AS CHAR) AS created_at_ms
         FROM users WHERE public_user_id = ? LIMIT 2`,
        [userRef]
      )) as readonly TrialAnchorSqlRow[]
      if (rows.length > maximumUniqueRowCount) {
        throw new Error('统一用户引用出现重复记录')
      }
      const row = rows[firstRowIndex]
      return row === undefined ? null : mapTrialAnchor(row)
    })
  }
}
