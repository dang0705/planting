import {
  serializeCanonicalJson,
  type CanonicalJsonObject,
  type CanonicalJsonValue
} from '../../foundation/json/canonical-json-sha256.js'
import {
  lockQuestionPackageSnapshot,
  type LockedQuestionPackageSnapshot
} from './question-package-snapshot.js'

/** 用户授权复用的八类虫害，不由配置扩展其他入口。 */
const modes = [
  'spider_mite',
  'thrips',
  'whitefly',
  'aphid',
  'scale_insect',
  'mealybug',
  'leaf_miner',
  'fungus_gnat'
] as const
/** 已准入的服务端候选与归一证据，不采纳客户端题包。 */
export interface PestQuestionEligibilityInput {
  /** 受控发布中的完整素材，顺序属于内容。 */
  readonly questions: readonly CanonicalJsonObject[]
  /** 本轮候选虫害的服务端授权顺序。 */
  readonly candidateModes: readonly string[]
  /** 已确认的确切证据键，不从客户端采纳。 */
  readonly lockedEvidenceKeys: readonly string[]
  /** 已确认的证据组，用于避免重复采证。 */
  readonly lockedEvidenceGroups: readonly string[]
  /** 已准入直匹配候选，筛选不产生结论。 */
  readonly directMatchedModes: readonly string[]
  /** 受控上游的证据组关系，缺映射仅按确切键匹配。 */
  readonly evidenceGroupByKey: Readonly<Record<string, string>>
}
/** 已确认的题数档位，置信度如何分档属于另一受控策略。 */
export type PestQuestionTier = 'low' | 'medium' | 'high' | 'very_likely' | 'direct'
/** 全部档位显式传入，不提供运行默认值。 */
export interface PestTierQuestionLimits {
  /** 低可信最多提问数量，当前批准来源为3题。 */
  readonly low: number
  /** 中可信最多提问数量，当前批准来源为2题。 */
  readonly medium: number
  /** 高可信最多提问数量，当前批准来源为1题。 */
  readonly high: number
  /** 较可信最多提问数量，当前批准来源为1题。 */
  readonly very_likely: number
  /** 直判档最多提问数量为0，不授权自动直判。 */
  readonly direct: number
}
/** 空题包必须另由已准入用例处理，不表示病因确认。 */
export interface PestQuestionSelection {
  /** 只表达本次是否有题目需要回答。 */
  readonly status: 'questions_required' | 'no_questions'
  /** 所选题目与精确发布引用的不可变快照。 */
  readonly snapshot: LockedQuestionPackageSnapshot
}
/** 严格字符串数组，不强制转换非法值。 */
function strings(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.some(s => typeof s !== 'string' || s.length === 0 || s.trim() !== s)
  ) {
    throw new TypeError('虫害素材或证据列表非法')
  }
  return [...new Set(value)] as string[]
}
/** 冻结独立复制的素材树，防止异步调用改写。 */
function freeze(value: CanonicalJsonValue): void {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
}
/** 无数值策略的素材筛选；结果尚不能直接展示为用户题包。 */
export function eligibleV1PestQuestions(
  input: PestQuestionEligibilityInput
): readonly CanonicalJsonObject[] {
  const candidates = strings(input.candidateModes)
  if (candidates.some(m => !modes.includes(m as (typeof modes)[number]))) {
    throw new TypeError('虫害候选超出复用范围')
  }
  const keys = new Set(strings(input.lockedEvidenceKeys))
  const groups = new Set(strings(input.lockedEvidenceGroups))
  const direct = new Set(strings(input.directMatchedModes))
  if ([...direct].some(m => !candidates.includes(m))) {
    throw new TypeError('直匹配不属于本轮候选')
  }
  if (
    input.evidenceGroupByKey === null ||
    typeof input.evidenceGroupByKey !== 'object' ||
    Array.isArray(input.evidenceGroupByKey) ||
    Object.values(input.evidenceGroupByKey).some(g => typeof g !== 'string' || !g.trim())
  ) {
    throw new TypeError('证据组映射非法')
  }
  const group = (key: string) =>
    Object.hasOwn(input.evidenceGroupByKey, key) ? input.evidenceGroupByKey[key]! : key
  const copied = JSON.parse(
    serializeCanonicalJson(input.questions as unknown as CanonicalJsonValue)
  ) as CanonicalJsonObject[]
  if (!Array.isArray(copied)) {
    throw new TypeError('虫害素材非法')
  }
  const result: CanonicalJsonObject[] = []
  for (const question of copied) {
    if (question === null || typeof question !== 'object' || Array.isArray(question)) {
      throw new TypeError('虫害题目非法')
    }
    const declared = strings(question.candidateModes)
    const evidence = strings(question.requiredEvidenceKeys)
    if (declared.some(m => !modes.includes(m as (typeof modes)[number]))) {
      throw new TypeError('素材含未授权虫害')
    }
    const targets = declared.filter(m => candidates.includes(m))
    const auxiliary =
      candidates.length === 1 &&
      candidates[0] === 'whitefly' &&
      ['surface_residue', 'sooty_mold'].includes(String(question.packageTopic)) &&
      ['white_flies', 'fixed_oval_nymphs'].some(k => groups.has(group(k)))
    if (
      !targets.length ||
      declared.some(m => direct.has(m)) ||
      evidence.some(k => keys.has(k) || groups.has(group(k))) ||
      auxiliary
    ) {
      continue
    }
    if (!Array.isArray(question.options)) {
      throw new TypeError('素材选项非法')
    }
    const options = question.options.map(option => {
      if (option === null || typeof option !== 'object' || Array.isArray(option)) {
        throw new TypeError('素材选项非法')
      }
      return {
        ...option,
        mapsToModes: strings(option.mapsToModes).filter(m => targets.includes(m))
      }
    })
    result.push({ ...question, candidateModes: targets, targetSymptomKey: targets[0]!, options })
  }
  freeze(result)
  return result
}
/** 不解释置信度；优先覆盖不同候选，再按素材顺序补足显式上限。 */
export function selectV1PestQuestionSnapshot(
  input: PestQuestionEligibilityInput & {
    /** 受控上游的档位，不从浮点置信度猜测。 */
    readonly tier: PestQuestionTier
    /** 本轮已发布策略提供的完整题数上限。 */
    readonly limits: PestTierQuestionLimits
    /** 内容、选题及限题所属的兼容发布引用。 */
    readonly questionPackageReleaseRef: string
  }
): PestQuestionSelection {
  const tiers = ['low', 'medium', 'high', 'very_likely', 'direct'] as const
  if (
    !tiers.includes(input.tier) ||
    input.limits === null ||
    typeof input.limits !== 'object' ||
    Object.keys(input.limits).length !== tiers.length ||
    tiers.some(t => !Number.isSafeInteger(input.limits[t]) || input.limits[t] < 0)
  ) {
    throw new TypeError('虫害限题策略非法或缺失')
  }
  const eligible = eligibleV1PestQuestions(input)
  const limit = input.limits[input.tier]
  const chosen: CanonicalJsonObject[] = []
  const covered = new Set<string>()
  for (const mode of strings(input.candidateModes)) {
    if (chosen.length >= limit) {
      break
    }
    if (covered.has(mode)) {
      continue
    }
    const q = eligible.find(q => !chosen.includes(q) && strings(q.candidateModes).includes(mode))
    if (q) {
      chosen.push(q)
      strings(q.candidateModes).forEach(m => covered.add(m))
    }
  }
  for (const q of eligible) {
    if (chosen.length >= limit) {
      break
    }
    if (!chosen.includes(q)) {
      chosen.push(q)
    }
  }
  return {
    status: chosen.length ? 'questions_required' : 'no_questions',
    snapshot: lockQuestionPackageSnapshot({
      questionPackageReleaseRef: input.questionPackageReleaseRef,
      mode: 'specific_pest_visual',
      questionCount: chosen.length,
      packageQuestions: chosen
    })
  }
}
