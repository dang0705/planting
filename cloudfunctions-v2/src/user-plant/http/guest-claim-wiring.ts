import type { UserCapabilitySnapshotDto, UserPrincipalDto } from '../../contracts/types.js'
import type { MysqlConnectionPoolPort, MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import type { DatabaseTransactionDriver } from '../../foundation/database/transaction-runner.js'
import type { RequestChainAuditEvent } from '../../foundation/http/request-chain.js'
import type { RouteHandler } from '../../foundation/http/route-dispatcher.js'
import type { ResolveUserPrincipalCommand } from '../../identity/application/resolve-user-principal.js'
import { createClaimGuestPlantCaseApplicationService } from '../application/claim-guest-plant-case.js'
import { createGuestClaimCompletionApplicationService } from '../application/complete-guest-claim.js'
import { createMysqlGuestCaseObjectKindsReader } from '../repository/mysql-guest-case-object-kinds-reader.js'
import { createMysqlGuestClaimCommandRegistrationRepository } from '../repository/mysql-guest-claim-command-registration-repository.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../repository/mysql-guest-claim-completed-receipt-reader.js'
import { createMysqlGuestClaimExistingCompletionRepository } from '../repository/mysql-guest-claim-existing-completion-repository.js'
import { createMysqlGuestClaimLeaseRepository } from '../repository/mysql-guest-claim-lease-repository.js'
import { createMysqlGuestClaimNewPlantCompletionRepository } from '../repository/mysql-guest-claim-new-plant-completion-repository.js'
import { createMysqlGuestClaimProofRepository } from '../repository/mysql-guest-claim-proof-repository.js'
import type { MysqlUserPlantRepository } from '../repository/mysql-user-plant-repository.js'
import { createClaimGuestPlantCaseRouteHandler } from './claim-guest-plant-case-route.js'

/** 游客认领路由接线所需的服务端端口（由 user-plant 服务提供）。 */
export interface GuestClaimWiringDependencies {
  /** 每请求独占连接来源。 */
  readonly connectionSource: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 与其他 user-plant 写用例共享的事务驱动。 */
  readonly driver: DatabaseTransactionDriver<MysqlTransactionContext<Mysql2QueryConnection>>
  /** 新建目标复用的用户植物聚合仓储。 */
  readonly userPlantRepository: MysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>
  /** identity 域登录会话解析。 */
  readonly resolvePrincipal: (command: ResolveUserPrincipalCommand) => Promise<UserPrincipalDto>
  /** subscription 域请求级能力快照；失败由路由以 null 交给完成事务。 */
  readonly resolveCapabilitySnapshot: (principal: UserPrincipalDto) => Promise<UserCapabilitySnapshotDto>
  /** 服务端可信时钟。 */
  readonly now: () => number
  /** 请求结果审计端口，只接收脱敏事件。 */
  readonly writeAudit: (event: RequestChainAuditEvent) => void | Promise<void>
}

/** 组装游客认领路由：证明→登记→租约→完成→收据→对象类别，全部为已验收的 user-plant 仓储与用例。 */
export function createGuestClaimRouteHandler(d: GuestClaimWiringDependencies): RouteHandler {
  const proofRepository = createMysqlGuestClaimProofRepository()
  const lockAndVerify: Parameters<typeof createMysqlGuestClaimCommandRegistrationRepository>[0]['lockAndVerify'] = (tx, input) => proofRepository.lockAndVerify(tx, input)
  const completedReceiptReader = createMysqlGuestClaimCompletedReceiptReader(d.connectionSource)
  const completeClaim = createGuestClaimCompletionApplicationService({
    nowMs: d.now,
    driver: d.driver,
    existingRepository: createMysqlGuestClaimExistingCompletionRepository({ lockAndVerify }),
    newPlantRepository: createMysqlGuestClaimNewPlantCompletionRepository({ lockAndVerify, plants: d.userPlantRepository }),
    completedReceiptReader
  })
  const claimGuestPlantCase = createClaimGuestPlantCaseApplicationService({
    nowMs: d.now,
    driver: d.driver,
    completedReceiptReader,
    registrationRepository: createMysqlGuestClaimCommandRegistrationRepository({ lockAndVerify }),
    leaseRepository: createMysqlGuestClaimLeaseRepository(),
    completeClaim
  })
  const kindsReader = createMysqlGuestCaseObjectKindsReader(d.connectionSource)
  return createClaimGuestPlantCaseRouteHandler({
    resolvePrincipal: d.resolvePrincipal,
    resolveCapabilitySnapshot: d.resolveCapabilitySnapshot,
    claimGuestPlantCase,
    readClaimedObjectKinds: query => kindsReader.read(query),
    now: d.now,
    writeAudit: d.writeAudit
  })
}
