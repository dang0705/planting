/** 诊断知识条目在单个候选修订内的稳定引用类型。 */
export type KnowledgeTargetKind = 'cause' | 'outcome' | 'action' | 'mapping'

/** 来源主张对知识条目的审核用途。 */
export type ClaimLinkRole = 'support' | 'oppose' | 'limit' | 'safety'

/** 已发布且与本次候选兼容的症状题包入口。 */
export interface PublishedSymptomMode {
  /** 症状入口的稳定代码，不可直接当作园艺病因。 */
  symptomModeCode: string
  /** 该入口所绑定的不可变题包发布引用。 */
  questionPackageReleaseRef: string
}

/** 已经完成来源、许可、适用性和修订核验的主张引用。 */
export interface VerifiedClaimRevision {
  /** 稳定资料来源代码。 */
  sourceCode: string
  /** 同一来源内的稳定主张代码。 */
  claimCode: string
  /** 不可覆盖的精确主张修订号。 */
  revisionNo: number
}

/** 单个知识候选中的园艺原因关系。 */
export interface CauseReference {
  /** 候选内唯一的原因代码。 */
  causeCode: string
  /** 同候选父原因代码；根原因使用 null。 */
  parentCauseCode: string | null
}

/** 单个知识候选中的结论关系。 */
export interface OutcomeReference {
  /** 候选内唯一的结论代码。 */
  outcomeCode: string
  /** 同候选已定义的园艺原因代码。 */
  causeCode: string
  /** 可到达该结论的症状入口及其精确题包版本。 */
  symptomModeRefs: PublishedSymptomMode[]
  /** 同候选中需要进一步鉴别的其他结论代码。 */
  differentialOutcomeCodes: string[]
}

/** 单个知识候选中的行动关系。 */
export interface ActionReference {
  /** 候选内唯一的行动代码。 */
  actionCode: string
  /** 经内容审核的行动风险级别；高风险必须有关联安全主张。 */
  riskLevel: 'low' | 'moderate' | 'high'
}

/** 同一知识候选中的结论—行动映射。 */
export interface OutcomeActionReference {
  /** 候选内唯一的映射代码。 */
  mappingCode: string
  /** 同候选已定义的结论代码。 */
  outcomeCode: string
  /** 同候选已定义的行动代码。 */
  actionCode: string
}

/** 精确来源主张修订与单条知识的关系。 */
export interface KnowledgeClaimLink {
  /** 被引用知识条目的类型。 */
  targetKind: KnowledgeTargetKind
  /** 对应类型下同候选的稳定条目代码。 */
  targetCode: string
  /** 来源代码，与主张代码和修订号一起构成精确引用。 */
  sourceCode: string
  /** 同一来源内的主张代码。 */
  claimCode: string
  /** 不可隐式改为最新版本的主张修订号。 */
  revisionNo: number
  /** 该主张对此条知识的支持、反驳、限制或安全作用。 */
  linkRole: ClaimLinkRole
}

/**
 * 从单一候选快照投影出的关系索引。
 * 值对象的完整 JSON Schema、植物身份适用性及园艺内容真实性不由本索引证明。
 */
export interface KnowledgeReferenceIndex {
  /** 由应用层从已发布题包目录读取并锁定的症状入口。 */
  publishedSymptomModes: PublishedSymptomMode[]
  /** 应用层已验证来源状态、许可及适用性的精确主张修订。 */
  verifiedClaimRevisions: VerifiedClaimRevision[]
  /** 此候选修订中的园艺原因索引。 */
  causes: CauseReference[]
  /** 此候选修订中的诊断结论索引。 */
  outcomes: OutcomeReference[]
  /** 此候选修订中的行动索引。 */
  actions: ActionReference[]
  /** 此候选修订中的结论—行动映射索引。 */
  mappings: OutcomeActionReference[]
  /** 分别连接原因、结论、行动和映射的精确来源主张。 */
  claimLinks: KnowledgeClaimLink[]
}

/** 仅供发布准入与审计使用的内部错误；不可原样进入公开响应。 */
export interface KnowledgeReferenceIssue {
  /** 稳定内部错误代码，供审核界面定位缺口。 */
  code: string
  /** 出错关系在单候选索引中的位置。 */
  path: string
}

/** 使用元组序列化避免代码中出现分隔符时误判为同一引用。 */
function claimRevisionKey(ref: VerifiedClaimRevision): string {
  return JSON.stringify([ref.sourceCode, ref.claimCode, ref.revisionNo])
}

/** 使不同类型下的相同稳定代码不会互相抵消来源要求。 */
function targetKey(kind: KnowledgeTargetKind, code: string): string {
  return JSON.stringify([kind, code])
}

/**
 * 校验单候选内的引用闭合性；返回全部可定位缺口，让应用层整包拒绝发布。
 * 不读取 CMS、MySQL 或题包服务，因此不能代替外部来源状态和版本读回。
 */
