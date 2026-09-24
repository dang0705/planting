import {
  validateKnowledgeReferences,
  type KnowledgeReferenceIndex,
  ActionReference,
  CauseReference,
  KnowledgeClaimLink,
  KnowledgeReferenceIssue,
  OutcomeActionReference,
  OutcomeReference,
  PublishedSymptomMode,
  VerifiedClaimRevision
} from './validate-knowledge-references.js'

/** 已通过候选 v1 JSON Schema 结构校验、但尚未解析外部依赖的关系内容。 */
export interface CandidateReferenceContent {
  /** 候选整包声明兼容的症状入口和精确题包版本。 */
  symptomModeRefs: PublishedSymptomMode[]
  /** 候选内可被结论引用的园艺原因。 */
  causes: CauseReference[]
  /** 候选内的受审诊断结论及其题包入口。 */
  outcomes: OutcomeReference[]
  /** 候选内的受审行动建议。 */
  actions: ActionReference[]
  /** 结论与行动的受审关系。 */
  mappings: OutcomeActionReference[]
  /** 知识条目到来源主张精确修订的关系。 */
  claimLinks: KnowledgeClaimLink[]
}

/** 应用层已经从权威来源和已发布题包目录独立核实的外部依赖。 */
export interface VerifiedReferenceDependencies {
  /** 真正已发布且可用于本候选的症状入口和题包版本。 */
  publishedSymptomModes: PublishedSymptomMode[]
  /** 已核对来源状态、许可和适用性的精确主张修订。 */
  verifiedClaimRevisions: VerifiedClaimRevision[]
}

/** 通过元组序列化同时固定症状代码与题包版本，避免单字段相等误判。 */
function symptomModeKey(mode: PublishedSymptomMode): string {
  return JSON.stringify([mode.symptomModeCode, mode.questionPackageReleaseRef])
}

/** Schema 外的脏数组只允许失败关闭，不能在关系投影中解引用空元素。 */
function hasMissingArrayElement(items: unknown): boolean {
  if (!Array.isArray(items)) {
    return true
  }
  for (const item of items) {
    if (item === null || item === undefined) {
      return true
    }
  }
  return false
}

/**
 * 校验单候选声明、逐条结论和应用层已核实依赖之间的引用闭合。
 * 调用方必须先用候选 v1 Schema 校验完整内容；本纯函数不读取 CMS、MySQL 或网络，
 * 更不能把传入的“已验证依赖”当作真实外部读回证据。
 */
export function validateCandidateReferenceClosure(
  candidate: CandidateReferenceContent,
  dependencies: VerifiedReferenceDependencies
): KnowledgeReferenceIssue[] {
  const candidateArrays = [
    candidate.symptomModeRefs,
    candidate.causes,
    candidate.outcomes,
    candidate.actions,
    candidate.mappings,
    candidate.claimLinks,
    dependencies.publishedSymptomModes,
    dependencies.verifiedClaimRevisions
  ]
  if (
    candidateArrays.some(hasMissingArrayElement) ||
    candidate.outcomes.some(
      outcome =>
        hasMissingArrayElement(outcome.symptomModeRefs) ||
        hasMissingArrayElement(outcome.differentialOutcomeCodes)
    )
  ) {
    return [{ code: 'INVALID_CANDIDATE_REFERENCE_SHAPE', path: 'candidate' }]
  }

  const issues: KnowledgeReferenceIssue[] = []
  const publishedRefs = new Set(dependencies.publishedSymptomModes.map(symptomModeKey))
  const declaredRefs = new Set(candidate.symptomModeRefs.map(symptomModeKey))

  candidate.symptomModeRefs.forEach((mode, position) => {
    if (!publishedRefs.has(symptomModeKey(mode))) {
      issues.push({
        code: 'UNPUBLISHED_CANDIDATE_QUESTION_PACKAGE',
        path: `symptomModeRefs[${position}]`
      })
    }
  })

  candidate.outcomes.forEach((outcome, outcomePosition) => {
    outcome.symptomModeRefs.forEach((mode, modePosition) => {
      if (!declaredRefs.has(symptomModeKey(mode))) {
        issues.push({
          code: 'UNDECLARED_OUTCOME_QUESTION_PACKAGE',
          path: `outcomes[${outcomePosition}].symptomModeRefs[${modePosition}]`
        })
      }
    })
  })

  const referenceIndex: KnowledgeReferenceIndex = {
    publishedSymptomModes: dependencies.publishedSymptomModes,
    verifiedClaimRevisions: dependencies.verifiedClaimRevisions,
    causes: candidate.causes,
    outcomes: candidate.outcomes,
    actions: candidate.actions,
    mappings: candidate.mappings,
    claimLinks: candidate.claimLinks
  }

  return [...issues, ...validateKnowledgeReferences(referenceIndex)]
}
