import { createPublicContractValidators } from '../../contracts/index.js'
import type { UserCapabilitySnapshotDto, UserPrincipalDto, UserRef } from '../../contracts/types.js'
import type { MysqlTransactionContext } from '../../foundation/database/mysql-transaction-driver.js'
import type { Mysql2QueryConnection } from '../../foundation/database/mysql2-connection-source.js'
import {
  runDatabaseTransaction,
  type DatabaseTransactionDriver
} from '../../foundation/database/transaction-runner.js'
import {
  deriveTrialEligibility,
  type TrialEligibilityPolicySnapshot
} from '../domain/derive-trial-eligibility.js'
import {
  resolveCapabilityCatalogPolicy,
  type ActiveCapabilityCatalogReleaseRecord,
  type VerifiedCapabilityCatalog
} from '../domain/resolve-capability-catalog-policy.js'
import type { MysqlCapabilitySnapshotRepository } from '../repository/mysql-capability-snapshot-repository.js'

/** 从 Identity 内部只读合同取得的统一用户试用锚点；不含任何平台主体标识。 */
export type FirstLoginTrialAnchor = {
  /** Identity 已解析的统一用户公开引用。 */
  readonly userRef: UserRef
  /** Identity 当前状态；只有 active 用户允许生成登录能力快照。 */
  readonly status: string
  /** 统一用户创建时间，UTC 毫秒；试用唯一的起算锚点。 */
  readonly createdAtMs: number
}

/** 已发布策略的来源版本元数据；当前阶段由策略读取边界提供。 */
type PolicySourceMetadata = {
  /** 可追溯到配置目录或不可变发布的策略来源引用。 */
  readonly sourceRef: string
  /** 不可变发布版本。 */
  readonly releaseVersion: string
  /** 规范化策略正文 SHA-256。 */
  readonly contentSha256: string
}

/** 试用策略的领域字段与来源元数据；试用资格按注册时适用版本判定。 */
export type VersionedTrialEligibilityPolicy = TrialEligibilityPolicySnapshot & PolicySourceMetadata

/** 首次登录需要使用的用户植物数量策略及其版本来源。 */
export type FirstLoginUserPlantLimitPolicy = PolicySourceMetadata & {
  /** 当前策略发布状态；只接受活动版本。 */
  readonly status: string
  /** 当前策略生效时刻，UTC 毫秒。 */
  readonly effectiveAtMs: number
  /** 当前策略失效时刻，UTC 毫秒；null 表示没有预设终止。 */
  readonly expiresAtMs: number | null
  /** 该数量限制适用的用户层级。 */
  readonly appliesToTiers: readonly UserCapabilitySnapshotDto['tier'][]
  /** 当前用户最多可拥有的 active 用户植物数量。 */
  readonly activeUserPlantLimit: number
}

/** 能力策略发布的可审计版本元数据；DTO.policyVersion 只使用能力目录版本。 */
export type CapabilityCatalogSourceVersion = {
  /** 能力目录不可变发布引用。 */
  readonly releaseRef: string
  /** 能力目录不可变发布版本。 */
  readonly releaseVersion: string
  /** 能力目录正文摘要。 */
  readonly contentSha256: string
}

/** 生成能力快照使用的来源元数据；试用与植物上限来源仅在应用结果透传。 */
export type CapabilitySnapshotPolicySourceVersions = {
  /** DDL 已持久化、可与 DTO.policyVersion 对应的能力目录发布。 */
  readonly capabilityCatalog: CapabilityCatalogSourceVersion
  /** 从注册时刻试用策略读取器取得的来源；当前 capability_snapshots DDL 不持久化该项。 */
  readonly trialEligibility: PolicySourceMetadata
  /** 从用户植物限制策略读取器取得的来源；当前 capability_snapshots DDL 不持久化该项。 */
  readonly userPlantLimit: PolicySourceMetadata
}

/** 一次首次登录裁决返回的 DTO 与内部来源元数据。 */
export type FirstLoginCapabilitySnapshotResolution = {
  /** 已通过合同校验且写入 MySQL 的统一用户能力快照。 */
  readonly snapshot: UserCapabilitySnapshotDto
  /** 本次裁决所用策略来源；仅能力目录的版本被当前 DDL 保存。 */
  readonly policySourceVersions: CapabilitySnapshotPolicySourceVersions
}

