import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../foundation/idempotency/mysql-http-idempotency-repository.js'
import { publicErrorSnapshot, runIdempotentWrite, type IdempotentWriteDependencies } from '../../foundation/idempotency/run-idempotent-write.js'
import { COVER_ASSET_RULES } from '../domain/cover-asset.js'
import { lockOwnedUserPlant } from '../repository/mysql-catalog-binding-repository.js'
import { registerCover } from '../repository/mysql-user-plant-asset-repository.js'

/** 登记封面用例输入（文件已由路由完成下载复核）。 */
export interface BindUserPlantCoverInput {
  /** 已验真主体的统一用户公开引用。 */ readonly userRef: string
  /** 路径中的用户植物公开引用。 */ readonly userPlantRef: string
  /** 已校验位于本人封面目录的私有 fileID。 */ readonly fileId: string
  /** 已复核一致的文件 SHA-256。 */ readonly contentSha256: string
  /** 事务前换取的临时下载链接（随首次结果返回）。 */ readonly url: string
  /** 服务端生成的资产公开引用 ast_…。 */ readonly assetRef: string
  /** 服务端当前 UTC 毫秒。 */ readonly nowMs: number
  /** 共享 HTTP 幂等占位输入。 */ readonly idempotency: HttpIdempotencyReservationInput
}

const dayMs = 86_400_000

/** 登记封面用例：同一事务 幂等占位 → 锁本人植物（404）→ 登记/替换 → 幂等完成。归档植物允许换封面。 */
export function createBindUserPlantCoverApplicationService(
  dependencies: IdempotentWriteDependencies<MysqlTransactionContext<Mysql2QueryConnection>>
): (input: BindUserPlantCoverInput) => Promise<HttpIdempotencyPublicResponseSnapshot> {
  return input => runIdempotentWrite(dependencies, input.idempotency, input.nowMs, async transaction => {
    const plant = await lockOwnedUserPlant(transaction, input.userRef, input.userPlantRef)
    if (plant === null) { return publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在') }
    const result = await registerCover(transaction, {
      plant, assetRef: input.assetRef, fileId: input.fileId, contentSha256: input.contentSha256, nowMs: input.nowMs,
      cleanupAfterMs: input.nowMs + COVER_ASSET_RULES.replacedCoverCleanupDays * dayMs
    })
    if (result.kind === 'file_taken') { return publicErrorSnapshot(400, 'VALIDATION_FAILED', '该文件已用于其他植物') }
    return { status: 200, body: { data: { assetRef: result.assetRef, purpose: 'profile', url: input.url, urlExpiresAt: null, createdAt: new Date(result.createdAtMs).toISOString() } } }
  })
}
