import Ajv from 'ajv'
import type { PublicDiagnosisQuestion } from './create-session-contract.js'
import { diagnosisSessionCreationResponseSchema } from './create-session-contract.js'
import {
  lockQuestionPackageSnapshot,
  type LockedQuestionPackageSnapshot
} from '../domain/question-package-snapshot.js'
/** 显示和安全操作字段，内部评分与来源不可公开。 */
export interface PublicPestQuestion extends PublicDiagnosisQuestion {
  /** 该题原始操作风险级别，不根据模型猜测。 */
  readonly riskLevel: 'low' | 'medium' | 'high'
  /** 题包已有的用户可理解风险说明。 */
  readonly riskNotice: string
  /** 原始安全操作步骤，缺失不能公开。 */
  readonly safetyInstructions: readonly string[]
  /** 操作前是否必须由用户明确同意。 */
  readonly requiresExplicitConsent: boolean
  /** 不方便操作可以跳过，不默认代填答案。 */
  readonly skipOptionEnabled: true
}
/** 不含会话和发布元数据的作答题包。 */
export interface PublicPestQuestionPackage {
  /** 当前只允许V1虫害动态题目入口。 */
  readonly mode: 'specific_pest_visual'
  /** 本次实际显示题数，与数组一致。 */
  readonly questionCount: number
  /** 保留必要风险说明的公开题目白名单。 */
  readonly questions: readonly PublicPestQuestion[]
}
const base =
  diagnosisSessionCreationResponseSchema.properties.questionPackage.properties.questions.items
export const publicPestQuestionSchema = {
  ...base,
  required: [
    ...base.required,
    'riskLevel',
    'riskNotice',
    'safetyInstructions',
    'requiresExplicitConsent',
    'skipOptionEnabled'
  ],
  properties: {
    ...base.properties,
    riskLevel: { enum: ['low', 'medium', 'high'] },
    riskNotice: { type: 'string', minLength: 1, pattern: '\\S' },
    safetyInstructions: {
      type: 'array',
      minItems: 1,
      items: { type: 'string', minLength: 1, pattern: '\\S' }
    },
    requiresExplicitConsent: { type: 'boolean' },
    skipOptionEnabled: { const: true }
  }
}
const validate = new Ajv({ allErrors: true }).compile<PublicPestQuestion>(publicPestQuestionSchema)
/** 原快照必须完整且摘要一致；缺安全字段不能返回半题包。 */
export function projectPestQuestionPackage(
  locked: LockedQuestionPackageSnapshot
): PublicPestQuestionPackage {
  const snapshot = locked.snapshot
  if (
    snapshot.mode !== 'specific_pest_visual' ||
    snapshot.questionCount === 0 ||
    lockQuestionPackageSnapshot(snapshot).snapshotSha256 !== locked.snapshotSha256
  ) {
    throw new TypeError('虫害公开题包非法')
  }
  const questions = snapshot.packageQuestions.map(q => {
    if (!Array.isArray(q.options)) {
      throw new TypeError('虫害公开选项非法')
    }
    const value = {
      questionKey: q.questionKey,
      text: q.text,
      inputKind: 'choice',
      options: q.options.map(o => {
        if (o === null || typeof o !== 'object' || Array.isArray(o)) {
          throw new TypeError('虫害公开选项非法')
        }
        return {
          optionKey: o.optionKey,
          text: o.text,
          ...(typeof o.description === 'string' && o.description.trim()
            ? { description: o.description }
            : {})
        }
      }),
      ...(typeof q.helpText === 'string' && q.helpText.trim() ? { helpText: q.helpText } : {}),
      ...(typeof q.whyThisQuestion === 'string' && q.whyThisQuestion.trim()
        ? { whyThisQuestion: q.whyThisQuestion }
        : {}),
      riskLevel: q.riskLevel,
      riskNotice: q.riskNotice,
      safetyInstructions: q.safetyInstructions,
      requiresExplicitConsent: q.requiresExplicitConsent,
      skipOptionEnabled: q.skipOptionEnabled
    }
    if (!validate(value)) {
      throw new TypeError('虫害公开安全提示缺失或非法')
    }
    return value
  })
  return { mode: 'specific_pest_visual', questionCount: questions.length, questions }
}
