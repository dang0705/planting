/**
 * 视觉诊断生成式模型输出（diagnosis-visual-gen-output/v1，提示词 v1.3 草案【7】）的类型与结构解析。
 *
 * 通俗说明：模型回包是一段 JSON 文本，这里像前端用 zod 解析接口返回一样，先把它变成有类型的对象；
 * 字段缺失、类型不对或出现未知枚举都算「格式错误」，交给安全门整份拒绝。这里只做结构解析，不做安全规则判断。
 */

/** 图片部位枚举。 */
export const VISIBLE_PARTS = [
  'whole_plant',
  'leaf_front',
  'leaf_back',
  'leaf_edge',
  'petiole',
  'stem',
  'stem_base',
  'flower',
  'fruit',
  'soil_surface',
  'root',
  'root_crown',
  'unknown'
] as const
/** 图片质量原因枚举。 */
export const QUALITY_ISSUES = [
  'blur',
  'overexposed',
  'underexposed',
  'too_far',
  'occluded',
  'glare',
  'compression',
  'not_plant'
] as const
/** 总体状态枚举。 */
export const OVERALL_STATUSES = [
  'problem_found',
  'multiple_problems',
  'no_obvious_problem',
  'insufficient_evidence',
  'not_plant'
] as const

/** 图片部位。 */
export type VisiblePart = (typeof VISIBLE_PARTS)[number]
/** 图片质量原因。 */
export type QualityIssue = (typeof QUALITY_ISSUES)[number]
/** 总体状态。 */
export type OverallStatus = (typeof OVERALL_STATUSES)[number]
/** 可食用背景。 */
export type EdibleContext = 'yes' | 'no' | 'unknown'

/** 候选病因。 */
export interface GenCandidate {
  /** 候选排名，从 1 开始，越小越可能。 */
  readonly rank: number
  /** 固定前缀闭集内的病因编号，仅内部使用、不外露。 */
  readonly causeCode: string
  /** 把握档：较可能、有可能或无法确认，禁止数值化。 */
  readonly certaintyBand: 'likely' | 'possible' | 'unconfirmed'
  /** 图中看到的直接证据标记键，仅内部使用、不外露。 */
  readonly directMarkerKeys: readonly string[]
}

/** 处置步骤（立即处理）。 */
export interface GenImmediateAction {
  /** 步骤序号，从 1 开始按执行顺序排列。 */
  readonly stepNo: number
  /** 步骤标题，面向用户的简短中文。 */
  readonly titleZh: string
  /** 步骤正文；含药剂时不得写剂量、具体间隔或次数。 */
  readonly detailZh: string
  /** 该步骤针对的病因编号列表，仅内部使用。 */
  readonly causeCodes: readonly string[]
  /** 步骤风险等级：低、中、高三档。 */
  readonly riskLevel: 'low' | 'medium' | 'high'
  /** 风险理由（风险等级不是 low 时应给出）。 */
  readonly riskReasonZh?: string
  /** 涉及的药剂名；安全门会规范化为允许名单规范名。 */
  readonly agentNames: readonly string[]
  /** 服务端补写：提示按产品标签用量与间隔使用。 */
  readonly labelDosageNotice?: true
  /** 服务端补写：可食用或未知时提示遵守安全间隔期。 */
  readonly edibleSafetyIntervalNotice?: true
}

/** 后续养护步骤。 */
export interface GenOngoingCare {
  /** 步骤序号，从 1 开始按执行顺序排列。 */
  readonly stepNo: number
  /** 养护步骤标题，面向用户的简短中文。 */
  readonly titleZh: string
  /** 养护步骤正文，说明具体怎么做。 */
  readonly detailZh: string
  /** 该步骤针对的病因编号列表，仅内部使用。 */
  readonly causeCodes: readonly string[]
  /** 模型给出的养护类型（可能含非 care 类型，投影时归一）。 */
  readonly careProposalKind: string
  /** 涉及的药剂名（养护步骤通常为空）。 */
  readonly agentNames: readonly string[]
  /** 服务端补写：提示按产品标签用量与间隔使用。 */
  readonly labelDosageNotice?: true
  /** 服务端补写：可食用或未知时提示遵守安全间隔期。 */
  readonly edibleSafetyIntervalNotice?: true
}

