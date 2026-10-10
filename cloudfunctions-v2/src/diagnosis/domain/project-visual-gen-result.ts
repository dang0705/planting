import type {
  EdibleContext,
  GenImmediateAction,
  GenOngoingCare,
  VisualGenOutput,
  VisiblePart
} from './visual-gen-output.js'

/**
 * 把已通过安全门的模型输出投影为公开结果 diagnosis-result/v2（generationSource = model_constrained）。
 *
 * 通俗说明：像前端的 view-model 映射——内部字段（病因编号、直接证据标记、模型分类）不外露，
 * 只输出 v2 合同里的中文展示字段与枚举；固定文案（AI 生成说明、远程参考、确认后才记入养护、用药两项提示）由服务端写入。
 * careProposalKind 只保留 care 域能力类型（watering、fertilizing、lighting、ventilation），其他一律投影为 none。
 */

/** 公开结果中的一条推荐行动（diagnosis-result/v2 recommendedAction，生成式来源）。 */
export interface PublicRecommendedAction {
  /** 展示分组：立即处理、后续养护、预防或注意事项。 */
  readonly displayCategory: 'immediate' | 'ongoing' | 'prevention' | 'caution'
  /** 内容来源，固定为受约束的模型生成。 */
  readonly generationSource: 'model_constrained'
  /** 行动标题，面向用户的简短中文。 */
  readonly titleZh: string
  /** 这条行动的目的，服务端按分组写入固定说明。 */
  readonly purposeZh: string
  /** 具体操作步骤的中文列表。 */
  readonly stepsZh: readonly string[]
  /** 为什么选择这条行动的中文说明。 */
  readonly selectionReasonZh: string
  /** 适用范围的中文说明，例如仅在可见症状时适用。 */
  readonly applicabilityZh: string
  /** 行动风险等级：低、中、高三档。 */
  readonly riskLevel: 'low' | 'moderate' | 'high'
  /** 风险理由（风险等级不是 low 时给出）。 */
  readonly riskReasonZh?: string
  /** 涉及的药剂名（已规范为允许名单规范名）。 */
  readonly agentNamesZh?: readonly string[]
  /** 服务端补写：提示按产品标签用量与间隔使用。 */
  readonly labelDosageNotice?: true
  /** 服务端补写：可食用或未知时提示遵守安全间隔期。 */
  readonly edibleSafetyIntervalNotice?: true
  /** 安全提示的中文列表，由服务端固定文案组成。 */
  readonly safetyNotesZh: readonly string[]
  /** 禁忌情况的中文列表，生成式来源当前为空。 */
  readonly contraindicationsZh: readonly string[]
  /** 出现哪些情况应停止操作的中文列表。 */
  readonly stopConditionsZh: readonly string[]
  /** 执行后如何复查的中文说明。 */
  readonly followUpZh: string
  /** 公开来源列表，生成式来源固定为空数组。 */
  readonly publicSources: readonly never[]
  /** 标记该行动由 AI 生成，固定为 true。 */
  readonly aiGeneratedNotice: true
  /** 可转为养护提议的类型；非 care 能力类型一律为 none。 */
  readonly careProposalKind: 'watering' | 'fertilizing' | 'lighting' | 'ventilation' | 'none'
  /** 必须由用户确认后才可记入养护，固定为 true。 */
  readonly requiresUserConfirmation: true
}

/** 公开证据发现条目。 */
export interface PublicEvidenceFinding {
  /** 图中观察到的现象的中文描述。 */
  readonly observationZh: string
  /** 观察到现象的植物部位中文名。 */
  readonly affectedPartZh: string
  /** 证据来源类型，生成式诊断固定为图片。 */
  readonly sourceType: 'image'
  /** 证据方向，生成式诊断固定为支持结论。 */
  readonly direction: 'supports'
  /** 证据覆盖范围的中文说明，例如来自第几张图。 */
  readonly coverageZh: string
}

/** 公开证据局限条目。 */
export interface PublicEvidenceLimitation {
  /** 当前证据的局限的中文描述。 */
  readonly limitationZh: string
  /** 该局限对结论影响的中文说明。 */
  readonly impactZh: string
  /** 补充什么证据可以消除局限的中文说明。 */
  readonly nextEvidenceZh: string
}

