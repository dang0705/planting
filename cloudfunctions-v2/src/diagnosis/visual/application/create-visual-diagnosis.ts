import { createHash } from 'node:crypto'

import {
  idempotencyRetentionMs,
  type HttpRequestWriteRules
} from '../../../configuration/business-policies/index.js'
import type { UserPrincipalDto } from '../../../contracts/types.js'
import type { PolicyRulesPort } from '../../../foundation/policy/require-policy.js'
import { PublicRequestError } from '../../../foundation/http/request-chain.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../../foundation/idempotency/http-idempotency.js'
import {
  IdempotentWriteRetryLaterError,
  publicErrorSnapshot
} from '../../../foundation/idempotency/run-idempotent-write.js'
import { calculateCanonicalJsonSha256 } from '../../../foundation/json/canonical-json-sha256.js'
import type {
  ReserveAiQuotaCommand,
  ReserveAiQuotaResult
} from '../../../subscription/application/reserve-ai-quota.js'
import { AiQuotaReservationPersistenceError } from '../../../subscription/repository/ai-quota-reservation-repository-types.js'
import { assertVisualInputBudget } from '../../domain/visual-input-budget.js'
import { sanitizeContextSummary, type ContextSummary } from '../domain/context-summary.js'
import {
  projectVisualSessionResponse,
  type NewVisualSession,
  type VisualVersionGroup
} from '../domain/visual-session-record.js'
import type { MysqlVisualDiagnosisRepository } from '../repository/mysql-visual-diagnosis-repository.js'
import { assertVisualCapability } from './visual-capability.js'
import type {
  CreateVisualRef,
  ReadCapabilitySnapshot,
  ReadReservationTtlSeconds,
  ReadVisualAssetRules,
  ReadVisualContextSummary,
  ReadVisualGenerationPolicy,
  ReadVisualPromptRelease,
  RunVisualIdempotentWrite
} from './visual-ports.js'

/**
 * 发起视觉诊断（diagnosis-visual-api.md §2.2、§3）。
 *
 * 通俗说明：像下单——先确认会员权益和配置都在，再在同一个幂等「订单号」（Idempotency-Key）下：
 * 核验植物/临时案例与图片都是本人的 → 在调用模型之前先冻结 AI 点数（预占）→ 建一张「处理中」的诊断单 → 返回 202。
 * 模型调用在之后异步处理；同键同参重放返回首次结果，不会重复冻结点数。
 */

/** 诊断对象：本人用户植物。 */
export interface VisualUserPlantSubjectRequest {
  /** 本人用户植物公开引用，格式 upl_…。 */
  readonly userPlantRef: string
}

/** 诊断对象：本人登录临时案例。 */
export interface VisualEphemeralSubjectRequest {
  /** 本人登录临时案例公开引用，格式 epc_…。 */
  readonly ephemeralPlantCaseRef: string
}

/** 诊断对象（二选一）。 */
export type VisualDiagnosisSubjectRequest =
  | VisualUserPlantSubjectRequest
  | VisualEphemeralSubjectRequest

/** 发起诊断的公开请求（已通过 DTO 校验）。 */
export interface CreateVisualDiagnosisRequest {
  /** 诊断对象：本人用户植物或本人登录临时案例（二选一）。 */
  readonly subject: VisualDiagnosisSubjectRequest
  /** 1～3 个已登记图片引用。 */
  readonly imageRefs: readonly string[]
  /** 用户描述（可选，≤200 字）。 */
  readonly userQuestionZh?: string
}

/** 用例输入。 */
export interface CreateVisualDiagnosisInput {
  /** 已解析的登录主体（游客在路由层已拒绝）。 */
  readonly principal: UserPrincipalDto
  /** 已校验的请求体。 */
  readonly request: CreateVisualDiagnosisRequest
  /** 原始 Idempotency-Key（只用其摘要）。 */
  readonly idempotencyKey: string
}

