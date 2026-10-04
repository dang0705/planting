import Ajv from 'ajv'
import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'
import type { FixedQuestionSessionCreation } from '../application/create-fixed-question-session.js'

/** 首版创建固定症状会话；虫害动态题包使用独立的选题流程。 */
export interface CreateDiagnosisSessionRequestDto {
  /** 用户选定的植物；事务内再次核验实际归属。 */
  readonly userPlantRef: string
  /** 本阶段只复用V1的黄叶和萎蔫固定题目。 */
  readonly mode: 'yellow_leaf' | 'wilting_droop'
}
/** 选项只公开显示和作答所需信息。 */
export interface PublicDiagnosisOption {
  /** 服务端题包内的稳定选项代码。 */
  readonly optionKey: string
  /** V1原始显示文案。 */
  readonly text: string
  /** 可选的用户理解说明。 */
  readonly description?: string
}
/** 内部路由、病因和权重均不属于公开题目。 */
export interface PublicDiagnosisQuestion {
  /** 提交答案使用的题目代码。 */
  readonly questionKey: string
  /** V1原始问题文案。 */
  readonly text: string
  /** 明确作答方式，不要求客户端解析内部元数据。 */
  readonly inputKind: 'choice' | 'care_behavior_timeline' | 'air_environment'
  /** 保持已发布内容的选项顺序。 */
  readonly options: readonly PublicDiagnosisOption[]
  /** 原题目提供的可选操作帮助，不补造缺失文案。 */
  readonly helpText?: string
  /** 原题目提供的可选提问原因，不公开内部病因映射。 */
  readonly whyThisQuestion?: string
}
/** 首次响应锁定本次题目；重放不读取当前活动发布。 */
export interface DiagnosisSessionCreationResponseDto {
  /** 服务器生成的公开会话引用。 */
  readonly diagnosisSessionRef: string
  /** 当前固定症状入口。 */
  readonly mode: 'yellow_leaf' | 'wilting_droop'
  /** 本次实际题包；不公开发布引用与摘要。 */
  readonly questionPackage: {
    /** 与题目数组一致，不采用固定默认题数。 */
    readonly questionCount: number
    /** 经过白名单投影的题目。 */
    readonly questions: readonly PublicDiagnosisQuestion[]
  }
}
const textSchema = { type: 'string', minLength: 1 } as const
/** 非法或额外的客户端字段直接拒绝。 */
export const createDiagnosisSessionRequestSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['userPlantRef', 'mode'],
  properties: {
    userPlantRef: { type: 'string', maxLength: 64, pattern: '^upl_[A-Za-z0-9_-]{8,}$' },
    mode: { enum: ['yellow_leaf', 'wilting_droop'] }
  }
} as const
/** 响应每一层均限制额外字段，避免直接传播完整内部快照。 */
export const diagnosisSessionCreationResponseSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['diagnosisSessionRef', 'mode', 'questionPackage'],
  properties: {
    diagnosisSessionRef: { type: 'string', minLength: 8, maxLength: 100 },
    mode: { enum: ['yellow_leaf', 'wilting_droop'] },
    questionPackage: {
      type: 'object',
      additionalProperties: false,
      required: ['questionCount', 'questions'],
      properties: {
        questionCount: { type: 'integer', minimum: 1 },
        questions: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['questionKey', 'text', 'inputKind', 'options'],
            properties: {
              questionKey: textSchema,
              text: textSchema,
              inputKind: { enum: ['choice', 'care_behavior_timeline', 'air_environment'] },
              helpText: textSchema,
              whyThisQuestion: textSchema,
              options: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['optionKey', 'text'],
                  properties: { optionKey: textSchema, text: textSchema, description: textSchema }
                }
              }
            }
          }
        }
      }
    }
  }
} as const
const ajv = new Ajv({ allErrors: true })
export const validateCreateDiagnosisSessionRequest = ajv.compile<CreateDiagnosisSessionRequestDto>(
  createDiagnosisSessionRequestSchema
)
export const validateDiagnosisSessionCreationResponse =
  ajv.compile<DiagnosisSessionCreationResponseDto>(diagnosisSessionCreationResponseSchema)

/** 显示内容必须来自题包，不填入猜测或空白文案。 */
function displayText(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new TypeError('题包显示内容缺失')
  }
  return value
}
/** 只保留已存在的非空显示说明。 */
function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined
}
/** 内部原文完整保留；公开对象逐字段重新构造。 */
function projectQuestion(question: CanonicalJsonObject): PublicDiagnosisQuestion {
  const helpText = optionalText(question.helpText)
  const whyThisQuestion = optionalText(question.whyThisQuestion)
  if (!Array.isArray(question.options)) {
    throw new TypeError('题包选项缺失')
  }
  return {
    questionKey: displayText(question.questionKey),
    text: displayText(question.text),
    inputKind:
      question.uiVariant === 'care_behavior_timeline'
        ? 'care_behavior_timeline'
        : question.uiVariant === 'air_environment'
          ? 'air_environment'
          : 'choice',
    options: question.options.map(option => {
      if (option === null || typeof option !== 'object' || Array.isArray(option)) {
        throw new TypeError('题包选项非法')
      }
      const description = optionalText(option.description)
      return {
        optionKey: displayText(option.optionKey),
        text: displayText(option.text),
        ...(description === undefined ? {} : { description })
      }
    }),
    ...(helpText === undefined ? {} : { helpText }),
    ...(whyThisQuestion === undefined ? {} : { whyThisQuestion })
  }
}
/** 缺显示内容抛错并回滚创建事务；不能把半题包作为成功记录。 */
export function projectDiagnosisCreationResponse(
  result: FixedQuestionSessionCreation
): HttpIdempotencyPublicResponseSnapshot {
  if (result.status === 'not_found') {
    return { status: 404, body: { error: { type: 'NOT_FOUND', message: '用户植物不存在' } } }
  }
  if (result.status === 'unavailable') {
    return {
      status: 503,
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '题包暂时不可用' } }
    }
  }
  if (result.status !== 'created') {
    throw new TypeError('会话创建结果非法')
  }
  const snapshot = result.snapshot.snapshot
  const data = {
    diagnosisSessionRef: result.diagnosisRef,
    mode: snapshot.mode,
    questionPackage: {
      questionCount: snapshot.questionCount,
      questions: snapshot.packageQuestions.map(projectQuestion)
    }
  }
  if (
    data.questionPackage.questionCount !== data.questionPackage.questions.length ||
    !validateDiagnosisSessionCreationResponse(data)
  ) {
    throw new TypeError('公开题包不符合合同')
  }
  return { status: 200, body: { data } }
}
