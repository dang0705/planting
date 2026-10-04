import type { UserCapabilitySnapshotDto, UserPrincipalDto } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort } from '../../foundation/database/mysql-transaction-driver.js'
import {
  toSqlParameters,
  withReadConnection,
  type Mysql2QueryConnection
} from '../../foundation/database/mysql2-connection-source.js'

/** SQL 单行读取及存在性判断的零值。 */
const zero = Number('0')

/** 已由 subscription 写入的请求级快照最小数据库投影。 */
type CapabilitySnapshotRow = {
  /** 服务端内部使用的高熵快照引用。 */
  readonly snapshot_ref: string
  /** 已认证登录用户的公开引用。 */
  readonly public_user_id: string
  /** 免费、试用或会员层级。 */
  readonly tier: 'free' | 'trial' | 'member'
  /** 当前快照准许的产品能力 JSON 数组。 */
  readonly allowed_capabilities_json: unknown
  /** 奖励额度可支付的生成式能力 JSON 数组。 */
  readonly rewarded_ai_scopes_json: unknown
  /** 当前已裁决的活跃植物数量上限。 */
  readonly active_user_plant_limit: number
  /** 生成快照所用的已发布策略版本。 */
  readonly capability_policy_release_version: string
  /** 生成时刻，UTC 毫秒的数据库文本。 */
  readonly generated_at_ms: string
  /** 有效期，UTC 毫秒的数据库文本。 */
  readonly valid_until_ms: string
}

/** 未取得有效服务端快照；路由只能返回脱敏的服务暂不可用，不得赋予默认能力。 */
export class CapabilitySnapshotUnavailableError extends Error {
  constructor() {
    super('没有有效的服务端能力快照')
    this.name = 'CapabilitySnapshotUnavailableError'
  }
}

/** 已有服务端快照但均已过期；恢复入口需要与“从未生成”区分公开错误。 */
export class CapabilitySnapshotExpiredError extends CapabilitySnapshotUnavailableError {
  constructor() {
    super()
    this.name = 'CapabilitySnapshotExpiredError'
  }
}

/** mysql2 的 JSON 列可能返回已解析数组，也可能返回 JSON 文本。 */
function readJsonArray(value: unknown): unknown[] {
  const parsed: unknown = typeof value === 'string' ? JSON.parse(value) : value
  if (!Array.isArray(parsed)) {
    throw new Error('能力快照内容不是数组')
  }
  return parsed
}

/** 只读取 subscription 已生成且仍有效的服务端快照；缺失时拒绝，不编造免费权限。 */
export function createMysqlCapabilitySnapshotReader(
  connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>,
  now: () => number
): (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto> {
  return async principal => {
    const currentTimeMs = now()
    const rows = (await withReadConnection(connectionSource, connection =>
      connection.query(
        `SELECT cs.snapshot_ref, u.public_user_id, cs.tier,
              cs.allowed_capabilities_json, cs.rewarded_ai_scopes_json,
              cs.active_user_plant_limit, cs.capability_policy_release_version,
              CAST(cs.generated_at_ms AS CHAR) AS generated_at_ms,
              CAST(cs.valid_until_ms AS CHAR) AS valid_until_ms
       FROM capability_snapshots AS cs
       JOIN users AS u ON u.id = cs.user_internal_id
       WHERE u.public_user_id = ? AND cs.subject_type = 'user'
         AND cs.generated_at_ms <= ? AND cs.valid_until_ms > ?
       ORDER BY cs.generated_at_ms DESC, cs.id DESC LIMIT 1`,
        toSqlParameters([principal.user_id, currentTimeMs, currentTimeMs])
      )
    )) as readonly CapabilitySnapshotRow[]
    const row = rows[zero]
    if (!row || row.public_user_id !== principal.user_id) {
      const expiredRows = (await withReadConnection(connectionSource, connection =>
        connection.query(
          `SELECT cs.id
           FROM capability_snapshots AS cs
           JOIN users AS u ON u.id = cs.user_internal_id
           WHERE u.public_user_id = ? AND cs.subject_type = 'user'
             AND cs.generated_at_ms <= ? AND cs.valid_until_ms <= ?
           LIMIT 1`,
          toSqlParameters([principal.user_id, currentTimeMs, currentTimeMs])
        )
      )) as readonly unknown[]
      if (expiredRows.length > zero) {
        throw new CapabilitySnapshotExpiredError()
      }
      throw new CapabilitySnapshotUnavailableError()
    }
    return {
      contractVersion: 'capability-snapshot/v1',
      snapshotRef: row.snapshot_ref,
      subjectType: 'user',
      user_id: principal.user_id,
      tier: row.tier,
      allowedCapabilities: readJsonArray(
        row.allowed_capabilities_json
      ) as UserCapabilitySnapshotDto['allowedCapabilities'],
      rewardedAiScopes: readJsonArray(
        row.rewarded_ai_scopes_json
      ) as UserCapabilitySnapshotDto['rewardedAiScopes'],
      activeUserPlantLimit: row.active_user_plant_limit,
      policyVersion: row.capability_policy_release_version,
      generatedAt: new Date(Number(row.generated_at_ms)).toISOString(),
      validUntil: new Date(Number(row.valid_until_ms)).toISOString()
    }
  }
}
