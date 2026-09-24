import { describe, expect, test } from 'vitest'

import {
  validateCandidateReferenceClosure,
  type CandidateReferenceContent,
  type VerifiedReferenceDependencies
} from '../../../../../src/diagnosis/domain/validate-candidate-reference-closure.js'

/**
 * Expected 来源：诊断知识持久化合同“包内所有引用一次性解析”和候选结构 v1。
 * 层次：unit_fake / L1；外部题包与来源核验结果是受控输入，不证明其真实状态。
 */
function validCandidate(): CandidateReferenceContent {
  return {
    symptomModeRefs: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'yellow-leaf-v1' }
    ],
    causes: [{ causeCode: 'undetermined', parentCauseCode: null }],
    outcomes: [
      {
        outcomeCode: 'needs-evidence',
        causeCode: 'undetermined',
        symptomModeRefs: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'yellow-leaf-v1' }
        ],
        differentialOutcomeCodes: []
      }
    ],
    actions: [],
    mappings: [],
    claimLinks: [
      {
        targetKind: 'cause',
        targetCode: 'undetermined',
        sourceCode: 'reviewed-source',
        claimCode: 'multiple-causes',
        revisionNo: 1,
        linkRole: 'support'
      },
      {
        targetKind: 'outcome',
        targetCode: 'needs-evidence',
        sourceCode: 'reviewed-source',
        claimCode: 'multiple-causes',
        revisionNo: 1,
        linkRole: 'limit'
      }
    ]
  }
}

/** 这些是应用层已验证的依赖索引，不是测试替身伪造的供应商响应。 */
function verifiedDependencies(): VerifiedReferenceDependencies {
  return {
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'yellow-leaf-v1' }
    ],
    verifiedClaimRevisions: [
      { sourceCode: 'reviewed-source', claimCode: 'multiple-causes', revisionNo: 1 }
    ]
  }
}

/** 只断言稳定错误代码，不把检查顺序当成合同。 */
function issueCodes(
  candidate: CandidateReferenceContent,
  dependencies: VerifiedReferenceDependencies = verifiedDependencies()
): string[] {
  return validateCandidateReferenceClosure(candidate, dependencies).map(issue => issue.code)
}

describe('完整诊断候选的题包与来源引用闭合', () => {
  test('候选、结论和已验证题包使用同一精确发布版本时通过', () => {
    expect(validateCandidateReferenceClosure(validCandidate(), verifiedDependencies())).toEqual([])
  })

  test('候选声明的题包版本未发布时拒绝整包', () => {
    const candidate = validCandidate()
    const [mode] = candidate.symptomModeRefs
    mode!.questionPackageReleaseRef = 'yellow-leaf-v2'
    expect(issueCodes(candidate)).toContain('UNPUBLISHED_CANDIDATE_QUESTION_PACKAGE')
  })

  test('结论不能引用候选没有声明的其他题包版本', () => {
    const candidate = validCandidate()
    const [outcome] = candidate.outcomes
    const [mode] = outcome!.symptomModeRefs
    mode!.questionPackageReleaseRef = 'yellow-leaf-v2'
    expect(issueCodes(candidate)).toContain('UNDECLARED_OUTCOME_QUESTION_PACKAGE')
  })

  test('候选数组没有题包声明时不能仅靠结论声明通过', () => {
    const candidate = validCandidate()
    candidate.symptomModeRefs = []
    expect(issueCodes(candidate)).toContain('UNDECLARED_OUTCOME_QUESTION_PACKAGE')
  })

  test('候选数组含空元素时返回结构错误而不抛异常', () => {
    const candidate = validCandidate()
    candidate.symptomModeRefs = [null] as unknown as CandidateReferenceContent['symptomModeRefs']
    expect(issueCodes(candidate)).toContain('INVALID_CANDIDATE_REFERENCE_SHAPE')
  })

  test('精确来源修订缺失时继续拒绝，而非默认追随最新版', () => {
    const candidate = validCandidate()
    const [claimLink] = candidate.claimLinks
    claimLink!.revisionNo = 2
    expect(issueCodes(candidate)).toContain('MISSING_CLAIM_REVISION')
  })
})
