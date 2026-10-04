import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import { resolveDynamicPestQuestionRelease } from '../domain/dynamic-pest-release.js'

/** 在创建原事务读取并共享锁定现有活动指针及发布，不开新连接，不自动发布。 */
export function createMysqlDynamicPestReleaseReader() {
  return {
    /** 领域与策略代码由服务端固定；调用方不能指定任意policy或release。 */
    read: async (tx: MysqlTransactionContext<Mysql2QueryConnection>, capturedAtMs: number) => {
      if (tx.transactionContext !== true || !tx.connection) {
        throw new TypeError('题包发布读取需要显式事务')
      }
      const rows = await tx.connection.query(
        `SELECT r.release_ref,r.domain_code,r.policy_code,r.schema_version,r.release_version,
     r.content_sha256,r.policy_json,r.status,r._openid AS release_openid,a._openid AS pointer_openid,
     CAST(r.effective_at_ms AS CHAR) AS effective_at_ms,CAST(r.expires_at_ms AS CHAR) AS expires_at_ms,
     CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,a.active_release_version,a.active_content_sha256
     FROM active_business_policy_releases AS a JOIN business_policy_releases AS r ON r.id=a.release_internal_id
     WHERE a.domain_code=? AND a.policy_code=? FOR SHARE`,
        ['diagnosis', 'dynamic_pest_question_packages']
      )
      return resolveDynamicPestQuestionRelease(rows, capturedAtMs)
    }
  }
}
