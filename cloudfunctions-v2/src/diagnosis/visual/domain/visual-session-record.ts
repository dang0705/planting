import type { DiagnosisVisualGenerationRules } from '../../../configuration/business-policies/index.js'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../../foundation/json/canonical-json-sha256.js'
import type { PublicImageAssessment } from '../../application/run-visual-generation.js'
import type { PublicVisualDiagnosisResult } from '../../domain/project-visual-gen-result.js'
import type { ModelAttempt } from '../../provider/visual-model-registry.js'
import type { ContextSummary } from './context-summary.js'
import type { VisualModelCall } from './visual-cost.js'

/**
 * 视觉诊断会话记录（ClickUp z8v0kmvhnd：结果不可变、带版本组与 SHA-256、可回放）。
 *
 * 通俗说明：一次诊断像一张「订单」——创建时锁定当时生效的策略快照（版本组），处理完成后只写一次终态，之后只读。
 * 回放（历史详情）直接返回当时保存的公开结果，不会重新调用模型，也不会因为提示词或模型换版而变化。
 */

/** 会话状态。 */
export type VisualSessionStatus =
  | 'processing'
  | 'completed'
  | 'released_no_charge'
  | 'failed_no_charge'

/** 不扣点的结束原因。 */
export type VisualReleaseReason =
  | 'not_plant'
  | 'image_unusable'
  | 'model_failed'
  | 'safety_gate_rejected'

/** 额度结局：已结算、已释放、待对账，或结算调用失败未确认（由对账兜底）。 */
export type VisualQuotaOutcome = 'settled' | 'released' | 'pending_reconciliation' | 'unconfirmed'

/** 诊断对象（内部主键只在服务端使用）。 */
export type VisualSubjectRecord =
  | {
      /** 对象类型：本人用户植物。 */
      readonly kind: 'user_plant'
      /** 用户植物内部主键（字符串形式的 BIGINT）。 */
      readonly internalId: string
      /** 用户植物公开引用，用于历史列表展示。 */
      readonly userPlantRef: string
    }
  | {
      /** 对象类型：本人登录临时案例（结果不写入任何用户植物事实）。 */
      readonly kind: 'authenticated_ephemeral'
      /** 临时案例内部主键（字符串形式的 BIGINT）。 */
      readonly internalId: string
    }

/** 版本组：创建时锁定，处理与回放都只用它。 */
export interface VisualVersionGroup {
  /** diagnosis/visual_generation 策略发布版本号。 */
  readonly policyReleaseVersion: string
  /** 该发布正文的规范化 SHA-256。 */
  readonly policyContentSha256: string
  /** 策略正文快照（模型顺序、请求参数、成本策略与价目）。 */
  readonly rules: DiagnosisVisualGenerationRules
  /** 固定前缀提示词的 SHA-256（提示词发布）。 */
  readonly promptReleaseSha256: string
  /** 模型输出结构版本。 */
  readonly outputSchemaVersion: string
  /** 药剂允许名单版本。 */
  readonly agentAllowlistVersion: string
  /** 单图字节上限（来自 user-plant/asset_rules 策略快照），处理时下载校验使用。 */
  readonly maxImageBytes: number
  /** 创建时锁定的 AI 额度预占有效期秒数（subscription/ai_reservation）。 */
  readonly reservationTtlSeconds: number
  /** 本次预占的到期时刻，UTC 毫秒；到期后不得结算，只能转入对账。 */
  readonly reservationExpiresAtMs: number
  /** 整单截止时刻 = 预占到期 − 60 秒（硬规则 diagnosis.visual.processing_deadline），UTC 毫秒。 */
  readonly processingDeadlineMs: number
}

/** 整单时长相对预占有效期的安全余量（硬规则 diagnosis.visual.processing_deadline：留 60 秒给结算与写终态）。 */
export const VISUAL_PROCESSING_SAFETY_MARGIN_MS = 60_000