/** 模型分类信息（编号先行，供安全门与投影使用）。 */
export interface GenClassification {
  /** 图中是否为植物：是、否或不确定。 */
  readonly isPlant: 'yes' | 'no' | 'uncertain'
  /** 图片整体可用性：良好、受限或不可用。 */
  readonly usable: 'good' | 'limited' | 'unusable'
  /** 图片质量问题列表，例如模糊、过曝、太远。 */
  readonly qualityIssues: readonly QualityIssue[]
  /** 总体状态：发现问题、多个问题、无明显问题、证据不足或非植物。 */
  readonly overallStatus: OverallStatus
  /** 候选病因列表；证据不足或非植物时必须为空。 */
  readonly candidates: readonly GenCandidate[]
  /** 严重程度：轻、中、重或未知。 */
  readonly severity: 'mild' | 'moderate' | 'severe' | 'unknown'
  /** 紧急程度：立即、尽快、观察或未知。 */
  readonly urgency: 'immediate' | 'soon' | 'observe' | 'unknown'
  /** 是否建议隔离：建议、不需要或不确定。 */
  readonly isolation: 'recommended' | 'not_needed' | 'uncertain'
}

/** 单张图片的评估。 */
export interface GenPerImage {
  /** 图片序号，从 1 开始，对应上传顺序。 */
  readonly imageIndex: number
  /** 这张图主要拍到的植物部位。 */
  readonly visiblePart: VisiblePart
  /** 这张图的质量档：良好、受限或不可用。 */
  readonly quality: 'good' | 'limited' | 'unusable'
  /** 这张图的简短中文备注，可为空字符串。 */
  readonly noteZh: string
}

/** 诊断表（面向用户的中文摘要行）。 */
export interface GenDiagnosisTable {
  /** 问题类型的中文描述，例如刺吸式害虫危害。 */
  readonly problemTypeZh: string
  /** 把握程度的中文理由，不得含百分比或概率。 */
  readonly certaintyReasonZh: string
  /** 主要证据的中文描述，说明图中看到了什么。 */
  readonly mainEvidenceZh: string
  /** 紧急程度的中文描述，例如需尽快处理。 */
  readonly urgencyZh: string
  /** 是否隔离的中文描述及理由。 */
  readonly isolationZh: string
}

/** 识别依据条目。 */
export interface GenIdentificationBasis {
  /** 依据的方面，例如虫体特征、病斑形态。 */
  readonly aspectZh: string
  /** 依据的具体中文描述。 */
  readonly detailZh: string
  /** 依据来自第几张图，从 1 开始。 */
  readonly imageIndex: number
}

/** 其他可能的病因。 */
export interface GenAlternative {
  /** 其他可能病因的闭集编号，仅内部使用。 */
  readonly causeCode: string
  /** 其他可能病因的中文名称。 */
  readonly nameZh: string
  /** 为什么可能性较低的中文说明。 */
  readonly whyLessLikelyZh: string
  /** 如何排除这种可能的中文说明。 */
  readonly howToRuleOutZh: string
}

/** 预防建议条目。 */
export interface GenPrevention {
  /** 预防建议的简短中文标题。 */
  readonly titleZh: string
  /** 预防建议的具体中文正文。 */
  readonly detailZh: string
}

/** 注意事项条目。 */
export interface GenCaution {
  /** 本例特有注意事项的中文正文。 */
  readonly detailZh: string
}

/** 复查与升级建议。 */
export interface GenFollowUp {
  /** 何时以及如何复查的中文说明。 */
  readonly recheckZh: string
  /** 什么情况下需要线下核验的中文说明。 */
  readonly escalateZh: string
}

