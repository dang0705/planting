import type { EventRef, UserRef } from '../../contracts/types.js'
import type {
  RewardCommitUnknownReadOnlyRecord,
  RewardCommitUnknownReadOnlyRepository
} from '../application/reward-commit-unknown-reconciliation.js'
import { RewardInboxPersistenceError } from './mysql-reward-inbox-repository.js'

/** 新连接读回奖励事件终态时允许出现的最小 SQL 行。 */
export type RewardCommitUnknownSqlRow = {
  /** 全局高熵事件引用。 */
  readonly event_id: string
  /** 统一用户公开引用。 */
  readonly user_ref: string
  /** 首次规范化奖励资格载荷 SHA-256。 */
  readonly payload_hash: string
  /** 首次接收时锁定的奖励策略版本。 */
  readonly reward_policy_version: string
  /** 首次接收时锁定的奖励策略内容 SHA-256。 */
  readonly reward_policy_content_sha256: string
  /** 已提交 inbox 的处理状态。 */
  readonly status: 'received' | 'applied' | 'rejected'
  /** 已应用积分账本公开引用；未应用时为空。 */
  readonly result_ref: string | null
}

/** 必须由连接池重新获取连接的无事务、只读 SQL 执行端口。 */
export type RewardCommitUnknownReadOnlySqlExecutor = {
  /** 在新连接上执行无锁 SELECT；禁止传入旧事务或提供写方法。 */
  readonly executeQuery: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly RewardCommitUnknownSqlRow[]>
}

const zero = Number('0')
const one = Number('1')
const userRefFormat = /^usr_[A-Za-z0-9_-]{8,}$/u
const eventRefFormat = /^evt_[A-Za-z0-9_-]{8,}$/u
const sha256Format = /^[a-f0-9]{64}$/u

/** 校验并映射新连接读回行，任何损坏数据都必须失败关闭。 */
function mapRow(row: RewardCommitUnknownSqlRow): RewardCommitUnknownReadOnlyRecord | null {
  const validStatusShape =
    (row.status === 'received' && row.result_ref === null) ||
    (row.status === 'applied' && /^cpl_[A-Za-z0-9_-]{8,}$/u.test(row.result_ref ?? '')) ||
    (row.status === 'rejected' && row.result_ref === null)
  if (
    !eventRefFormat.test(row.event_id) ||
    !userRefFormat.test(row.user_ref) ||
    !sha256Format.test(row.payload_hash) ||
    row.reward_policy_version.length === zero ||
    row.reward_policy_version.length > Number('64') ||
    !sha256Format.test(row.reward_policy_content_sha256) ||
    !validStatusShape
  ) {
    return null
  }
  return {
    eventId: row.event_id as EventRef,
    userRef: row.user_ref as UserRef,
    payloadHash: row.payload_hash,
    rewardPolicyVersion: row.reward_policy_version,
    rewardPolicyContentSha256: row.reward_policy_content_sha256,
    status: row.status,
    resultRef: row.result_ref
  }
}

/** 创建奖励事务提交结果未知时使用的新连接只读 Repository。 */
export function createMysqlRewardCommitUnknownReadOnlyRepository(
  executor: RewardCommitUnknownReadOnlySqlExecutor
): RewardCommitUnknownReadOnlyRepository {
  return {
    read: async input => {
      if (!userRefFormat.test(input.userRef) || !eventRefFormat.test(input.eventId)) {
        throw new RewardInboxPersistenceError(
          'INTERNAL_DATA_INVALID',
          '奖励事务提交未知查询条件不合法'
        )
      }
      const rows = await executor.executeQuery(
        `SELECT \`i\`.\`event_id\`, \`u\`.\`public_user_id\` AS \`user_ref\`,
                \`i\`.\`payload_hash\`, \`i\`.\`reward_policy_version\`,
                \`i\`.\`reward_policy_content_sha256\`, \`i\`.\`status\`, \`i\`.\`result_ref\`
         FROM \`subscription_reward_inbox\` AS \`i\`
         JOIN \`users\` AS \`u\` ON \`u\`.\`id\` = \`i\`.\`user_internal_id\`
         WHERE \`u\`.\`public_user_id\` = ? AND \`i\`.\`event_id\` = ?`,
        [input.userRef, input.eventId]
      )
      const row = rows[zero]
      if (rows.length === zero) {
        return null
      }
      if (rows.length !== one || row === undefined) {
        throw new RewardInboxPersistenceError(
          'INTERNAL_DATA_INVALID',
          '奖励事务提交未知读回记录不唯一'
        )
      }
      const mapped = mapRow(row)
      if (mapped === null) {
        throw new RewardInboxPersistenceError(
          'INTERNAL_DATA_INVALID',
          '奖励事务提交未知读回数据不合法'
        )
      }
      return mapped
    }
  }
}
