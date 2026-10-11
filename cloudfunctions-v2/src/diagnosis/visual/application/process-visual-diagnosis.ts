import type {
  SettleAiQuotaCommand,
  SettleAiQuotaResult
} from '../../../subscription/application/settle-ai-quota.js'
import type {
  MarkAiQuotaProviderResultUnknownCommand,
  MarkAiQuotaProviderResultUnknownResult
} from '../../../subscription/application/mark-ai-quota-provider-result-unknown.js'
import type { PrivateObjectStorage } from '../../../foundation/storage/cloudbase-storage-http-adapter.js'
import type { PrivateObjectUploader } from '../../../foundation/storage/cloudbase-storage-http-uploader.js'
import { ImageNormalizationError, type ImageNormalizer } from '../../image/image-normalizer.js'
import type { VisualModelClient } from '../../provider/visual-model-registry.js'
import {
  runVisualGeneration,
  type PublicImageAssessment,
  type VisualGenerationOutcome
} from '../../application/run-visual-generation.js'
import { renderVisualDynamicText } from '../domain/context-summary.js'
import { computeVisualChargedPoints, sumVisualCostMicros } from '../domain/visual-cost.js'
import { buildNormalizedImageObjectId } from '../domain/visual-image-path.js'
import {
  calculateVisualRecordSha256,
  type VisualQuotaOutcome,
  type VisualSessionFinalization
} from '../domain/visual-session-record.js'
import type {
  MysqlVisualDiagnosisRepository,
  VisualSessionProcessingRow,
  VisualSqlContext
} from '../repository/mysql-visual-diagnosis-repository.js'
import type { ReadVisualPromptRelease, VisualPromptRelease } from './visual-ports.js'

/**
 * 处理视觉诊断（diagnosis-visual-api.md §2.3、§3）。
 *
 * 通俗说明：像订单的后台履约——先「认领」这张诊断单（同一张单只会被处理一次），
 * 再下载原图 → 服务端压缩（长边 ≤1024、统一 JPEG、去掉 EXIF/GPS）→ 上传压缩图拿到 HTTPS 临时地址 → 调模型 → 安全门 →
 * 按实际成本结算点数（不扣点的情况释放预占，结果未知进入对账）→ 只写一次不可变终态。
 * 任何一步失败都不会把原图或模型原文交出去；结果只保存结构化数据与原文 SHA-256。
 */

