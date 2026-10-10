import { createHash } from 'node:crypto'

import {
  projectVisualGenResult,
  type PublicVisualDiagnosisResult
} from '../domain/project-visual-gen-result.js'
import {
  evaluateVisualGenOutput,
  type SafetyGateContext,
  type SafetyRejectReason
} from '../domain/visual-gen-safety-gate.js'
import type { VisiblePart, VisualGenOutput } from '../domain/visual-gen-output.js'
import {
  ModelProviderError,
  callVisualModelWithFallback,
  type ModelAttempt,
  type VisualModelClient,
  type VisualModelRequest,
  type VisualModelUsage
} from '../provider/visual-model-registry.js'

/**
 * 视觉诊断生成编排（ClickUp z8v0kmvhnc）：调用模型 → 解析 → 安全门 → 投影公开结果。
 *
 * 通俗说明：像前端提交表单后的「校验 → 失败重试一次 → 仍失败就报错」流程。
 * - 安全门不通过时最多再调用一次（maxModelLoops 来自成本策略快照，待冻结，由调用方传入）；仍不通过则失败关闭；
 * - 非植物、图片不可用时直接释放（不扣点），只给脱敏图片评估；
 * - **不保存模型原文**：结果里只有原文 SHA-256、结构化公开结果、计量与尝试记录。
 * 额度预占、结算与持久化不在本函数内（属于接入层，3/4 票）。
 */

/** 编排输入。 */
export interface RunVisualGenerationInput {
  /** 策略发布给出的模型顺序（不得为空，否则失败关闭）。 */
  readonly modelOrder: readonly string[]
  /** 服务端拼装的模型请求。 */
  readonly request: VisualModelRequest
  /** 安全门上下文：可食用背景与病因编号闭集，由服务端提供。 */
  readonly context: SafetyGateContext
  /** 最多模型调用次数（含 1 次安全门重试），来自成本策略快照。 */
  readonly maxModelLoops: number
}

/** 单张图片的脱敏评估。 */
export interface PublicPerImageAssessment {
  /** 图片序号，从 1 开始，对应上传顺序。 */
  readonly imageIndex: number
  /** 这张图主要拍到的植物部位。 */
  readonly visiblePart: VisiblePart
  /** 这张图的质量档：良好、受限或不可用。 */
  readonly quality: 'good' | 'limited' | 'unusable'
  /** 图片质量问题列表（去重后），例如模糊、过曝。 */
  readonly qualityIssues: readonly string[]
}

/** 脱敏图片评估（diagnosis-visual-api/v1 ImageAssessment）。 */
export interface PublicImageAssessment {
  /** 总体判定：可评估、证据不足、非植物或图片不可用。 */
  readonly verdict: 'assessable' | 'insufficient_evidence' | 'not_plant' | 'image_unusable'
  /** 逐图脱敏评估列表。 */
  readonly perImage: readonly PublicPerImageAssessment[]
}

/** 编排的公共审计字段：只含原文摘要与计量，不含模型原文。 */
interface VisualGenerationAudit {
  /** 每次模型回包原文的 SHA-256，原文本身不保存。 */
  readonly rawTextSha256s: readonly string[]
  /** 每次成功调用的计量，按调用顺序排列。 */
  readonly usages: readonly VisualModelUsage[]
  /** 全部尝试记录，只含模型代码与结果类型。 */
  readonly attempts: readonly ModelAttempt[]
}

/** 编排成功：已得到可展示的公开结果。 */
export interface VisualGenerationCompleted extends VisualGenerationAudit {
  /** 状态：已完成，可以展示并结算。 */
  readonly status: 'completed'
  /** 投影后的公开结果 diagnosis-result/v2。 */
  readonly result: PublicVisualDiagnosisResult
  /** 脱敏图片评估，展示图片是否可用。 */
  readonly imageAssessment: PublicImageAssessment
  /** 最终成功的模型代码，供审计与计费。 */
  readonly modelCode: string
}

