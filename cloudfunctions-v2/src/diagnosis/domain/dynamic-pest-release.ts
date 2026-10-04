import {
  eligibleV1PestQuestions,
  type PestTierQuestionLimits
} from './pest-question-eligibility.js'
import Ajv from 'ajv'
import {
  calculateCanonicalJsonSha256,
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import { lockQuestionPackageSnapshot } from './question-package-snapshot.js'

/** 同一次创建锁定的动态题包正文，不包含未审核阈值。 */
export interface DynamicPestQuestionRelease {
  /** 题目、映射和已批准限题共同所属的精确发布引用。 */
  readonly releaseRef: string
  /** 发布正文摘要，供内部版本锁定和审计。 */
  readonly contentSha256: string
  /** 已审核V1题目素材，完整元数据仅供内部消费。 */
  readonly questions: readonly CanonicalJsonObject[]
  /** 已批准并随发布冻结的各档题数上限。 */
  readonly tierQuestionLimits: PestTierQuestionLimits
  /** 本发布审核的证据归一分组，不接受客户端映射。 */
  readonly evidenceGroupByKey: Readonly<Record<string, string>>
}
/** 缺发布时不返回内容，也不自动选择本地题目。 */
export type DynamicPestReleaseResolution =
  | {
      /** 发布范围、活动指针、内容和时效均通过。 */
      readonly status: 'available'
      /** 深度冻结的同一兼容发布。 */
      readonly release: DynamicPestQuestionRelease
    }
  | {
      /** 缺发布、非法或未生效的不同内部原因。 */
      readonly status: 'unavailable' | 'invalid' | 'not_effective'
    }
/** 明确使用已批准3/2/1/1/0规则，不允许自由添加阈值。 */
export const dynamicPestQuestionContentSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'contractVersion',
    'sourceRef',
    'sourceSha256',
    'questions',
    'tierQuestionLimits',
    'evidenceGroupByKey'
  ],
  properties: {
    contractVersion: { const: 'diagnosis-dynamic-pest-question-packages/v1' },
    sourceRef: { type: 'string', minLength: 1, pattern: '\\S' },
    sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    tierQuestionLimits: {
      type: 'object',
      additionalProperties: false,
      required: ['low', 'medium', 'high', 'very_likely', 'direct'],
      properties: {
        low: { const: 3 },
        medium: { const: 2 },
        high: { const: 1 },
        very_likely: { const: 1 },
        direct: { const: 0 }
      }
    },
    evidenceGroupByKey: {
      type: 'object',
      additionalProperties: { type: 'string', minLength: 1, pattern: '\\S' }
    },
    questions: {
      type: 'array',
      minItems: 1,
      maxItems: 14,
      items: {
        type: 'object',
        required: [
          'questionKey',
          'text',
          'options',
          'candidateModes',
          'requiredEvidenceKeys',
          'riskLevel',
          'riskNotice',
          'safetyInstructions',
          'requiresExplicitConsent',
          'skipOptionEnabled'
        ],
        properties: {
          questionKey: { type: 'string', minLength: 1 },
          text: { type: 'string', minLength: 1 },
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
    }
  }
} as const
const validate = new Ajv({ allErrors: true }).compile(dynamicPestQuestionContentSchema)
/** 深度冻结经过纯JSON拷贝的审核正文。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
}
/** UTC毫秒必须安全且不依赖数据库驱动的隐式数值截断。 */
function milliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= 8_640_000_000_000_000 ? n : null
}
/** 解析已读取发布，不访问文件、不激活候选、不生成默认版本。 */
export function resolveDynamicPestQuestionRelease(
  rows: readonly Record<string, unknown>[],
  capturedAtMs: number
): DynamicPestReleaseResolution {
  if (
    !Number.isSafeInteger(capturedAtMs) ||
    capturedAtMs < 0 ||
    capturedAtMs > 8_640_000_000_000_000
  ) {
    return { status: 'invalid' }
  }
  if (rows.length === 0) {
    return { status: 'unavailable' }
  }
  if (rows.length !== 1) {
    return { status: 'invalid' }
  }
  const r = rows[0]!
  if (
    r.domain_code !== 'diagnosis' ||
    r.policy_code !== 'dynamic_pest_question_packages' ||
    r.schema_version !== 'diagnosis-dynamic-pest-question-packages/v1' ||
    r.release_openid !== '' ||
    r.pointer_openid !== '' ||
    typeof r.release_ref !== 'string' ||
    !/^bpr_[A-Za-z0-9_-]{8,}$/u.test(r.release_ref) ||
    typeof r.release_version !== 'string' ||
    !/^[A-Za-z0-9._/-]{1,64}$/u.test(r.release_version) ||
    r.active_release_version !== r.release_version ||
    typeof r.content_sha256 !== 'string' ||
    r.active_content_sha256 !== r.content_sha256
  ) {
    return { status: 'invalid' }
  }
  const effective = milliseconds(r.effective_at_ms),
    verified = milliseconds(r.verified_at_ms),
    expires = r.expires_at_ms === null ? null : milliseconds(r.expires_at_ms)
  if (
    effective === null ||
    verified === null ||
    verified > effective ||
    (r.expires_at_ms !== null && (expires === null || expires <= effective))
  ) {
    return { status: 'invalid' }
  }
  if (r.status !== 'active' || (expires !== null && capturedAtMs >= expires)) {
    return { status: 'unavailable' }
  }
  if (capturedAtMs < effective) {
    return { status: 'not_effective' }
  }
  let content: unknown = r.policy_json
  try {
    if (typeof content === 'string') {
      content = JSON.parse(content)
    }
    if (
      !validate(content) ||
      calculateCanonicalJsonSha256(content as unknown as CanonicalJsonValue) !== r.content_sha256
    ) {
      return { status: 'invalid' }
    }
    const copied = JSON.parse(serializeCanonicalJson(content as unknown as CanonicalJsonValue)) as {
      /** 完整来源题目素材。 */
      questions: CanonicalJsonObject[]
      /** 已批准的完整限题策略。 */
      tierQuestionLimits: PestTierQuestionLimits
      /** 审核后的证据组关系。 */
      evidenceGroupByKey: Record<string, string>
    }
    eligibleV1PestQuestions({
      questions: copied.questions,
      candidateModes: [
        'spider_mite',
        'thrips',
        'whitefly',
        'aphid',
        'scale_insect',
        'mealybug',
        'leaf_miner',
        'fungus_gnat'
      ],
      lockedEvidenceKeys: [],
      lockedEvidenceGroups: [],
      directMatchedModes: [],
      evidenceGroupByKey: copied.evidenceGroupByKey
    })
    lockQuestionPackageSnapshot({
      questionPackageReleaseRef: r.release_ref,
      mode: 'specific_pest_visual',
      questionCount: copied.questions.length,
      packageQuestions: copied.questions
    })
    const release = {
      releaseRef: r.release_ref,
      contentSha256: r.content_sha256,
      questions: copied.questions,
      tierQuestionLimits: copied.tierQuestionLimits,
      evidenceGroupByKey: copied.evidenceGroupByKey
    }
    freeze(release as unknown as CanonicalJsonValue)
    return { status: 'available', release }
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError) {
      return { status: 'invalid' }
    }
    throw error
  }
}
