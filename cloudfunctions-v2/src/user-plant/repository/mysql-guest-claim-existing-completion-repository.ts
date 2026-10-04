import { createMysqlGuestClaimCompletionCore, type GuestClaimCompletionInput, type GuestClaimCompletionResult } from './mysql-guest-claim-completion-core.js'
import type { GuestClaimRegistrationDependencies } from './mysql-guest-claim-command-registration-repository.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'

/** 已有目标入口保持严格目标准入，不引入创建能力或候选引用。 */
export interface GuestClaimExistingCompletionInput extends GuestClaimCompletionInput {
  /** 用户明确选择的本人已有植物，不能使用新建意图。 */
  readonly target: {
    /** 当前入口只处理已有植物。 */
    readonly type: 'existing_user_plant'
    /** 待核验同一用户归属的植物公开引用。 */
    readonly user_plant_id: string
  }
}
/** 内部事务结果，必须外层提交后才可以披露。 */
export type GuestClaimExistingCompletionResult = GuestClaimCompletionResult
/** 与新建目标共用认领核心，已有路径没有数量或权益要求。 */
export function createMysqlGuestClaimExistingCompletionRepository(d: GuestClaimRegistrationDependencies) {
  const core = createMysqlGuestClaimCompletionCore('existing_user_plant', d)
  return {
    /** 保持原有窄接口，核心再次校验完整可信输入。 */
    complete: (tx: MysqlTransactionContext<Mysql2QueryConnection>, input: GuestClaimExistingCompletionInput): Promise<GuestClaimExistingCompletionResult> => core.complete(tx, input)
  }
}
