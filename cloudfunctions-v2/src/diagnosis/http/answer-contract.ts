import Ajv from 'ajv'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { DiagnosisAnswerSubmissionResult } from '../application/submit-diagnosis-answers.js'

/** 长期会话的公开答案请求；复合证据由已有领域合同进一步验证。 */
export interface DiagnosisAnswerRequestDto {
  /** 客户端选择的植物公开引用，必须由服务端再次核验归属。 */
  readonly userPlantRef: string
  /** 首次完整提交；首版不支持修改已记录的答案。 */
  readonly requestMode: 'answer_submit'
  /** 题目和选项必须属于持久化的服务端题包。 */
  readonly answers: readonly {
    /** 来自服务端题包的稳定题目代码。 */
    readonly questionKey: string;
    /** 该题目授权的选项代码。 */
    readonly optionKey: string
  }[]
  /** 原始空气输入，不能声明已经保存成功。 */
  readonly airEnvironmentByQuestionId?: Readonly<Record<string, unknown>>
  /** 与空气输入匹配的快照。 */
  readonly airEnvironmentSnapshotsByQuestionId?: Readonly<Record<string, unknown>>
  /** 明确发生日期的行为证据，不能直接产生care事实。 */
  readonly careBehaviorTimeline?: Readonly<Record<string, unknown>>
  /** V1复用内容的原字段拼写，双字段同时出现时须经领域等价校验。 */
  readonly care_behavior_timeline?: Readonly<Record<string, unknown>>
}
/** 会话响应在答案操作中的确认分支；不意味着诊断结果已生成。 */
export interface DiagnosisSessionAnswerResponseDto {
  /** 调用者本次访问的公开会话引用。 */
  readonly diagnosisSessionRef: string
  /** 完整答案已经记录；不公开数据库内部状态。 */
  readonly answersRecorded: true
}
const ajv = new Ajv({ allErrors: true })
/** 首版公开DTO严格禁止额外字段；题数由服务器快照决定，不设置猜测上限。 */
export const diagnosisAnswerRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['userPlantRef', 'requestMode', 'answers'],
  properties: {
    userPlantRef: { type: 'string', maxLength: 64, pattern: '^upl_[A-Za-z0-9_-]{8,}$' },
    requestMode: { const: 'answer_submit' },
    answers: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionKey', 'optionKey'],
        properties: {
          questionKey: { type: 'string', minLength: 1 },
          optionKey: { type: 'string', minLength: 1 }
        }
      }
    },
    airEnvironmentByQuestionId: { type: 'object' },
    airEnvironmentSnapshotsByQuestionId: { type: 'object' },
    careBehaviorTimeline: { type: 'object' },
    care_behavior_timeline: { type: 'object' }
  }
} as const
/** 成功确认的唯一公开字段。 */
export const diagnosisSessionAnswerResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['diagnosisSessionRef', 'answersRecorded'],
  properties: {
    diagnosisSessionRef: { type: 'string', minLength: 8, maxLength: 100 },
    answersRecorded: { const: true }
  }
} as const
export const validateDiagnosisAnswerRequest = ajv.compile<DiagnosisAnswerRequestDto>(
  diagnosisAnswerRequestSchema
)
export const validateDiagnosisSessionAnswerResponse =
  ajv.compile<DiagnosisSessionAnswerResponseDto>(diagnosisSessionAnswerResponseSchema)

/** 固定中文错误投影，不让Repository失败原因或原始证据进入公开响应。 */
export function projectDiagnosisAnswerResponse(
  ref: string,
  result: DiagnosisAnswerSubmissionResult
): HttpIdempotencyPublicResponseSnapshot {
  if (result.status === 'recorded' || result.status === 'replayed') {
    const data = { diagnosisSessionRef: ref, answersRecorded: true }
    if (!validateDiagnosisSessionAnswerResponse(data)) {
      throw new TypeError('诊断公开会话引用非法')
    }
    return { status: 200, body: { data } }
  }
  if (result.status === 'not_found') {
    return { status: 404, body: { error: { type: 'NOT_FOUND', message: '问诊会话不存在' } } }
  }
  if (result.status === 'conflict') {
    return {
      status: 409,
      body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: '已记录的答案不能覆盖' } }
    }
  }
  if (['missing_snapshot', 'invalid_snapshot'].includes(result.status)) {
    return {
      status: 503,
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用' } }
    }
  }
  return {
    status: 400,
    body: { error: { type: 'VALIDATION_FAILED', message: '答案或证据不合法' } }
  }
}