/** 新建会话（处理中）。 */
export interface NewVisualSession {
  /** 高熵诊断公开引用 vds_…。 */
  readonly visualDiagnosisRef: string
  /** 发起诊断并被扣点的用户内部主键（字符串形式的 BIGINT）。 */
  readonly userInternalId: string
  /** 诊断对象：本人用户植物或本人登录临时案例。 */
  readonly subject: VisualSubjectRecord
  /** 1～3 个已登记图片引用，顺序即 imageIndex。 */
  readonly imageRefs: readonly string[]
  /** 用户描述（≤200 字）；没有时为 null。 */
  readonly userQuestionZh: string | null
  /** AI 额度预占引用。 */
  readonly reservationRef: string
  /** 版本组：创建时锁定的策略、提示词与名单版本。 */
  readonly versionGroup: VisualVersionGroup
  /** 已校验的上下文摘要；没有时为 null。 */
  readonly contextSummary: ContextSummary | null
  /** 创建时间，UTC 毫秒。 */
  readonly createdAtMs: number
}

/** 写入一次的终态。 */
export interface VisualSessionFinalization {
  /** 终态：已完成、释放不扣点或失败不扣点。 */
  readonly status: Exclude<VisualSessionStatus, 'processing'>
  /** 不扣点原因；完成时为 null。 */
  readonly releaseReason: VisualReleaseReason | null
  /** 完成时的公开结果；其他终态为 null。 */
  readonly publicResult: PublicVisualDiagnosisResult | null
  /** 脱敏图片评估；模型失败等没有评估时为 null。 */
  readonly imageAssessment: PublicImageAssessment | null
  /** 最终产出结果的模型代码；没有时为 null。 */
  readonly modelCode: string | null
  /** 每次模型回包原文的 SHA-256。 */
  readonly rawTextSha256s: readonly string[]
  /** 每次成功调用的模型与计量。 */
  readonly calls: readonly VisualModelCall[]
  /** 全部尝试记录（模型代码、结果类型、HTTP 状态）。 */
  readonly attempts: readonly ModelAttempt[]
  /** 实际成本，人民币微元。 */
  readonly costMicros: number
  /** 公开扣点（不超过预估点数）；不扣点为 0。 */
  readonly chargedPoints: number
  /** 额度结局：已结算、已释放、待对账或未确认。 */
  readonly quotaOutcome: VisualQuotaOutcome
  /** 记录摘要（calculateVisualRecordSha256）。 */
  readonly recordSha256: string
  /** 进入终态时间，UTC 毫秒。 */
  readonly completedAtMs: number
}

/** 规范化记录摘要：版本组 + 输入 + 终态（不含摘要本身），用于审计与回放一致性校验。 */
export function calculateVisualRecordSha256(
  session: Pick<
    NewVisualSession,
    'visualDiagnosisRef' | 'imageRefs' | 'userQuestionZh' | 'versionGroup' | 'contextSummary'
  >,
  finalization: Omit<VisualSessionFinalization, 'recordSha256'>
): string {
  return calculateCanonicalJsonSha256({
    recordVersion: 'diagnosis-visual-session-record/v1',
    session: {
      visualDiagnosisRef: session.visualDiagnosisRef,
      imageRefs: session.imageRefs,
      userQuestionZh: session.userQuestionZh,
      versionGroup: session.versionGroup,
      contextSummary: session.contextSummary
    },
    finalization
  } as unknown as CanonicalJsonValue)
}

