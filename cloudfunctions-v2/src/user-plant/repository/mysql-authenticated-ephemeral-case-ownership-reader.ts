import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import { withReadConnection, type Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 已验真统一用户的内部归属查询，不接受客户端身份或新TTL。 */
export interface AuthenticatedEphemeralOwnershipInput {
  /** identity解析的统一用户引用。 */ readonly userRef: string
  /** 等待确认归属的已存在临时案例引用。 */ readonly ephemeralCaseRef: string
}
/** 仅返回归属类别；不公开内部键、状态、期限或绑定目标。 */
export interface AuthenticatedEphemeralOwnershipResult {
  /** owned不等于仍可新绑定；unavailable不能伪装成不存在。 */ readonly status: 'owned' | 'not_found' | 'unavailable'
}
/** 内部引用沿用已冻结存储容量；不替代未来公开路径合同。 */
function reference(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/u.test(value)
}
/** 等待建连前复制输入，拒绝自报期限或其他附加元数据。 */
function lock(input: AuthenticatedEphemeralOwnershipInput): AuthenticatedEphemeralOwnershipInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 2 || Object.keys(input).some(k => !['userRef', 'ephemeralCaseRef'].includes(k))
    || !reference(input.userRef) || !reference(input.ephemeralCaseRef)) { throw new TypeError('案例归属查询不合法') }
  return Object.freeze({ userRef: input.userRef, ephemeralCaseRef: input.ephemeralCaseRef })
}
/** 请求链前置归属只读端口；资格与并发由绑定事务重新核验。 */
export function createMysqlAuthenticatedEphemeralCaseOwnershipReader(source: MysqlConnectionPoolPort<Mysql2QueryConnection>) {
  return {
    /** 不检查期限，避免阻断原成功绑定重放；每次仅一条参数化SELECT。 */
    readOwned: async (input: AuthenticatedEphemeralOwnershipInput): Promise<AuthenticatedEphemeralOwnershipResult> => {
      const command = lock(input)
      try {
        return await withReadConnection(source, async connection => {
          // mysql2按字符串读取大整数；此布尔标记明确投影为DOUBLE的精确1，不能宽松转换未知结果。
          const rows = await connection.query(`SELECT CAST(1 AS DOUBLE) AS owned FROM users u
            JOIN authenticated_ephemeral_plant_cases e ON e.user_internal_id=u.id AND e._openid=''
            WHERE BINARY u.public_user_id=BINARY ? AND u.status='active' AND u._openid=''
              AND BINARY e.ephemeral_plant_case_ref=BINARY ?`, [command.userRef, command.ephemeralCaseRef])
          if (rows.length === 0) { return { status: 'not_found' } }
          if (rows.length !== 1 || Object.keys(rows[0]!).length !== 1 || rows[0]!.owned !== 1) { return { status: 'unavailable' } }
          return { status: 'owned' }
        })
      } catch { return { status: 'unavailable' } }
    }
  }
}