export function validateKnowledgeReferences(
  index: KnowledgeReferenceIndex
): KnowledgeReferenceIssue[] {
  const issues: KnowledgeReferenceIssue[] = []
  const addIssue = (code: string, path: string): void => {
    issues.push({ code, path })
  }

  /** 各类型分别去重，保持同名原因和同名行动为不同命名空间。 */
  const collectCodes = <T>(
    entries: T[],
    getCode: (entry: T) => string,
    duplicateCode: string,
    path: string
  ): Set<string> => {
    const codes = new Set<string>()
    entries.forEach((entry, position) => {
      const code = getCode(entry)
      if (codes.has(code)) {
        addIssue(duplicateCode, `${path}[${position}]`)
      }
      codes.add(code)
    })
    return codes
  }

  const causeCodes = collectCodes(
    index.causes,
    entry => entry.causeCode,
    'DUPLICATE_CAUSE_CODE',
    'causes'
  )
  const outcomeCodes = collectCodes(
    index.outcomes,
    entry => entry.outcomeCode,
    'DUPLICATE_OUTCOME_CODE',
    'outcomes'
  )
  const actionCodes = collectCodes(
    index.actions,
    entry => entry.actionCode,
    'DUPLICATE_ACTION_CODE',
    'actions'
  )
  const mappingCodes = collectCodes(
    index.mappings,
    entry => entry.mappingCode,
    'DUPLICATE_MAPPING_CODE',
    'mappings'
  )
  const parentByCause = new Map(index.causes.map(entry => [entry.causeCode, entry.parentCauseCode]))

  index.causes.forEach((cause, position) => {
    if (cause.parentCauseCode !== null && !causeCodes.has(cause.parentCauseCode)) {
      addIssue('MISSING_CAUSE_PARENT', `causes[${position}].parentCauseCode`)
      return
    }

    /** 父链必须有限；自指和多节点环都不能成为分类目录。 */
    const visited = new Set<string>()
    let current: string | null = cause.causeCode
    while (current !== null) {
      if (visited.has(current)) {
        addIssue('CAUSE_PARENT_CYCLE', `causes[${position}].parentCauseCode`)
        break
      }
      visited.add(current)
      current = parentByCause.get(current) ?? null
    }
  })

  const publishedModeCodes = new Set(index.publishedSymptomModes.map(mode => mode.symptomModeCode))
  const publishedModeRefs = new Set(
    index.publishedSymptomModes.map(mode =>
      JSON.stringify([mode.symptomModeCode, mode.questionPackageReleaseRef])
    )
  )

  index.outcomes.forEach((outcome, position) => {
    if (!causeCodes.has(outcome.causeCode)) {
      addIssue('MISSING_OUTCOME_CAUSE', `outcomes[${position}].causeCode`)
    }
    outcome.symptomModeRefs.forEach((mode, modePosition) => {
      const modePath = `outcomes[${position}].symptomModeRefs[${modePosition}]`
      if (!publishedModeCodes.has(mode.symptomModeCode)) {
        addIssue('UNKNOWN_SYMPTOM_MODE', modePath)
      } else if (
        !publishedModeRefs.has(
          JSON.stringify([mode.symptomModeCode, mode.questionPackageReleaseRef])
        )
      ) {
        addIssue('MISMATCHED_QUESTION_PACKAGE_RELEASE', modePath)
      }
    })
    outcome.differentialOutcomeCodes.forEach((code, differentialPosition) => {
      if (!outcomeCodes.has(code)) {
        addIssue(
          'MISSING_DIFFERENTIAL_OUTCOME',
          `outcomes[${position}].differentialOutcomeCodes[${differentialPosition}]`
        )
      }
    })
  })

  index.mappings.forEach((mapping, position) => {
    if (!outcomeCodes.has(mapping.outcomeCode)) {
      addIssue('MISSING_MAPPING_OUTCOME', `mappings[${position}].outcomeCode`)
    }
    if (!actionCodes.has(mapping.actionCode)) {
      addIssue('MISSING_MAPPING_ACTION', `mappings[${position}].actionCode`)
    }
  })

  const claimRevisions = new Set(index.verifiedClaimRevisions.map(claimRevisionKey))
  const validLinks = new Set<string>()
  const safetyLinks = new Set<string>()
  const targetCodes = {
    cause: causeCodes,
    outcome: outcomeCodes,
    action: actionCodes,
    mapping: mappingCodes
  }

  index.claimLinks.forEach((link, position) => {
    const claimExists = claimRevisions.has(claimRevisionKey(link))
    const targetExists = targetCodes[link.targetKind].has(link.targetCode)
    if (!claimExists) {
      addIssue('MISSING_CLAIM_REVISION', `claimLinks[${position}]`)
    }
    if (!targetExists) {
      addIssue('MISSING_CLAIM_TARGET', `claimLinks[${position}]`)
    }
    if (claimExists && targetExists) {
      const key = targetKey(link.targetKind, link.targetCode)
      validLinks.add(key)
      if (link.linkRole === 'safety') {
        safetyLinks.add(key)
      }
    }
  })

  /** 来源主张必须逐项挂接，不能仅给整个候选包挂一篇文章。 */
  const requireSourceLinks = (kind: KnowledgeTargetKind, codes: Set<string>): void => {
    for (const code of codes) {
      if (!validLinks.has(targetKey(kind, code))) {
        addIssue('MISSING_SOURCE_LINK', `${kind}:${code}`)
      }
    }
  }
  requireSourceLinks('cause', causeCodes)
  requireSourceLinks('outcome', outcomeCodes)
  requireSourceLinks('action', actionCodes)
  requireSourceLinks('mapping', mappingCodes)

  index.actions.forEach((action, position) => {
    if (action.riskLevel === 'high' && !safetyLinks.has(targetKey('action', action.actionCode))) {
      addIssue('MISSING_SAFETY_CLAIM', `actions[${position}].riskLevel`)
    }
  })

  return issues
}