/** 用例依赖。 */
export interface CreateVisualDiagnosisDependencies {
  /** 读取能力快照（判断是否拥有视觉诊断能力）。 */
  readonly readCapabilitySnapshot: ReadCapabilitySnapshot
  /** 读取生成策略快照。 */
  readonly readGenerationPolicy: ReadVisualGenerationPolicy
  /** 读取上传资产策略。 */
  readonly readAssetRules: ReadVisualAssetRules
  /** 读取提示词发布（待冻结时为 null）。 */
  readonly readPromptRelease: ReadVisualPromptRelease
  /** 读取预占有效期（待冻结时为 null）。 */
  readonly readReservationTtlSeconds: ReadReservationTtlSeconds
  /** 读取 HTTP 写入策略（幂等记录保留期，http/request_write）。 */
  readonly readHttpWriteRules: PolicyRulesPort<HttpRequestWriteRules>
  /** 模型供应商环境是否已配置（凭证、时限、重试次数）。 */
  readonly isModelProviderConfigured: () => boolean
  /** 读取长期植物上下文摘要。 */
  readonly readContextSummary: ReadVisualContextSummary
  /** 幂等写端口（同键同参返回首次结果）。 */
  readonly runIdempotent: RunVisualIdempotentWrite
  /** 视觉诊断仓储（只用到下列方法）。 */
  readonly repository: Pick<
    MysqlVisualDiagnosisRepository,
    'readUserInternalId' | 'readSubject' | 'readOwnedImages' | 'insertSession'
  >
  /** AI 额度预占用例（独立事务）。 */
  readonly reserveQuota: (command: ReserveAiQuotaCommand) => Promise<ReserveAiQuotaResult>
  /** 调度后台处理（不等待）。 */
  readonly scheduleProcessing: (visualDiagnosisRef: string) => void
  /** 生成高熵公开引用。 */
  readonly createRef: CreateVisualRef
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 公开路由常量（幂等作用域）。 */
export const createVisualDiagnosisRoutePath = '/api/v2/diagnosis/visual/sessions'
/** 公开操作编号（幂等作用域）。 */
export const createVisualDiagnosisOperationId = 'createVisualDiagnosis'

const sha256 = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')
const unavailable = (message = '服务暂时不可用') =>
  new PublicRequestError(503, 'SERVICE_UNAVAILABLE', message)

/** 创建发起视觉诊断用例。 */
export function createCreateVisualDiagnosisUseCase(deps: CreateVisualDiagnosisDependencies) {
  return async (
    input: CreateVisualDiagnosisInput
  ): Promise<HttpIdempotencyPublicResponseSnapshot> => {
    const { principal, request } = input
    await assertVisualCapability(deps.readCapabilitySnapshot, principal)
    const [policy, assetRules, ttlSeconds, writeRules] = await Promise.all([
      deps.readGenerationPolicy(),
      deps.readAssetRules(),
      deps.readReservationTtlSeconds(),
      deps.readHttpWriteRules()
    ])
    const requestedPrompt = policy?.rules.promptRelease
    const prompt =
      requestedPrompt === undefined
        ? null
        : await deps.readPromptRelease(requestedPrompt.promptReleaseSha256)
    if (
      policy === null ||
      assetRules === null ||
      prompt === null ||
      prompt.promptReleaseSha256 !== requestedPrompt?.promptReleaseSha256 ||
      prompt.outputSchemaVersion !== requestedPrompt.outputSchemaVersion ||
      prompt.agentAllowlistVersion !== requestedPrompt.agentAllowlistVersion ||
      ttlSeconds === null ||
      writeRules === null ||
      !deps.isModelProviderConfigured()
    ) {
      throw unavailable('视觉诊断暂不可用')
    }
    const cost = policy.rules.costPolicy
    assertVisualInputBudget(
      { maxInputTokens: cost.maxInputTokens, maxImages: cost.maxImages },
      { imageCount: request.imageRefs.length }
    )

    const nowMs = deps.now()
    const keyHash = sha256(input.idempotencyKey)
    const requestBody = {
      subject: request.subject,
      imageRefs: request.imageRefs,
      ...(request.userQuestionZh === undefined ? {} : { userQuestionZh: request.userQuestionZh })
    }
    const requestHash = calculateCanonicalJsonSha256({
      path: createVisualDiagnosisRoutePath,
      body: requestBody
    } as never)
    const versionGroup: VisualVersionGroup = {
      policyReleaseVersion: policy.releaseVersion,
      policyContentSha256: policy.contentSha256,
      rules: policy.rules,
      promptReleaseSha256: prompt.promptReleaseSha256,
      outputSchemaVersion: prompt.outputSchemaVersion,
      agentAllowlistVersion: prompt.agentAllowlistVersion,
      maxImageBytes: assetRules.maxImageBytes
    }
    // 上下文摘要是外部只读来源，放在事务外读取；读不到或不合格时按「无摘要」处理（全部写「未知」）。
    let contextSummary: ContextSummary | null = null
    if ('userPlantRef' in request.subject) {
      contextSummary = sanitizeContextSummary(
        await deps
          .readContextSummary({
            userRef: principal.user_id,
            userPlantRef: request.subject.userPlantRef
          })
          .catch(() => null),
        'long_term_plant'
      )
    }

    const snapshot = await deps.runIdempotent(
      {
        principalType: 'user',
        principalScopeHash: sha256(principal.user_id),
        httpMethod: 'POST',
        normalizedPath: createVisualDiagnosisRoutePath,
        operationId: createVisualDiagnosisOperationId,
        idempotencyKeyHash: keyHash,
        requestHash,
        createdAtMs: nowMs,
        expiresAtMs: nowMs + idempotencyRetentionMs(writeRules)
      },
      async context => {
        const userInternalId = await deps.repository.readUserInternalId(context, principal.user_id)
        if (userInternalId === null) {
          throw new IdempotentWriteRetryLaterError('用户状态暂不可用')
        }
        const subject = await deps.repository.readSubject(context, {
          userInternalId,
          subject: request.subject,
          nowMs
        })
        if (subject === null) {
          return 'userPlantRef' in request.subject
            ? publicErrorSnapshot(404, 'USER_PLANT_NOT_FOUND', '用户植物不存在')
            : publicErrorSnapshot(404, 'NOT_FOUND', '临时案例不存在或已失效')
        }
        if (subject.kind === 'user_plant' && subject.lifecycle === 'archived') {
          return publicErrorSnapshot(409, 'USER_PLANT_ARCHIVED', '用户植物已归档')
        }
        const images = await deps.repository.readOwnedImages(context, {
          userInternalId,
          imageRefs: request.imageRefs
        })
        if (images.length !== request.imageRefs.length) {
          return publicErrorSnapshot(404, 'NOT_FOUND', '图片不存在')
        }
        let reservation: ReserveAiQuotaResult
        try {
          reservation = await deps.reserveQuota({
            userRef: principal.user_id,
            productActionId: `vda_${sha256(`${principal.user_id}|${keyHash}`).slice(0, 40)}`,
            costPolicyVersion: cost.costPolicyVersion,
            capability: 'USER_DIAGNOSIS_VISUAL',
            estimatedAmount: cost.estimatedPoints,
            idempotencyKey: keyHash,
            requestHash,
            expiresAtMs: nowMs + ttlSeconds * 1000,
            occurredAtMs: nowMs
          })
        } catch (error) {
          if (
            error instanceof AiQuotaReservationPersistenceError &&
            error.type === 'IDEMPOTENCY_CONFLICT'
          ) {
            return publicErrorSnapshot(409, 'IDEMPOTENCY_CONFLICT', '请求与已记录内容冲突')
          }
          throw new IdempotentWriteRetryLaterError('额度服务暂不可用')
        }
        if (reservation.kind === 'insufficient_quota') {
          return publicErrorSnapshot(409, 'AI_QUOTA_INSUFFICIENT', 'AI 点数不足')
        }
        if (
          reservation.kind === 'replayed' &&
          'status' in reservation &&
          reservation.status !== 'reserved'
        ) {
          throw new IdempotentWriteRetryLaterError('额度预占已结束，请稍后重试')
        }
        const session: NewVisualSession = {
          visualDiagnosisRef: deps.createRef('vds_'),
          userInternalId,
          subject:
            subject.kind === 'user_plant'
              ? {
                  kind: 'user_plant',
                  internalId: subject.internalId,
                  userPlantRef: subject.userPlantRef
                }
              : { kind: 'authenticated_ephemeral', internalId: subject.internalId },
          imageRefs: request.imageRefs,
          userQuestionZh: request.userQuestionZh ?? null,
          reservationRef: reservation.reservationRef,
          versionGroup,
          contextSummary,
          createdAtMs: nowMs
        }
        await deps.repository.insertSession(context, session)
        return {
          status: 202,
          body: {
            data: projectVisualSessionResponse({
              visualDiagnosisRef: session.visualDiagnosisRef,
              status: 'processing',
              createdAtMs: nowMs,
              completedAtMs: null,
              publicResult: null,
              imageAssessment: null,
              releaseReason: null,
              chargedPoints: null,
              recordSha256: null,
              userPlantRef: null
            })
          }
        }
      }
    )
    const data = (snapshot.body as { data?: { visualDiagnosisRef?: unknown; status?: unknown } })
      .data
    if (
      snapshot.status === 202 &&
      data?.status === 'processing' &&
      typeof data.visualDiagnosisRef === 'string'
    ) {
      deps.scheduleProcessing(data.visualDiagnosisRef)
    }
    return snapshot
  }
}
