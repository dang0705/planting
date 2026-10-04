import Ajv from 'ajv'
import {
  createDiagnosisSessionRequestSchema,
  diagnosisSessionCreationResponseSchema,
  type CreateDiagnosisSessionRequestDto,
  type DiagnosisSessionCreationResponseDto
} from './create-session-contract.js'
import {
  projectPestQuestionPackage,
  publicPestQuestionSchema,
  type PublicPestQuestion
} from './pest-question-public-projection.js'
import type { PestQuestionSessionCreation } from '../application/create-pest-question-session.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../foundation/idempotency/http-idempotency.js'

/** 虫害公开命令只引用已归属植物的私有资产，可信结果由服务端提供。 */
export interface CreatePestDiagnosisSessionRequestDto {
  /** 用户选择的长期植物。 */ readonly userPlantRef: string
  /** 复用既有V1虫害入口名。 */ readonly mode: 'specific_pest_visual'
  /** 既有资产表公开引用，不采纳文件地址或内容摘要。 */ readonly assetRef: string
}
/** 固定症状与虫害使用同一HTTP入口，字段边界分别校验。 */
export type PublicDiagnosisCreationRequest =
  | CreateDiagnosisSessionRequestDto
  | CreatePestDiagnosisSessionRequestDto
/** 成功只表示创建了可答题包，不表示确诊或产生养护行为。 */
export interface PestDiagnosisSessionCreationResponseDto {
  /** 新生成的公开会话引用。 */ readonly diagnosisSessionRef: string
  /** 保持请求入口名。 */ readonly mode: 'specific_pest_visual'
  /** 所选题目的显示和安全字段。 */ readonly questionPackage: {
    /** 与题目数组数量一致。 */ readonly questionCount: number
    /** 风险、同意与跳过字段不能省略。 */ readonly questions: readonly PublicPestQuestion[]
  }
}
/** 两种成功分支都不含发布、资产或模型原文。 */
export type PublicDiagnosisCreationResponse =
  | DiagnosisSessionCreationResponseDto
  | PestDiagnosisSessionCreationResponseDto
/** 资产长度沿用SQL VARCHAR(64)，不是运营阈值。 */
const assetRefSchema = { type: 'string', minLength: 1, maxLength: 64, pattern: '\\S' } as const
/** 用条件必填/禁用约束保持固定症状形状，并限制虫害字段。 */
export const publicDiagnosisCreationRequestSchema = {
  ...createDiagnosisSessionRequestSchema,
  properties: {
    ...createDiagnosisSessionRequestSchema.properties,
    mode: { enum: ['yellow_leaf', 'wilting_droop', 'specific_pest_visual'] },
    assetRef: assetRefSchema
  },
  allOf: [
    {
      if: { properties: { mode: { const: 'specific_pest_visual' } } },
      then: { required: ['assetRef'] },
      else: { not: { required: ['assetRef'] } }
    }
  ]
} as const
/** 虫害响应只替换模式与题目Schema，固定响应不放宽。 */
export const pestDiagnosisCreationResponseSchema = {
  ...diagnosisSessionCreationResponseSchema,
  properties: {
    ...diagnosisSessionCreationResponseSchema.properties,
    mode: { const: 'specific_pest_visual' },
    questionPackage: {
      ...diagnosisSessionCreationResponseSchema.properties.questionPackage,
      properties: {
        ...diagnosisSessionCreationResponseSchema.properties.questionPackage.properties,
        questions: { type: 'array', minItems: 1, items: publicPestQuestionSchema }
      }
    }
  }
} as const
/** 保留原固定症状Schema，不让安全字段缺失的虫害退化为固定题目。 */
export const publicDiagnosisCreationResponseSchema = {
  oneOf: [diagnosisSessionCreationResponseSchema, pestDiagnosisCreationResponseSchema]
} as const
const ajv = new Ajv({ allErrors: true })
export const validatePublicDiagnosisCreationRequest = ajv.compile<PublicDiagnosisCreationRequest>(
  publicDiagnosisCreationRequestSchema
)
const validateResponse = ajv.compile<PublicDiagnosisCreationResponse>(
  publicDiagnosisCreationResponseSchema
)
/** 数组计数是一条跨字段硬规则，JSON Schema之外显式验证。 */
export function validatePublicDiagnosisCreationResponse(
  value: unknown
): value is PublicDiagnosisCreationResponse {
  return (
    validateResponse(value) &&
    value.questionPackage.questionCount === value.questionPackage.questions.length
  )
}
/** 零题/缺准入时不构造会话或诊断结论；公开适配器固定映射为503。 */
export function projectPestDiagnosisCreationResponse(
  result: PestQuestionSessionCreation
): HttpIdempotencyPublicResponseSnapshot {
  if (result.status === 'not_found') {
    return { status: 404, body: { error: { type: 'NOT_FOUND', message: '用户植物不存在' } } }
  }
  if (result.status === 'unavailable' || result.status === 'no_questions') {
    return {
      status: 503,
      body: { error: { type: 'SERVICE_UNAVAILABLE', message: '题包或诊断结果暂时不可用' } }
    }
  }
  if (result.status !== 'created') {
    throw new TypeError('虫害会话创建结果非法')
  }
  const pack = projectPestQuestionPackage(result.snapshot)
  const data = {
    diagnosisSessionRef: result.diagnosisRef,
    mode: pack.mode,
    questionPackage: { questionCount: pack.questionCount, questions: pack.questions }
  }
  if (!validatePublicDiagnosisCreationResponse(data)) {
    throw new TypeError('虫害会话公开响应不符合合同')
  }
  return { status: 200, body: { data } as unknown as HttpIdempotencyPublicResponseSnapshot['body'] }
}
