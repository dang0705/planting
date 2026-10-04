import type { CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'
import type { LockedQuestionPackageSnapshot } from './question-package-snapshot.js'
import type { DiagnosisModelBinding } from './diagnosis-model-binding.js'
/** 精确来源修订与当前知识条目的审核用途；不是来源真实性凭据。 */
export interface ReplaySourceClaim {
  /** 资料来源稳定代码。 */ readonly sourceCode: string
  /** 来源内主张代码。 */ readonly claimCode: string
  /** 不可覆盖的精确修订号。 */ readonly revisionNo: number
  /** 该主张在本条判断中的用途。 */ readonly linkRole: 'support' | 'oppose' | 'limit' | 'safety'
}
/** 来自对应领域读取器的结构化证据；内容及Schema仍由该领域负责核验。 */
export interface ReplayEvidence {
  /** 本快照内唯一证据引用。 */ readonly evidenceRef: string
  /** 输入来源类别，与公开图片展示的image标签分开。 */ readonly kind:
    | 'answer'
    | 'visual'
    | 'care_fact'
    | 'environment'
  /** 所属证据合同版本，不从正文猜测。 */ readonly schemaVersion: string
  /** 事实发生或采集时刻，UTC毫秒。 */ readonly occurredAtMs: number
  /** 原样结构化内容，不允许原始提示词或凭证。 */ readonly content: CanonicalJsonObject
  /** 内容的规范化SHA-256。 */ readonly contentSha256: string
}
/** 按本次读取时刻锁定的输入，不跟随当前环境或最新回答变化。 */
export interface DiagnosisReplayInput {
  /** 当前输入结构常量。 */ readonly contractVersion: 'diagnosis-replay-input/v1'
  /** 已确认内部身份或未知，未知不得伪造。 */ readonly plantIdentityRef: string | null
  /** 快照采集时刻，UTC毫秒。 */ readonly capturedAtMs: number
  /** 本次确实消费的证据；引用唯一。 */ readonly evidences: readonly ReplayEvidence[]
}
/** 门的结果，未知不能当作通过。 */
export type ReplayGateResult = 'pass' | 'block' | 'insufficient_evidence'
/** 行动必须逐门审阅，结构一致并不证明判断正确。 */
export interface ReplayActionGates {
  /** 植物、部位和条件适用性。 */ readonly applicability: ReplayGateResult
  /** 当前证据满足条件。 */ readonly evidence: ReplayGateResult
  /** 当前禁忌是否已排除。 */ readonly contraindications: ReplayGateResult
  /** 风险及安全依据是否充分。 */ readonly risk: ReplayGateResult
}
/** 当次结论的选中、备选和排除轨迹。 */
export interface ReplayOutcome {
  /** 已发布结论代码。 */ readonly outcomeCode: string
  /** 已发布园艺原因代码，不是症状入口。 */ readonly causeCode: string
  /** 结论在当次判断中的选中、备选或排除决定。 */ readonly disposition: 'selected' | 'alternative' | 'excluded'
  /** 解释本次为何选中或排除结论的中文证据理由。 */ readonly reasonZh: string
  /** 指向输入快照中的实际证据。 */ readonly evidenceRefs: readonly string[]
  /** 精确来源主张及用途。 */ readonly sourceClaimRefs: readonly ReplaySourceClaim[]
}
/** 行动建议或暂缓的轨迹；不是养护事实。 */
export interface ReplayAction {
  /** 已发布行动代码。 */ readonly actionCode: string
  /** 已发布结论—行动映射代码。 */ readonly mappingCode: string
  /** 当前轨迹内结论引用。 */ readonly outcomeCode: string
  /** 该行动在本次判断中进入公开建议或被安全门暂缓。 */ readonly disposition: 'proposed' | 'withheld'
  /** 选择或暂停的中文理由。 */ readonly reasonZh: string
  /** 指向当次输入的证据。 */ readonly evidenceRefs: readonly string[]
  /** 该行动及映射实际引用的资料来源和精确主张修订。 */ readonly sourceClaimRefs: readonly ReplaySourceClaim[]
  /** 四个安全门的当次决定。 */ readonly gates: ReplayActionGates
  /** 建议在公开数组的位置；暂缓为null。 */ readonly publicActionIndex: number | null
}
/** 与公开结果对应的档位和理由。 */
export interface ReplayAssessmentValue<T extends string> {
  /** 不使用模型百分比。 */ readonly value: T
  /** 本次判断的中文理由。 */ readonly reasonZh: string
}
/** 当次完整决策轨迹；这里只约束结构，不运行园艺推理。 */
export interface DiagnosisDecisionTrace {
  /** 当前轨迹结构常量。 */ readonly contractVersion: 'diagnosis-decision-trace/v1'
  /** 原样结论处理轨迹。 */ readonly outcomes: readonly ReplayOutcome[]
  /** 原样行动处理轨迹。 */ readonly actions: readonly ReplayAction[]
  /** 严重、紧急、隔离和确定性分别记录。 */ readonly assessment: {
    /** 确定性及证据理由。 */ readonly certainty: ReplayAssessmentValue<
      'likely' | 'possible' | 'unconfirmed'
    >
    /** 受损程度及理由。 */ readonly severity: ReplayAssessmentValue<
      'low' | 'medium' | 'high' | 'unknown'
    >
    /** 紧急程度及理由。 */ readonly urgency: ReplayAssessmentValue<
      'immediate' | 'soon' | 'monitor' | 'unknown'
    >
    /** 隔离决定及理由。 */ readonly isolation: ReplayAssessmentValue<
      'required' | 'not_required' | 'undetermined'
    >
  }
}
/** 该次兼容版本组与输入、轨迹，供内部历史回放。 */
export interface DiagnosisReplayRecord {
  /** 已审核不可变知识发布引用。 */ readonly knowledgeReleaseRef: string
  /** 完整知识包摘要。 */ readonly knowledgePackageSha256: string
  /** 该次完整题包和摘要。 */ readonly questionPackage: LockedQuestionPackageSnapshot
  /** 计算当时已锁定的植物身份、证据正文及采集时间快照。 */ readonly inputSnapshot: DiagnosisReplayInput
  /** 计算当时的结论选择、行动安全门及公开档位决定轨迹。 */ readonly decisionTrace: DiagnosisDecisionTrace
  /** 当次规则发布引用。 */ readonly ruleReleaseRef: string
  /** 当次规则发布摘要。 */ readonly ruleReleaseSha256: string
  /** 纯规则流程为null；模型流程锁定精确组合。 */ readonly modelBinding: DiagnosisModelBinding | null
}