/** 补拍建议条目。 */
export interface GenRetakeRequest {
  /** 建议补拍的植物部位。 */
  readonly visiblePart: VisiblePart
  /** 为什么需要补拍的中文理由。 */
  readonly reasonZh: string
  /** 怎么拍更清楚的中文指引。 */
  readonly howToShootZh: string
}

/** 已解析的模型输出。 */
export interface VisualGenOutput {
  /** 分类信息（编号先行），供安全门与投影使用。 */
  readonly classification: GenClassification
  /** 逐图评估列表，与上传图片一一对应。 */
  readonly perImage: readonly GenPerImage[]
  /** 诊断名称，面向用户的简短中文标题。 */
  readonly titleZh: string
  /** 一句话结论，不得含数值化把握。 */
  readonly summaryZh: string
  /** 诊断表，面向用户的中文摘要行。 */
  readonly diagnosisTable: GenDiagnosisTable
  /** 识别依据列表，说明结论从哪些图像特征得出。 */
  readonly identificationBasis: readonly GenIdentificationBasis[]
  /** 其他可能病因及排除方法。 */
  readonly alternatives: readonly GenAlternative[]
  /** 立即处理步骤列表，含药剂时受安全门约束。 */
  readonly immediateActions: readonly GenImmediateAction[]
  /** 后续养护步骤列表，投影时归一养护类型。 */
  readonly ongoingCare: readonly GenOngoingCare[]
  /** 预防建议列表，避免问题复发。 */
  readonly prevention: readonly GenPrevention[]
  /** 注意事项列表（只写本例特有内容）。 */
  readonly cautions: readonly GenCaution[]
  /** 复查与升级线下核验的建议。 */
  readonly followUp: GenFollowUp
  /** 补拍建议列表，证据不足时引导用户补图。 */
  readonly retakeRequests: readonly GenRetakeRequest[]
}

/** 结构解析失败。 */
export class MalformedVisualGenOutputError extends Error {
  constructor() {
    super('模型输出结构不合法')
    this.name = 'MalformedVisualGenOutputError'
  }
}

/** 取对象字段。 */
function obj(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new MalformedVisualGenOutputError()
  }
  return value as Record<string, unknown>
}
/** 取非空字符串（允许空串的字段用 optText）。 */
function text(value: unknown): string {
  if (typeof value !== 'string') {
    throw new MalformedVisualGenOutputError()
  }
  return value
}
/** 取可选字符串。 */
function optText(value: unknown): string | undefined {
  return value === undefined ? undefined : text(value)
}
/** 取数组。 */
function arr(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new MalformedVisualGenOutputError()
  }
  return value
}
/** 取可选数组（缺省为空数组）。 */
function optArr(value: unknown): readonly unknown[] {
  return value === undefined ? [] : arr(value)
}
/** 取整数。 */
function int(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new MalformedVisualGenOutputError()
  }
  return value
}
/** 取枚举。 */
function oneOf<T extends string>(value: unknown, allowed: readonly T[]): T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new MalformedVisualGenOutputError()
  }
  return value as T
}

