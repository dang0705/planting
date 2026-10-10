import agentAllowlist from '../../../../docs/backend-v2/contracts/diagnosis-visual-gen-agent-allowlist.v1.json'
import {
  MalformedVisualGenOutputError,
  parseVisualGenOutput,
  type EdibleContext,
  type GenImmediateAction,
  type GenOngoingCare,
  type VisualGenOutput
} from './visual-gen-output.js'

/**
 * 视觉诊断服务端安全门（合同 C2、diagnosis-result/v2、ClickUp z8v0kmvhnc）。
 *
 * 通俗说明：模型给出的内容像用户提交的表单，必须过一遍服务端校验才能展示。这里检查：
 * 1. 结构是否合法（不合法整份拒绝）；
 * 2. 病因编号必须在固定前缀的 50 个编号闭集内；
 * 3. 用药步骤不得出现剂量与浓度，也不得写具体间隔或次数（D15）；
 * 4. 药剂名先规范化（去括号、别名）再对照允许名单，名单外直接拒绝；通过的药剂名统一改写成名单规范名；
 * 5. 证据不足或非植物时不得给候选或立即处理；
 * 6. 结论与把握说明不得出现百分比或概率。
 * 通过后由服务端补写两项用药提示（按产品标签；可食用或未知时补安全间隔期），模型不负责这两句。
 */

/** 安全门上下文：由服务端提供，不来自模型。 */
export interface SafetyGateContext {
  /** 服务端背景中的可食用性；临时案例通常为 unknown。 */
  readonly edibleContext: EdibleContext
  /** 当前提示词版本的病因编号闭集。 */
  readonly causeCatalog: readonly string[]
}

/** 拒绝原因代码。 */
export type SafetyRejectReason =
  | 'malformed_output'
  | 'cause_code_not_in_catalog'
  | 'dose_in_step'
  | 'specific_interval_or_count'
  | 'agent_not_allowed'
  | 'conclusion_without_evidence'
  | 'numeric_certainty'

/** 安全门结果。 */
export type SafetyGateResult = SafetyGatePass | SafetyGateReject

/** 安全门通过。 */
export interface SafetyGatePass {
  /** 状态：通过，可以投影为公开结果。 */
  readonly status: 'pass'
  /** 已规范化药剂名并补写用药提示的结构化输出。 */
  readonly output: VisualGenOutput
}

/** 安全门拒绝。 */
export interface SafetyGateReject {
  /** 状态：拒绝，本次模型输出不得展示。 */
  readonly status: 'reject'
  /** 全部命中的拒绝原因代码（去重）。 */
  readonly reasons: readonly SafetyRejectReason[]
}

/** 剂量与浓度。 */
const dosePattern =
  /稀释\s*[0-9０-９]|兑水\s*[0-9０-９]|[0-9０-９]+(\.[0-9]+)?\s*(倍|%|％|ppm|毫升|ml|mL|ML|克|g|升|L\b)|每升/u
/** 具体间隔或次数。 */
const intervalPattern =
  /[0-9０-９]+\s*次|每隔?\s*[0-9０-９]+\s*[天日周]|间隔\s*[0-9０-９]|[0-9０-９]+\s*[～~\-–]\s*[0-9０-９]+\s*[天日周]|[0-9０-９]+\s*[天日周]后/u
/** 数值化把握。 */
const numericCertaintyPattern = /[%％]|百分之|概率|置信度约/u
/** 不允许给出结论的总体状态。 */
const statusesWithoutConclusion = new Set(['insufficient_evidence', 'not_plant'])

/** 药剂名规范化：去掉括号及内容与空白，小写。 */
function normalizeAgentName(name: string): string {
  return name
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/\s+/gu, '')
    .toLowerCase()
}

/** 规范化名 → 名单规范名。 */
const canonicalAgentByNormalized: ReadonlyMap<string, string> = new Map(
  agentAllowlist.agents.flatMap(agent =>
    [agent.nameZh, ...((agent as { aliases?: string[] }).aliases ?? [])].map(
      name => [normalizeAgentName(name), agent.nameZh] as const
    )
  )
)

/** 把药剂名改写为名单规范名；名单外返回 undefined。 */
function canonicalAgent(name: string): string | undefined {
  return canonicalAgentByNormalized.get(normalizeAgentName(name))
}

/** 给含药剂的步骤补写两项用药提示。 */
function withServerNotices<T extends GenImmediateAction | GenOngoingCare>(
  step: T,
  edible: EdibleContext
): T {
  if (step.agentNames.length === 0) {
    return step
  }
  return {
    ...step,
    labelDosageNotice: true,
    ...(edible !== 'no' ? { edibleSafetyIntervalNotice: true as const } : {})
  }
}

/** 解析并检查模型输出；通过时返回已规范化、已补写提示的结构化结果。 */
export function evaluateVisualGenOutput(
  value: unknown,
  context: SafetyGateContext
): SafetyGateResult {
  let output: VisualGenOutput
  try {
    output = parseVisualGenOutput(value)
  } catch (error) {
    if (error instanceof MalformedVisualGenOutputError) {
      return { status: 'reject', reasons: ['malformed_output'] }
    }
    throw error
  }
  const reasons = new Set<SafetyRejectReason>()
  const catalog = new Set(context.causeCatalog)
  const codes = [
    ...output.classification.candidates.map(candidate => candidate.causeCode),
    ...output.alternatives.map(alternative => alternative.causeCode)
  ]
  if (codes.some(code => !catalog.has(code))) {
    reasons.add('cause_code_not_in_catalog')
  }
  const steps: readonly (GenImmediateAction | GenOngoingCare)[] = [
    ...output.immediateActions,
    ...output.ongoingCare
  ]
  for (const step of steps) {
    if (step.agentNames.length > 0) {
      if (dosePattern.test(step.detailZh)) {
        reasons.add('dose_in_step')
      }
      if (intervalPattern.test(step.detailZh)) {
        reasons.add('specific_interval_or_count')
      }
    }
    if (step.agentNames.some(name => canonicalAgent(name) === undefined)) {
      reasons.add('agent_not_allowed')
    }
  }
  if (
    statusesWithoutConclusion.has(output.classification.overallStatus) &&
    (output.classification.candidates.length > 0 || output.immediateActions.length > 0)
  ) {
    reasons.add('conclusion_without_evidence')
  }
  if (
    [output.titleZh, output.summaryZh, output.diagnosisTable.certaintyReasonZh].some(field =>
      numericCertaintyPattern.test(field)
    )
  ) {
    reasons.add('numeric_certainty')
  }
  if (reasons.size > 0) {
    return { status: 'reject', reasons: [...reasons] }
  }
  const canonicalize = <T extends GenImmediateAction | GenOngoingCare>(step: T): T =>
    withServerNotices(
      { ...step, agentNames: step.agentNames.map(name => canonicalAgent(name) ?? name) },
      context.edibleContext
    )
  return {
    status: 'pass',
    output: {
      ...output,
      immediateActions: output.immediateActions.map(canonicalize),
      ongoingCare: output.ongoingCare.map(canonicalize)
    }
  }
}