/** 应用层接收的窄边界；Identity、策略读取和 MySQL 写入都通过已声明端口注入。 */
export type ResolveFirstLoginCapabilitySnapshotDependencies = {
  /** Identity 内部只读 API，返回用户状态和可信创建时刻。 */
  readonly readIdentityTrialAnchor: (userRef: UserRef) => Promise<FirstLoginTrialAnchor | null>
  /** 从活动指针读取能力目录发布投影；数据在应用层校验后才可使用。 */
  readonly readActiveCapabilityCatalog: () => Promise<ActiveCapabilityCatalogReleaseRecord | null>
  /** 按统一用户注册时刻读取当时生效的试用策略及来源版本。 */
  readonly readTrialEligibilityPolicy: (
    createdAtMs: number
  ) => Promise<VersionedTrialEligibilityPolicy | null>
  /** 读取当前用户层级适用的已发布植物上限策略及来源版本。 */
  readonly readUserPlantLimitPolicy: (
    tier: UserCapabilitySnapshotDto['tier']
  ) => Promise<FirstLoginUserPlantLimitPolicy | null>
  /** 写快照时使用的真实 MySQL 事务驱动。 */
  readonly transactionDriver: DatabaseTransactionDriver<
    MysqlTransactionContext<Mysql2QueryConnection>
  >
  /** 唯一负责快照 SQL 与发布外键的 Subscription Repository。 */
  readonly repository: MysqlCapabilitySnapshotRepository
  /** 服务端可信 UTC 当前时刻。 */
  readonly now: () => number
  /** 生成不透明快照引用；不得从用户、平台身份或时间戳推导。 */
  readonly createSnapshotRef: () => string
}

/** 试用快照无法安全生成时使用的内部失败关闭错误。 */
export class FirstLoginCapabilitySnapshotError extends Error {
  /** 稳定内部原因；调用边界只映射成脱敏错误，不公开原因详情。 */
  readonly reason:
    | 'PRINCIPAL_INVALID'
    | 'TRIAL_ANCHOR_UNAVAILABLE'
    | 'TRIAL_ANCHOR_USER_MISMATCH'
    | 'TRIAL_POLICY_UNAVAILABLE'
    | 'TRIAL_POLICY_INVALID'
    | 'USER_PLANT_LIMIT_POLICY_UNAVAILABLE'
    | 'CAPABILITY_SNAPSHOT_EXPIRED'
    | 'CAPABILITY_SNAPSHOT_INVALID'

  constructor(reason: FirstLoginCapabilitySnapshotError['reason'], message: string) {
    super(message)
    this.name = 'FirstLoginCapabilitySnapshotError'
    this.reason = reason
  }
}

const zero = Number('0')
const sourceRefMaximumLength = 191
const releaseVersionMaximumLength = 64
const sha256Format = /^[a-f0-9]{64}$/u
const generativeCapabilities = new Set([
  'USER_AGENT_TEXT',
  'USER_DIAGNOSIS_TEXT',
  'USER_DIAGNOSIS_VISUAL'
])

/** 校验来源引用、版本和摘要，避免把未知或不可追溯策略包装成已验证发布。 */
function verifyPolicySource(
  metadata: PolicySourceMetadata,
  reason: FirstLoginCapabilitySnapshotError['reason'] = 'TRIAL_POLICY_INVALID'
): void {
  if (
    typeof metadata.sourceRef !== 'string' ||
    metadata.sourceRef.length === zero ||
    metadata.sourceRef.length > sourceRefMaximumLength ||
    metadata.sourceRef.trim() !== metadata.sourceRef ||
    typeof metadata.releaseVersion !== 'string' ||
    metadata.releaseVersion.length === zero ||
    metadata.releaseVersion.length > releaseVersionMaximumLength ||
    metadata.releaseVersion.trim() !== metadata.releaseVersion ||
    !sha256Format.test(metadata.contentSha256)
  ) {
    throw new FirstLoginCapabilitySnapshotError(reason, '已发布策略来源元数据不合法')
  }
}

