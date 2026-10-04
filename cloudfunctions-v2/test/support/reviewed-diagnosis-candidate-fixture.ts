/** 已冻结候选Schema的结构制品；不是人工审核通过或可上线的园艺知识。 */
export function validCandidate(): Record<string, unknown> {
  return {
    schemaVersion: 'diagnosis-knowledge-candidate/v1',
    bundleCode: 'yellow_leaf',
    revisionNo: 1,
    symptomModeRefs: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
    ],
    causes: [
      {
        causeCode: 'undetermined',
        parentCauseCode: null,
        causeCategory: 'undetermined',
        displayNameZh: '原因待判定',
        definitionZh: '现有证据不足以区分原因。',
        applicablePlantScope: { mode: 'all_reviewed', taxa: [], allowUnknownIdentity: true }
      }
    ],
    outcomes: [
      {
        outcomeCode: 'needs-more-evidence',
        causeCode: 'undetermined',
        displayNameZh: '仍需补充证据',
        summaryZh: '暂不能从单一症状判断原因。',
        problemTypeCode: 'undetermined',
        symptomModeRefs: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
        ],
        affectedPartCodes: ['leaf'],
        applicablePlantScope: { mode: 'all_reviewed', taxa: [], allowUnknownIdentity: true },
        evidenceRules: {
          required: [],
          supporting: [],
          opposing: []
        },
        conflictPolicy: 'defer',
        uncertaintyPolicy: 'unconfirmed_when_insufficient',
        severityCriteria: [],
        urgencyPolicy: { rules: [], fallback: 'unknown' },
        isolationPolicy: { rules: [], fallback: 'undetermined' },
        differentialOutcomeCodes: [],
        followUpCriteria: []
      }
    ],
    actions: [],
    mappings: [],
    claimLinks: [
      {
        targetKind: 'cause',
        targetCode: 'undetermined',
        sourceCode: 'reviewed-source',
        claimCode: 'multi-cause',
        revisionNo: 1,
        linkRole: 'support'
      },
      {
        targetKind: 'outcome',
        targetCode: 'needs-more-evidence',
        sourceCode: 'reviewed-source',
        claimCode: 'multi-cause',
        revisionNo: 1,
        linkRole: 'limit'
      }
    ]
  }
}