/** 编排释放：非植物或图片不可用，不扣点。 */
export interface VisualGenerationReleased extends VisualGenerationAudit {
  /** 状态：已释放，预占额度应退回。 */
  readonly status: 'released'
  /** 释放原因：非植物或图片不可用。 */
  readonly releaseReason: 'not_plant' | 'image_unusable'
  /** 脱敏图片评估，用于引导用户重拍。 */
  readonly imageAssessment: PublicImageAssessment
  /** 最终成功的模型代码，供审计与计费。 */
  readonly modelCode: string
}

/** 编排失败：模型不可用或安全门两次都不通过（失败关闭）。 */
export interface VisualGenerationFailed extends VisualGenerationAudit {
  /** 状态：失败关闭，不展示任何模型内容。 */
  readonly status: 'failed'
  /** 失败原因：模型调用失败或安全门拒绝。 */
  readonly failureReason: 'model_failed' | 'safety_gate_rejected'
  /** 最后一次安全门拒绝原因代码，模型失败时为空。 */
  readonly rejectReasons: readonly SafetyRejectReason[]
}

/** 编排结果；不含模型原文。 */
export type VisualGenerationOutcome =
  | VisualGenerationCompleted
  | VisualGenerationReleased
  | VisualGenerationFailed

/** 计算原文 SHA-256（原文本身随即丢弃）。 */
function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

/** 从模型分类归约脱敏图片评估。 */
function assessImages(output: VisualGenOutput): PublicImageAssessment {
  const c = output.classification
  const verdict =
    c.isPlant !== 'yes' || c.overallStatus === 'not_plant'
      ? 'not_plant'
      : c.usable === 'unusable'
        ? 'image_unusable'
        : c.overallStatus === 'insufficient_evidence'
          ? 'insufficient_evidence'
          : 'assessable'
  return {
    verdict,
    perImage: output.perImage.map(image => ({
      imageIndex: image.imageIndex,
      visiblePart: image.visiblePart,
      quality: image.quality,
      qualityIssues: [...new Set(c.qualityIssues)]
    }))
  }
}

/** 运行一次视觉诊断生成。 */
export async function runVisualGeneration(
  client: VisualModelClient,
  input: RunVisualGenerationInput
): Promise<VisualGenerationOutcome> {
  const rawTextSha256s: string[] = []
  const usages: VisualModelUsage[] = []
  const attempts: ModelAttempt[] = []
  let lastReasons: readonly SafetyRejectReason[] = []
  const loops = Math.max(1, Math.trunc(input.maxModelLoops))
  for (let loop = 1; loop <= loops; loop += 1) {
    let call
    try {
      call = await callVisualModelWithFallback(client, input.modelOrder, input.request)
    } catch (error) {
      if (error instanceof ModelProviderError) {
        return {
          status: 'failed',
          failureReason: 'model_failed',
          rejectReasons: [],
          rawTextSha256s,
          usages,
          attempts
        }
      }
      throw error
    }
    attempts.push(...call.attempts)
    usages.push(call.response.usage)
    rawTextSha256s.push(sha256(call.response.text))
    let parsed: unknown
    try {
      parsed = JSON.parse(call.response.text)
    } catch {
      parsed = undefined
    }
    const gate = evaluateVisualGenOutput(parsed, input.context)
    if (gate.status === 'reject') {
      lastReasons = gate.reasons
      continue
    }
    const imageAssessment = assessImages(gate.output)
    const modelCode = call.response.modelCode
    if (imageAssessment.verdict === 'not_plant' || imageAssessment.verdict === 'image_unusable') {
      return {
        status: 'released',
        releaseReason: imageAssessment.verdict,
        imageAssessment,
        rawTextSha256s,
        usages,
        attempts,
        modelCode
      }
    }
    return {
      status: 'completed',
      result: projectVisualGenResult(gate.output, { edibleContext: input.context.edibleContext }),
      imageAssessment,
      rawTextSha256s,
      usages,
      attempts,
      modelCode
    }
  }
  return {
    status: 'failed',
    failureReason: 'safety_gate_rejected',
    rejectReasons: lastReasons,
    rawTextSha256s,
    usages,
    attempts
  }
}
