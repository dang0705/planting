import type {
  DiagnosisVisualGenerationRules,
  UserPlantAssetRules
} from '../../../configuration/business-policies/index.js'
import type { UserCapabilitySnapshotDto, UserPrincipalDto } from '../../../contracts/types.js'
import type { TypedPolicySnapshot } from '../../../foundation/policy/mysql-typed-policy-reader.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../../foundation/idempotency/http-idempotency.js'
import type { HttpIdempotencyReservationInput } from '../../../foundation/idempotency/mysql-http-idempotency-repository.js'
import type { VisualSqlContext } from '../repository/mysql-visual-diagnosis-repository.js'

/**
 * 视觉诊断应用层端口（像前端的依赖注入接口）：用例只依赖这些函数签名，
 * 生产环境接 MySQL、CloudBase 存储与百炼，测试换成内存假实现。
 */

/** 已发布的视觉诊断提示词版本组（提示词、输出 Schema 与药剂名单）；待冻结时端口返回 null，接口 503。 */
export interface VisualPromptRelease {
  /** 固定前缀全文（system 消息）。 */
  readonly prefixText: string
  /** 固定前缀规范化 SHA-256（diagnosis.visual_gen.prompt_release_sha256）。 */
  readonly promptReleaseSha256: string
  /** 模型输出结构版本（diagnosis.visual_gen.output_schema_version）。 */
  readonly outputSchemaVersion: string
  /** 药剂允许名单版本（diagnosis.visual_gen.agent_allowlist_ref）。 */
  readonly agentAllowlistVersion: string
  /** 当前提示词的病因编号闭集，供安全门核对。 */
  readonly causeCatalog: readonly string[]
  /** 严格模式使用的输出 JSON Schema；未冻结时为 null（此时不得启用严格模式）。 */
  readonly strictOutputSchema: object | null
}

/** 按前缀摘要读取已发布的提示词（打包的发布文件）；没有对应发布时返回 null（接口 503）。 */
export type ReadVisualPromptRelease = (
  promptReleaseSha256: string
) => Promise<VisualPromptRelease | null>

/** 读取视觉诊断生成策略快照（diagnosis/visual_generation）。 */
export type ReadVisualGenerationPolicy =
  () => Promise<TypedPolicySnapshot<DiagnosisVisualGenerationRules> | null>

/** 读取上传资产策略（user-plant/asset_rules：图片类型白名单与单图字节上限）。 */
export type ReadVisualAssetRules = () => Promise<Readonly<UserPlantAssetRules> | null>

/** 读取 AI 额度预占有效期秒数（subscription.ai_reservation.ttl_seconds，待冻结时返回 null）。 */
export type ReadReservationTtlSeconds = () => Promise<number | null>

/** 读取能力快照；失效抛 CapabilitySnapshotExpiredError，不可用抛 CapabilitySnapshotUnavailableError。 */
export type ReadCapabilitySnapshot = (
  principal: UserPrincipalDto
) => Promise<UserCapabilitySnapshotDto>

/** 读取长期植物的诊断上下文摘要（diagnosis-context-summary/v1）；读不到返回 null，由 diagnosis 写「未知」。 */
export type ReadVisualContextSummary = (input: {
  /** 统一用户公开引用。 */
  readonly userRef: string
  /** 用户植物公开引用。 */
  readonly userPlantRef: string
}) => Promise<unknown>

/** 幂等写端口：同一事务内占位 → 业务步骤 → 记录首次结果（生产为 runIdempotentWrite）。 */
export type RunVisualIdempotentWrite = (
  idempotency: HttpIdempotencyReservationInput,
  work: (context: VisualSqlContext) => Promise<HttpIdempotencyPublicResponseSnapshot>
) => Promise<HttpIdempotencyPublicResponseSnapshot>

/** 生成高熵公开引用（前缀 + 随机串）。 */
export type CreateVisualRef = (prefix: 'vds_' | 'dvi_' | 'dvf_') => string