/** 用例依赖。 */
export interface ProcessVisualDiagnosisDependencies {
  /** 在一个数据库事务中执行（认领与写终态各自一个短事务）。 */
  readonly runTransaction: <T>(work: (context: VisualSqlContext) => Promise<T>) => Promise<T>
  /** 视觉诊断仓储（只用到下列方法）。 */
  readonly repository: Pick<
    MysqlVisualDiagnosisRepository,
    'claimProcessing' | 'readSessionForProcessing' | 'finalizeSession'
  >
  /** 按创建时锁定的摘要读取提示词发布（与当前生效策略无关）。 */
  readonly readPromptRelease: ReadVisualPromptRelease
  /** 私有云存储（下载原图、取压缩图临时地址）。 */
  readonly storage: PrivateObjectStorage
  /** 私有云存储上传（写入压缩图）。 */
  readonly uploader: PrivateObjectUploader
  /** 服务端图片压缩器。 */
  readonly normalizer: ImageNormalizer
  /** 按成本策略的输出上限创建模型客户端；供应商未配置时返回 null。 */
  readonly createModelClient: (maxOutputTokens: number) => VisualModelClient | null
  /** AI 额度结算用例（settledAmount = 0 即全部释放）。 */
  readonly settleQuota: (command: SettleAiQuotaCommand) => Promise<SettleAiQuotaResult>
  /** 供应商结果未知时把预占转入对账。 */
  readonly markProviderUnknown: (
    command: MarkAiQuotaProviderResultUnknownCommand
  ) => Promise<MarkAiQuotaProviderResultUnknownResult>
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 处理前置步骤失败的分类。 */
interface PreparationFailure {
  /** 失败分类：图片不可用（按不扣点释放）或依赖失败（按模型失败释放）。 */
  readonly kind: 'image_unusable' | 'dependency_failed'
}

/** 图片不可用时的服务端评估（模型未运行，只给出逐张「不可用」）。 */
function unusableAssessment(imageCount: number): PublicImageAssessment {
  return {
    verdict: 'image_unusable',
    perImage: Array.from({ length: imageCount }, (_unused, index) => ({
      imageIndex: index + 1,
      visiblePart: 'unknown' as const,
      quality: 'unusable' as const,
      qualityIssues: []
    }))
  }
}

/** 下载原图 → 压缩 → 上传压缩图 → 取 HTTPS 临时地址。 */
async function prepareImageUrls(
  deps: ProcessVisualDiagnosisDependencies,
  row: VisualSessionProcessingRow,
  nowMs: number
): Promise<readonly string[] | PreparationFailure> {
  const urls: string[] = []
  for (const [index, image] of row.images.entries()) {
    let normalized
    try {
      const sourceUrl = await deps.storage.getDownloadUrl(image.storageFileId)
      if (sourceUrl === null) {
        return { kind: 'dependency_failed' }
      }
      const bytes = await deps.storage.download(sourceUrl, row.versionGroup.maxImageBytes)
      if (bytes === 'too_large') {
        return { kind: 'image_unusable' }
      }
      normalized = await deps.normalizer.normalize(Buffer.from(bytes), image.mimeType)
    } catch (error) {
      return error instanceof ImageNormalizationError
        ? { kind: 'image_unusable' }
        : { kind: 'dependency_failed' }
    }
    try {
      const objectId = buildNormalizedImageObjectId(
        row.userRef,
        nowMs,
        row.visualDiagnosisRef,
        index + 1
      )
      const uploaded = await deps.uploader.upload(objectId, normalized.bytes, normalized.mime)
      const url = await deps.storage.getDownloadUrl(uploaded.cloudObjectId)
      if (url === null || !url.startsWith('https://')) {
        return { kind: 'dependency_failed' }
      }
      urls.push(url)
    } catch {
      return { kind: 'dependency_failed' }
    }
  }
  return urls
}

/** 运行模型生成；前置失败时折算成与模型失败同形的结局。 */
async function generate(
  deps: ProcessVisualDiagnosisDependencies,
  row: VisualSessionProcessingRow,
  prompt: VisualPromptRelease | null,
  nowMs: number
): Promise<VisualGenerationOutcome | PreparationFailure> {
  const rules = row.versionGroup.rules
  const strict = rules.requestParams.responseFormat === 'json_schema_strict'
  if (
    prompt === null ||
    prompt.promptReleaseSha256 !== row.versionGroup.promptReleaseSha256 ||
    (strict && prompt.strictOutputSchema === null)
  ) {
    return { kind: 'dependency_failed' }
  }
  const client = deps.createModelClient(rules.costPolicy.maxOutputTokens)
  if (client === null) {
    return { kind: 'dependency_failed' }
  }
  const imageUrls = await prepareImageUrls(deps, row, nowMs)
  if (!Array.isArray(imageUrls)) {
    return imageUrls as PreparationFailure
  }
  return runVisualGeneration(client, {
    modelOrder: rules.modelOrder,
    request: {
      prefixText: prompt.prefixText,
      dynamicText: renderVisualDynamicText({
        imageCount: imageUrls.length,
        caseKind: row.subject.kind === 'user_plant' ? 'long_term_plant' : 'temporary_case',
        summary: row.contextSummary,
        userQuestionZh: row.userQuestionZh
      }),
      imageUrls,
      ...(strict && prompt.strictOutputSchema !== null
        ? {
            strictSchema: { name: 'diagnosis_visual_gen_output', schema: prompt.strictOutputSchema }
          }
        : {})
    },
    context: { edibleContext: 'unknown', causeCatalog: prompt.causeCatalog },
    maxModelLoops: rules.costPolicy.maxModelLoops,
    canStartNextLoop: calls =>
      sumVisualCostMicros(calls, rules.tariffs) < rules.costPolicy.maxCostMicros
  })
}

/** 结算或释放额度；调用失败时返回 unconfirmed（预占由 TTL 扫描转入对账）。 */
async function settle(
  deps: ProcessVisualDiagnosisDependencies,
  row: VisualSessionProcessingRow,
  input: {
    readonly requestedPoints: number
    readonly costMicros: number
    readonly providerResultUnknown: boolean
    readonly nowMs: number
  }
): Promise<VisualQuotaOutcome> {
  try {
    if (input.providerResultUnknown) {
      await deps.markProviderUnknown({
        userRef: row.userRef as never,
        reservationRef: row.reservationRef,
        occurredAtMs: input.nowMs
      })
      return 'pending_reconciliation'
    }
    const cost = row.versionGroup.rules.costPolicy
    const overage = input.requestedPoints > cost.estimatedPoints
    const result = await deps.settleQuota({
      userRef: row.userRef as never,
      reservationRef: row.reservationRef,
      settledAmount: input.requestedPoints,
      actualCostMicros: input.costMicros,
      usageEvidenceRef: `vds:${row.visualDiagnosisRef}`,
      platformAbsorbedCostMicros: overage
        ? input.costMicros - cost.estimatedPoints * cost.microsPerPoint
        : 0,
      occurredAtMs: input.nowMs
    })
    return result.kind === 'replayed'
      ? result.status === 'pending_reconciliation'
        ? 'pending_reconciliation'
        : result.status
      : result.kind
  } catch {
    return 'unconfirmed'
  }
}

/** 创建处理用例：返回 finalized（写入了终态）或 skipped（已被认领或不在处理中）。 */
export function createProcessVisualDiagnosisUseCase(deps: ProcessVisualDiagnosisDependencies) {
  return async (visualDiagnosisRef: string): Promise<'finalized' | 'skipped'> => {
    const claimedAtMs = deps.now()
    const claimed = await deps.runTransaction(context =>
      deps.repository.claimProcessing(context, { visualDiagnosisRef, nowMs: claimedAtMs })
    )
    if (!claimed) {
      return 'skipped'
    }
    const row = await deps.runTransaction(context =>
      deps.repository.readSessionForProcessing(context, visualDiagnosisRef)
    )
    if (row === null || row.status !== 'processing') {
      return 'skipped'
    }
    const prompt = await deps
      .readPromptRelease(row.versionGroup.promptReleaseSha256)
      .catch(() => null)
    const outcome = await generate(deps, row, prompt, claimedAtMs)
    const nowMs = deps.now()
    const rules = row.versionGroup.rules
    const calls = 'calls' in outcome ? outcome.calls : []
    const costMicros = sumVisualCostMicros(calls, rules.tariffs)
    const points = computeVisualChargedPoints(costMicros, rules.costPolicy)
    const completed = 'status' in outcome && outcome.status === 'completed'
    const providerResultUnknown =
      'status' in outcome && outcome.status === 'failed' && outcome.providerResultUnknown
    const quotaOutcome = await settle(deps, row, {
      requestedPoints: completed ? points.requestedPoints : 0,
      costMicros,
      providerResultUnknown,
      nowMs
    })
    const base = {
      rawTextSha256s: 'rawTextSha256s' in outcome ? outcome.rawTextSha256s : [],
      calls,
      attempts: 'attempts' in outcome ? outcome.attempts : [],
      costMicros,
      quotaOutcome,
      completedAtMs: nowMs
    }
    let finalization: Omit<VisualSessionFinalization, 'recordSha256'>
    if ('kind' in outcome) {
      finalization =
        outcome.kind === 'image_unusable'
          ? {
              ...base,
              status: 'released_no_charge',
              releaseReason: 'image_unusable',
              publicResult: null,
              imageAssessment: unusableAssessment(row.images.length),
              modelCode: null,
              chargedPoints: 0
            }
          : {
              ...base,
              status: 'failed_no_charge',
              releaseReason: 'model_failed',
              publicResult: null,
              imageAssessment: null,
              modelCode: null,
              chargedPoints: 0
            }
    } else if (outcome.status === 'completed') {
      finalization = {
        ...base,
        status: 'completed',
        releaseReason: null,
        publicResult: outcome.result,
        imageAssessment: outcome.imageAssessment,
        modelCode: outcome.modelCode,
        chargedPoints: points.publicChargedPoints
      }
    } else if (outcome.status === 'released') {
      finalization = {
        ...base,
        status: 'released_no_charge',
        releaseReason: outcome.releaseReason,
        publicResult: null,
        imageAssessment: outcome.imageAssessment,
        modelCode: outcome.modelCode,
        chargedPoints: 0
      }
    } else {
      finalization = {
        ...base,
        status: 'failed_no_charge',
        releaseReason: outcome.failureReason,
        publicResult: null,
        imageAssessment: null,
        modelCode: null,
        chargedPoints: 0
      }
    }
    const recordSha256 = calculateVisualRecordSha256(row, finalization)
    const written = await deps.runTransaction(context =>
      deps.repository.finalizeSession(context, {
        visualDiagnosisRef,
        finalization: { ...finalization, recordSha256 }
      })
    )
    return written === 'finalized' ? 'finalized' : 'skipped'
  }
}