/** 校验植物上限策略当前有效且明确覆盖 trial/free，不为缺省值私设业务规则。 */
function resolveUserPlantLimit(
  policy: FirstLoginUserPlantLimitPolicy | null,
  tier: UserCapabilitySnapshotDto['tier'],
  nowMs: number
): number {
  if (policy === null) {
    throw new FirstLoginCapabilitySnapshotError(
      'USER_PLANT_LIMIT_POLICY_UNAVAILABLE',
      '当前用户植物上限策略不可用'
    )
  }
  verifyPolicySource(policy)
  if (
    policy.status !== 'active' ||
    !Number.isSafeInteger(policy.effectiveAtMs) ||
    policy.effectiveAtMs < zero ||
    policy.effectiveAtMs > nowMs ||
    (policy.expiresAtMs !== null &&
      (!Number.isSafeInteger(policy.expiresAtMs) ||
        policy.expiresAtMs <= nowMs ||
        policy.expiresAtMs <= policy.effectiveAtMs)) ||
    !policy.appliesToTiers.includes(tier) ||
    !Number.isSafeInteger(policy.activeUserPlantLimit) ||
    policy.activeUserPlantLimit < zero
  ) {
    throw new FirstLoginCapabilitySnapshotError(
      'USER_PLANT_LIMIT_POLICY_UNAVAILABLE',
      '当前用户植物上限策略不可用'
    )
  }
  return policy.activeUserPlantLimit
}