/** 公开缺失证据条目。 */
export interface PublicMissingEvidence {
  /** 需要补充的证据的中文描述。 */
  readonly needZh: string
  /** 为什么需要该证据的中文理由。 */
  readonly reasonZh: string
}

/** 公开的其他可能结论条目。 */
export interface PublicAlternativeOutcome {
  /** 其他可能结论的中文名称。 */
  readonly titleZh: string
  /** 支持这种可能的中文理由列表。 */
  readonly supportingZh: readonly string[]
  /** 反对这种可能的中文理由列表。 */
  readonly opposingZh: readonly string[]
  /** 如何进一步核验的中文说明列表。 */
  readonly toVerifyZh: readonly string[]
}

/** 公开的复查与升级建议。 */
export interface PublicFollowUp {
  /** 后续需要观察的中文要点列表。 */
  readonly observationsZh: readonly string[]
  /** 什么情况下需要线下核验的中文说明。 */
  readonly escalationZh: string
}

/** 公开结果（diagnosis-result/v2 的生成式子集）。 */
export interface PublicVisualDiagnosisResult {
  /** 合同版本，固定为 diagnosis-result/v2。 */
  readonly contractVersion: 'diagnosis-result/v2'
  /** 内容来源，固定为受约束的模型生成。 */
  readonly generationSource: 'model_constrained'
  /** AI 生成说明的固定中文文案，由服务端写入。 */
  readonly aiGeneratedNoticeZh: string
  /** 可食用背景：是、否或未知，来自服务端上下文。 */
  readonly edibleContext: EdibleContext
  /** 诊断名称，面向用户的简短中文标题。 */
  readonly titleZh: string
  /** 一句话结论，不含数值化把握。 */
  readonly summaryZh: string
  /** 问题类型的中文描述，例如刺吸式害虫危害。 */
  readonly problemType: string
  /** 病因大类的中文标签，由服务端按编号映射。 */
  readonly causeCategory: string
  /** 把握档：较可能、有可能或无法确认。 */
  readonly certaintyLevel: 'likely' | 'possible' | 'unconfirmed'
  /** 把握程度的中文理由，不含百分比或概率。 */
  readonly certaintyReasonZh: string
  /** 严重程度：低、中、高或未知。 */
  readonly severityLevel: 'low' | 'medium' | 'high' | 'unknown'
  /** 严重程度的中文理由说明。 */
  readonly severityReasonZh: string
  /** 紧急程度：立即、尽快、观察或未知。 */
  readonly urgencyLevel: 'immediate' | 'soon' | 'monitor' | 'unknown'
  /** 紧急程度的中文理由说明。 */
  readonly urgencyReasonZh: string
  /** 是否需要隔离：需要、不需要或待定。 */
  readonly isolationDecision: 'required' | 'not_required' | 'undetermined'
  /** 隔离决定的中文理由说明。 */
  readonly isolationReasonZh: string
  /** 支持结论的证据发现列表。 */
  readonly evidenceFindings: readonly PublicEvidenceFinding[]
  /** 当前证据的局限列表。 */
  readonly evidenceLimitations: readonly PublicEvidenceLimitation[]
  /** 建议补充的缺失证据列表。 */
  readonly missingEvidence: readonly PublicMissingEvidence[]
  /** 其他可能结论列表，帮助用户自行排除。 */
  readonly alternativeOutcomes: readonly PublicAlternativeOutcome[]
  /** 推荐行动列表，按展示分组排列。 */
  readonly recommendedActions: readonly PublicRecommendedAction[]
  /** 复查与升级线下核验的建议。 */
  readonly followUp: PublicFollowUp
  /** 公开来源列表，生成式来源固定为空数组。 */
  readonly publicSources: readonly never[]
  /** 知识版本的中文说明，标明提示词与名单版本。 */
  readonly knowledgeVersionZh: string
}

/** 服务端固定文案。 */
const fixedText = {
  aiGenerated: '以下内容由 AI 根据照片生成，仅作远程参考。',
  remoteReference:
    '图片诊断仅作远程参考；若按建议处理 2～3 次仍无改善或持续恶化，建议带样本线下核验。',
  labelDosage: '请按产品标签说明的用量与间隔使用。',
  edibleInterval: '采收前须遵守产品标签上的安全间隔期。',
  careConfirm: '这是建议，确认后才会记入养护。',
  stopCondition: '出现叶片灼伤或状况明显恶化时停止，并重新诊断。',
  knowledgeVersion: '视觉诊断生成式版本组 v1',
  applicability: '仅适用于本次拍摄的这株植物。'
} as const