/** 把已 JSON.parse 的值解析为结构化输出；任何结构问题抛 MalformedVisualGenOutputError。 */
export function parseVisualGenOutput(value: unknown): VisualGenOutput {
  const root = obj(value)
  if (root.contractVersion !== 'diagnosis-visual-gen-output/v1') {
    throw new MalformedVisualGenOutputError()
  }
  const c = obj(root.classification)
  const table = obj(root.diagnosisTable)
  const followUp = obj(root.followUp)
  return {
    classification: {
      isPlant: oneOf(c.isPlant, ['yes', 'no', 'uncertain']),
      usable: oneOf(c.usable, ['good', 'limited', 'unusable']),
      qualityIssues: optArr(c.qualityIssues).map(issue => oneOf(issue, QUALITY_ISSUES)),
      overallStatus: oneOf(c.overallStatus, OVERALL_STATUSES),
      candidates: arr(c.candidates).map(raw => {
        const candidate = obj(raw)
        return {
          rank: int(candidate.rank),
          causeCode: text(candidate.causeCode),
          certaintyBand: oneOf(candidate.certaintyBand, ['likely', 'possible', 'unconfirmed']),
          directMarkerKeys: optArr(candidate.directMarkerKeys).map(text)
        }
      }),
      severity: oneOf(c.severity, ['mild', 'moderate', 'severe', 'unknown']),
      urgency: oneOf(c.urgency, ['immediate', 'soon', 'observe', 'unknown']),
      isolation: oneOf(c.isolation, ['recommended', 'not_needed', 'uncertain'])
    },
    perImage: arr(root.perImage).map(raw => {
      const image = obj(raw)
      return {
        imageIndex: int(image.imageIndex),
        visiblePart: oneOf(image.visiblePart, VISIBLE_PARTS),
        quality: oneOf(image.quality, ['good', 'limited', 'unusable']),
        noteZh: optText(image.noteZh) ?? ''
      }
    }),
    titleZh: text(root.titleZh),
    summaryZh: text(root.summaryZh),
    diagnosisTable: {
      problemTypeZh: text(table.problemTypeZh),
      certaintyReasonZh: text(table.certaintyReasonZh),
      mainEvidenceZh: text(table.mainEvidenceZh),
      urgencyZh: text(table.urgencyZh),
      isolationZh: text(table.isolationZh)
    },
    identificationBasis: optArr(root.identificationBasis).map(raw => {
      const basis = obj(raw)
      return {
        aspectZh: text(basis.aspectZh),
        detailZh: text(basis.detailZh),
        imageIndex: int(basis.imageIndex)
      }
    }),
    alternatives: optArr(root.alternatives).map(raw => {
      const alt = obj(raw)
      return {
        causeCode: text(alt.causeCode),
        nameZh: text(alt.nameZh),
        whyLessLikelyZh: text(alt.whyLessLikelyZh),
        howToRuleOutZh: text(alt.howToRuleOutZh)
      }
    }),
    immediateActions: optArr(root.immediateActions).map(raw => {
      const step = obj(raw)
      const riskReasonZh = optText(step.riskReasonZh)
      return {
        stepNo: int(step.stepNo),
        titleZh: text(step.titleZh),
        detailZh: text(step.detailZh),
        causeCodes: optArr(step.causeCodes).map(text),
        riskLevel: oneOf(step.riskLevel, ['low', 'medium', 'high']),
        ...(riskReasonZh === undefined ? {} : { riskReasonZh }),
        agentNames: optArr(step.agentNames).map(text)
      }
    }),
    ongoingCare: optArr(root.ongoingCare).map(raw => {
      const step = obj(raw)
      return {
        stepNo: int(step.stepNo),
        titleZh: text(step.titleZh),
        detailZh: text(step.detailZh),
        causeCodes: optArr(step.causeCodes).map(text),
        careProposalKind: optText(step.careProposalKind) ?? 'none',
        agentNames: optArr(step.agentNames).map(text)
      }
    }),
    prevention: optArr(root.prevention).map(raw => {
      const item = obj(raw)
      return { titleZh: text(item.titleZh), detailZh: text(item.detailZh) }
    }),
    cautions: optArr(root.cautions).map(raw => ({ detailZh: text(obj(raw).detailZh) })),
    followUp: { recheckZh: text(followUp.recheckZh), escalateZh: text(followUp.escalateZh) },
    retakeRequests: optArr(root.retakeRequests).map(raw => {
      const retake = obj(raw)
      return {
        visiblePart: oneOf(retake.visiblePart, VISIBLE_PARTS),
        reasonZh: text(retake.reasonZh),
        howToShootZh: text(retake.howToShootZh)
      }
    })
  }
}
