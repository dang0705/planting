import { createMysqlGuestClaimCompletionCore, type GuestClaimNewPlantCompletionInput, type GuestClaimCompletionResult } from './mysql-guest-claim-completion-core.js'
import type { GuestClaimRegistrationDependencies } from './mysql-guest-claim-command-registration-repository.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { MysqlUserPlantRepository } from './mysql-user-plant-repository.js'
export type { GuestClaimNewPlantCompletionInput } from './mysql-guest-claim-completion-core.js'

/** 新建目标必须有真实聚合创建端口，不接受静默默认容量。 */
export interface GuestClaimNewPlantCompletionDependencies extends GuestClaimRegistrationDependencies {
  /** 与认领四项写入共用同一事务的创建、容量核验和初态读回端口。 */
  readonly plants: MysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>
}
/** 内部事务成功或创建能力拒绝，均不替代公开HTTP结果。 */
export type GuestClaimNewPlantCompletionResult = GuestClaimCompletionResult
/** 新建植物和成功认领同事务，不取得租约或提供写入重试。 */
export function createMysqlGuestClaimNewPlantCompletionRepository(d: GuestClaimNewPlantCompletionDependencies) {
  const core = createMysqlGuestClaimCompletionCore('new_user_plant', d)
  return {
    /** 严格新建入口，候选植物引用及能力不参与原命令摘要。 */
    complete: (tx: MysqlTransactionContext<Mysql2QueryConnection>, input: GuestClaimNewPlantCompletionInput): Promise<GuestClaimNewPlantCompletionResult> => core.complete(tx, input)
  }
}
