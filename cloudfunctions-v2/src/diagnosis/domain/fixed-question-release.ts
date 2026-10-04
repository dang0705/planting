import Ajv from 'ajv'
import {
  calculateCanonicalJsonSha256,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import {
  lockQuestionPackageSnapshot,
  type LockedQuestionPackageSnapshot
} from './question-package-snapshot.js'

/** 本轮只承接两个固定入口；虫害仍由动态选题流程承接。 */
export type FixedQuestionMode = 'yellow_leaf' | 'wilting_droop'
/** 一次请求锁定的固定题包；不可用时不返回候选内容。 */
export type FixedQuestionReleaseResolution =
  | {
      /** 已通过发布行、活动指针、正文与时效校验。 */
      readonly status: 'available'
      /** 当前症状的完整只读快照。 */
      readonly snapshot: LockedQuestionPackageSnapshot
    }
  | {
      /** 缺发布、内容非法或尚未生效。 */
      readonly status: 'unavailable' | 'invalid' | 'not_effective'
    }
/** 发布正文的专属Schema；不允许万能策略键或正文伪造发布元数据。 */
export const fixedQuestionPackageContentSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['contractVersion', 'sourceRef', 'sourceSha256', 'packages'],
  properties: {
    contractVersion: { const: 'diagnosis-fixed-question-packages/v1' },
    sourceRef: { type: 'string', minLength: 1, pattern: '\\S' },
    sourceSha256: { type: 'string', pattern: '^[a-f0-9]{64}$' },
    packages: {
      type: 'object',
      additionalProperties: false,
      required: ['yellow_leaf', 'wilting_droop'],
      properties: {
        yellow_leaf: { type: 'array', minItems: 1, items: { type: 'object' } },
        wilting_droop: { type: 'array', minItems: 1, items: { type: 'object' } }
      }
    }
  }
} as const
const validate = new Ajv({ allErrors: true }).compile(fixedQuestionPackageContentSchema)
/** UTC毫秒必须安全且不依赖数据库驱动的隐式数值截断。 */
function milliseconds(value: unknown): number | null {
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]*)$/u.test(value)) {
    return null
  }
  const n = Number(value)
  return Number.isSafeInteger(n) && n <= 8_640_000_000_000_000 ? n : null
}
/** 解析已读取发布，不访问文件、不激活候选、不生成默认版本。 */
export function resolveFixedQuestionPackageRelease(
  rows: readonly Record<string, unknown>[],
  mode: FixedQuestionMode,
  capturedAtMs: number
): FixedQuestionReleaseResolution {
  if (
    !Number.isSafeInteger(capturedAtMs) ||
    capturedAtMs < 0 ||
    capturedAtMs > 8_640_000_000_000_000 ||
    !['yellow_leaf', 'wilting_droop'].includes(mode)
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
    r.policy_code !== 'fixed_question_packages' ||
    r.schema_version !== 'diagnosis-fixed-question-packages/v1' ||
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
    const value = content as { packages: Record<FixedQuestionMode, readonly unknown[]> }
    // 两个入口整体准入；不能让同一发布的另一组损坏内容被局部忽略。
    const snapshots = Object.fromEntries(
      (['yellow_leaf', 'wilting_droop'] as const).map(kind => [
        kind,
        lockQuestionPackageSnapshot({
          questionPackageReleaseRef: r.release_ref,
          mode: kind,
          questionCount: value.packages[kind].length,
          packageQuestions: value.packages[kind]
        })
      ])
    )
    return { status: 'available', snapshot: snapshots[mode]! }
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError || error instanceof RangeError) {
      return { status: 'invalid' }
    }
    throw error
  }
}