/** 以真实 Principal、Identity 锚点和活动策略为输入，生成并持久化首次登录快照。 */
export function createResolveFirstLoginCapabilitySnapshot(
  dependencies: ResolveFirstLoginCapabilitySnapshotDependencies
): (principal: UserPrincipalDto) => Promise<FirstLoginCapabilitySnapshotResolution> {
  const validators = createPublicContractValidators()

  return async principal => {
    const generatedAtMs = dependencies.now()
    if (
      !Number.isSafeInteger(generatedAtMs) ||
      generatedAtMs < zero ||
      !validators.userPrincipal(principal)
    ) {
      throw new FirstLoginCapabilitySnapshotError(
        'PRINCIPAL_INVALID',
        '能力快照需要有效的统一用户 Principal'
      )
    }
    const issuedAtMs = Date.parse(principal.issuedAt)
    const sessionExpiresAtMs = Date.parse(principal.expiresAt)
    if (
      !Number.isSafeInteger(issuedAtMs) ||
      !Number.isSafeInteger(sessionExpiresAtMs) ||
      issuedAtMs > generatedAtMs ||
      sessionExpiresAtMs <= generatedAtMs
    ) {
      throw new FirstLoginCapabilitySnapshotError('PRINCIPAL_INVALID', '登录会话当前无效')
    }

    const anchor = await dependencies.readIdentityTrialAnchor(principal.user_id)
    if (anchor === null) {
      throw new FirstLoginCapabilitySnapshotError(
        'TRIAL_ANCHOR_UNAVAILABLE',
        'Identity 未返回统一用户试用锚点'
      )
    }
    if (anchor.userRef !== principal.user_id) {
      throw new FirstLoginCapabilitySnapshotError(
        'TRIAL_ANCHOR_USER_MISMATCH',
        'Identity 试用锚点与已认证统一用户不匹配'
      )
    }

    const trialPolicy = await dependencies.readTrialEligibilityPolicy(anchor.createdAtMs)
    if (trialPolicy === null) {
      throw new FirstLoginCapabilitySnapshotError(
        'TRIAL_POLICY_UNAVAILABLE',
        '用户注册时适用的试用策略不可用'
      )
    }
    verifyPolicySource(trialPolicy)
    const trialResolution = deriveTrialEligibility({
      user: { status: anchor.status, createdAtMs: anchor.createdAtMs },
      nowMs: generatedAtMs,
      policySnapshot: trialPolicy
    })
    if (trialResolution.eligibility === 'denied') {
      throw new FirstLoginCapabilitySnapshotError(
        trialResolution.reason === 'TRIAL_POLICY_UNAVAILABLE'
          ? 'TRIAL_POLICY_UNAVAILABLE'
          : 'TRIAL_POLICY_INVALID',
        '无法依据可信 Identity 与已发布试用策略确定用户层级'
      )
    }

    const tier: UserCapabilitySnapshotDto['tier'] =
      trialResolution.eligibility === 'active' ? 'trial' : 'free'
    const [activeCatalogRecord, userPlantLimitPolicy] = await Promise.all([
      dependencies.readActiveCapabilityCatalog(),
      dependencies.readUserPlantLimitPolicy(tier)
    ])
    const capabilityCatalog: VerifiedCapabilityCatalog = resolveCapabilityCatalogPolicy(
      activeCatalogRecord,
      generatedAtMs
    )
    if (userPlantLimitPolicy === null) {
      throw new FirstLoginCapabilitySnapshotError(
        'USER_PLANT_LIMIT_POLICY_UNAVAILABLE',
        '当前用户植物上限策略不可用'
      )
    }
    verifyPolicySource(userPlantLimitPolicy, 'USER_PLANT_LIMIT_POLICY_UNAVAILABLE')
    const activeUserPlantLimit = resolveUserPlantLimit(userPlantLimitPolicy, tier, generatedAtMs)
    const allowedCapabilities = capabilityCatalog.capabilities
      .filter(capability => capability.tiers.includes(tier))
      .map(capability => capability.code)
    const rewardedAiScopes = capabilityCatalog.capabilities
      .filter(capability => generativeCapabilities.has(capability.code))
      .map(capability => capability.code) as UserCapabilitySnapshotDto['rewardedAiScopes']
    const expiryCandidates = [sessionExpiresAtMs]
    if (tier === 'trial') {
      expiryCandidates.push(trialResolution.expiresAtMs)
    }
    if (capabilityCatalog.expiresAtMs !== null) {
      expiryCandidates.push(capabilityCatalog.expiresAtMs)
    }
    const validUntilMs = Math.min(...expiryCandidates)
    if (validUntilMs <= generatedAtMs) {
      throw new FirstLoginCapabilitySnapshotError(
        'CAPABILITY_SNAPSHOT_EXPIRED',
        '生成时已没有未来有效期的能力快照'
      )
    }

    const snapshot: UserCapabilitySnapshotDto = {
      contractVersion: 'capability-snapshot/v1',
      snapshotRef: dependencies.createSnapshotRef(),
      subjectType: 'user',
      user_id: principal.user_id,
      tier,
      allowedCapabilities,
      rewardedAiScopes,
      activeUserPlantLimit,
      generatedAt: new Date(generatedAtMs).toISOString(),
      validUntil: new Date(validUntilMs).toISOString(),
      policyVersion: capabilityCatalog.releaseVersion
    }
    if (!validators.capabilitySnapshot(snapshot)) {
      throw new FirstLoginCapabilitySnapshotError(
        'CAPABILITY_SNAPSHOT_INVALID',
        '能力快照不满足冻结 DTO 合同'
      )
    }

    await runDatabaseTransaction<MysqlTransactionContext<Mysql2QueryConnection>, void>(
      dependencies.transactionDriver,
      transaction =>
        dependencies.repository.insertCapabilitySnapshot(transaction, snapshot, capabilityCatalog)
    )

    return {
      snapshot,
      policySourceVersions: {
        capabilityCatalog: {
          releaseRef: capabilityCatalog.releaseRef,
          releaseVersion: capabilityCatalog.releaseVersion,
          contentSha256: capabilityCatalog.contentSha256
        },
        trialEligibility: {
          sourceRef: trialPolicy.sourceRef,
          releaseVersion: trialPolicy.releaseVersion,
          contentSha256: trialPolicy.contentSha256
        },
        userPlantLimit: {
          sourceRef: userPlantLimitPolicy.sourceRef,
          releaseVersion: userPlantLimitPolicy.releaseVersion,
          contentSha256: userPlantLimitPolicy.contentSha256
        }
      }
    }
  }
}