/** 公开会话响应（diagnosis-visual-api/v1 VisualDiagnosisSessionResponse）。 */
export interface VisualDiagnosisSessionResponse {
  /** 诊断公开引用，格式 vds_…。 */
  readonly visualDiagnosisRef: string
  /** 会话状态：处理中、已完成、释放不扣点或失败不扣点。 */
  readonly status: VisualSessionStatus
  /** 创建时间（UTC ISO）。 */
  readonly createdAt: string
  /** 进入终态时间（UTC ISO）；处理中省略。 */
  readonly completedAt?: string
  /** 完成时的公开结果。 */
  readonly result?: PublicVisualDiagnosisResult
  /** 不扣点原因：非植物、图片不可用、模型失败或安全门拒绝。 */
  readonly releaseReason?: VisualReleaseReason
  /** 实际扣点；终态才给出。 */
  readonly chargedPoints?: number
  /** 脱敏图片评估（总体判定与逐张质量）。 */
  readonly imageAssessment?: PublicImageAssessment
}

/** 读回的公开字段（仓储行）。 */
export interface VisualSessionPublicRow {
  /** 诊断公开引用，格式 vds_…。 */
  readonly visualDiagnosisRef: string
  /** 会话状态：处理中、已完成、释放不扣点或失败不扣点。 */
  readonly status: VisualSessionStatus
  /** 创建时间，UTC 毫秒。 */
  readonly createdAtMs: number
  /** 终态时间，UTC 毫秒；处理中为 null。 */
  readonly completedAtMs: number | null
  /** 公开结果；没有时为 null。 */
  readonly publicResult: PublicVisualDiagnosisResult | null
  /** 图片评估；没有时为 null。 */
  readonly imageAssessment: PublicImageAssessment | null
  /** 不扣点原因；没有时为 null。 */
  readonly releaseReason: VisualReleaseReason | null
  /** 公开扣点；处理中为 null。 */
  readonly chargedPoints: number | null
  /** 记录摘要；处理中为 null。 */
  readonly recordSha256: string | null
  /** 用户植物公开引用；临时案例为 null。 */
  readonly userPlantRef: string | null
}

/** 仓储行 → 公开响应：只输出合同白名单字段，不含用户、预占、模型、成本等内部字段。 */
export function projectVisualSessionResponse(
  row: VisualSessionPublicRow
): VisualDiagnosisSessionResponse {
  const base = {
    visualDiagnosisRef: row.visualDiagnosisRef,
    status: row.status,
    createdAt: new Date(row.createdAtMs).toISOString()
  }
  if (row.status === 'processing' || row.completedAtMs === null) {
    return base
  }
  return {
    ...base,
    completedAt: new Date(row.completedAtMs).toISOString(),
    ...(row.publicResult === null ? {} : { result: row.publicResult }),
    ...(row.releaseReason === null ? {} : { releaseReason: row.releaseReason }),
    chargedPoints: row.chargedPoints ?? 0,
    ...(row.imageAssessment === null ? {} : { imageAssessment: row.imageAssessment })
  }
}

/** 历史列表项（diagnosis-visual-api/v1 VisualDiagnosisListItem）。 */
export interface VisualDiagnosisListItem {
  /** 诊断公开引用，格式 vds_…。 */
  readonly visualDiagnosisRef: string
  /** 会话状态：处理中、已完成、释放不扣点或失败不扣点。 */
  readonly status: VisualSessionStatus
  /** 创建时间（UTC ISO）。 */
  readonly createdAt: string
  /** 诊断名称（完成时，≤40 字）。 */
  readonly titleZh?: string
  /** 用户植物公开引用；临时案例省略。 */
  readonly userPlantRef?: string
}

/** 仓储行 → 列表项。 */
export function projectVisualListItem(row: VisualSessionPublicRow): VisualDiagnosisListItem {
  const title = row.publicResult?.titleZh
  return {
    visualDiagnosisRef: row.visualDiagnosisRef,
    status: row.status,
    createdAt: new Date(row.createdAtMs).toISOString(),
    ...(typeof title === 'string' && title.length > 0
      ? { titleZh: [...title].slice(0, 40).join('') }
      : {}),
    ...(row.userPlantRef === null ? {} : { userPlantRef: row.userPlantRef })
  }
}