/** 病因编号前缀 → 公开原因方向。 */
const causeCategoryByPrefix: Readonly<Record<string, string>> = {
  pest: '虫害',
  fungal: '真菌病害',
  bacterial: '细菌病害',
  viral: '病毒病',
  nematode: '线虫',
  physio: '生理性问题',
  env: '环境性问题',
  nutrient: '营养问题',
  chem: '药害或肥害',
  root: '根部问题',
  none: '未见明显问题',
  unknown: '待判定'
}

/** 图片部位中文名。 */
const partLabel: Readonly<Record<VisiblePart, string>> = {
  whole_plant: '整株',
  leaf_front: '叶片正面',
  leaf_back: '叶背',
  leaf_edge: '叶缘',
  petiole: '叶柄',
  stem: '茎',
  stem_base: '茎基',
  flower: '花',
  fruit: '果实',
  soil_surface: '盆土表面',
  root: '根部',
  root_crown: '根颈',
  unknown: '未知部位'
}

/** 质量原因中文说明。 */
const qualityIssueLabel: Readonly<Record<string, string>> = {
  blur: '图片模糊',
  overexposed: '过曝',
  underexposed: '过暗',
  too_far: '拍得太远',
  occluded: '有遮挡',
  glare: '反光',
  compression: '压缩失真',
  not_plant: '画面中没有植物'
}

/** care 域能力类型。 */
const careKinds = new Set(['watering', 'fertilizing', 'lighting', 'ventilation'])

/** 非空中文文本；空时用兜底文案（v2 要求最少 1 个字符）。 */
function nonEmpty(value: string | undefined, fallback: string): string {
  return value !== undefined && value.trim() !== '' ? value : fallback
}

/** 把步骤投影为公开行动。 */
function projectStep(
  step: GenImmediateAction | GenOngoingCare,
  displayCategory: 'immediate' | 'ongoing',
  edible: EdibleContext
): PublicRecommendedAction {
  const riskLevel =
    'riskLevel' in step ? (step.riskLevel === 'medium' ? 'moderate' : step.riskLevel) : 'low'
  const kindRaw = 'careProposalKind' in step ? step.careProposalKind : 'none'
  const careProposalKind = careKinds.has(kindRaw)
    ? (kindRaw as PublicRecommendedAction['careProposalKind'])
    : 'none'
  const hasAgents = step.agentNames.length > 0
  const safetyNotesZh = [
    ...(hasAgents ? [fixedText.labelDosage] : []),
    ...(hasAgents && edible !== 'no' ? [fixedText.edibleInterval] : []),
    ...(careProposalKind !== 'none' ? [fixedText.careConfirm] : [])
  ]
  const riskReasonZh = 'riskReasonZh' in step ? step.riskReasonZh : undefined
  return {
    displayCategory,
    generationSource: 'model_constrained',
    titleZh: step.titleZh,
    purposeZh: step.titleZh,
    stepsZh: [step.detailZh],
    selectionReasonZh: '根据本次照片中的可见症状给出。',
    applicabilityZh: fixedText.applicability,
    riskLevel,
    ...(riskLevel !== 'low'
      ? { riskReasonZh: nonEmpty(riskReasonZh, '该步骤有一定风险，请按说明谨慎操作。') }
      : {}),
    ...(hasAgents ? { agentNamesZh: step.agentNames, labelDosageNotice: true as const } : {}),
    ...(hasAgents && edible !== 'no' ? { edibleSafetyIntervalNotice: true as const } : {}),
    safetyNotesZh,
    contraindicationsZh: [],
    stopConditionsZh: [fixedText.stopCondition],
    followUpZh: '处理后几天复查同一部位。',
    publicSources: [],
    aiGeneratedNotice: true,
    careProposalKind,
    requiresUserConfirmation: true
  }
}

/** 投影为公开结果；只接受已通过安全门的输出。 */
export function projectVisualGenResult(
  output: VisualGenOutput,
  context: { readonly edibleContext: EdibleContext }
): PublicVisualDiagnosisResult {
  const top = output.classification.candidates[0]
  const prefix = top?.causeCode.split('_')[0] ?? 'unknown'
  const partOf = (imageIndex: number) =>
    partLabel[
      output.perImage.find(image => image.imageIndex === imageIndex)?.visiblePart ?? 'unknown'
    ]
  const findings = output.identificationBasis.map(basis => ({
    observationZh: basis.detailZh,
    affectedPartZh: partOf(basis.imageIndex),
    sourceType: 'image' as const,
    direction: 'supports' as const,
    coverageZh: `仅覆盖第 ${basis.imageIndex} 张照片中可见的部位。`
  }))
  const fallbackFindings = output.perImage.map(image => ({
    observationZh: nonEmpty(image.noteZh, '照片已收到。'),
    affectedPartZh: partLabel[image.visiblePart],
    sourceType: 'image' as const,
    direction: 'supports' as const,
    coverageZh: `仅覆盖第 ${image.imageIndex} 张照片。`
  }))
  const edible = context.edibleContext
  return {
    contractVersion: 'diagnosis-result/v2',
    generationSource: 'model_constrained',
    aiGeneratedNoticeZh: fixedText.aiGenerated,
    edibleContext: edible,
    titleZh: output.titleZh,
    summaryZh: output.summaryZh,
    problemType: nonEmpty(output.diagnosisTable.problemTypeZh, '待判定'),
    causeCategory: causeCategoryByPrefix[prefix] ?? '待判定',
    certaintyLevel: top?.certaintyBand ?? 'unconfirmed',
    certaintyReasonZh: nonEmpty(output.diagnosisTable.certaintyReasonZh, '现有照片证据有限。'),
    severityLevel: (
      { mild: 'low', moderate: 'medium', severe: 'high', unknown: 'unknown' } as const
    )[output.classification.severity],
    severityReasonZh: nonEmpty(
      output.diagnosisTable.mainEvidenceZh,
      '按照片中可见的受损范围判断。'
    ),
    urgencyLevel: (
      { immediate: 'immediate', soon: 'soon', observe: 'monitor', unknown: 'unknown' } as const
    )[output.classification.urgency],
    urgencyReasonZh: nonEmpty(output.diagnosisTable.urgencyZh, '按照片中的症状判断。'),
    isolationDecision: (
      { recommended: 'required', not_needed: 'not_required', uncertain: 'undetermined' } as const
    )[output.classification.isolation],
    isolationReasonZh: nonEmpty(
      output.diagnosisTable.isolationZh,
      '暂不确定，建议先单独放置观察。'
    ),
    evidenceFindings: findings.length > 0 ? findings : fallbackFindings,
    evidenceLimitations: output.classification.qualityIssues.map(issue => ({
      limitationZh: qualityIssueLabel[issue] ?? '图片质量受限',
      impactZh: '会降低本次判断的把握。',
      nextEvidenceZh: '在光线充足处靠近重拍。'
    })),
    missingEvidence: output.retakeRequests.map(retake => ({
      needZh: `补拍${partLabel[retake.visiblePart]}：${retake.howToShootZh}`,
      reasonZh: retake.reasonZh
    })),
    alternativeOutcomes: output.alternatives.map(alternative => ({
      titleZh: alternative.nameZh,
      supportingZh: [],
      opposingZh: [alternative.whyLessLikelyZh],
      toVerifyZh: [alternative.howToRuleOutZh]
    })),
    recommendedActions: [
      ...output.immediateActions.map(step => projectStep(step, 'immediate', edible)),
      ...output.ongoingCare.map(step => projectStep(step, 'ongoing', edible)),
      ...output.prevention.map(item => ({
        ...projectStep(
          {
            stepNo: 0,
            titleZh: item.titleZh,
            detailZh: item.detailZh,
            causeCodes: [],
            careProposalKind: 'none',
            agentNames: []
          },
          'ongoing',
          edible
        ),
        displayCategory: 'prevention' as const
      })),
      ...[...output.cautions.map(item => item.detailZh), fixedText.remoteReference].map(
        detailZh => ({
          ...projectStep(
            {
              stepNo: 0,
              titleZh: '注意事项',
              detailZh,
              causeCodes: [],
              careProposalKind: 'none',
              agentNames: []
            },
            'ongoing',
            edible
          ),
          displayCategory: 'caution' as const
        })
      )
    ],
    followUp: {
      observationsZh: [output.followUp.recheckZh],
      escalationZh: nonEmpty(output.followUp.escalateZh, '状况恶化时重新诊断。')
    },
    publicSources: [],
    knowledgeVersionZh: fixedText.knowledgeVersion
  }
}
