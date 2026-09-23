import { describe, expect, test } from 'vitest'

import {
  validateKnowledgeReferences,
  type KnowledgeReferenceIndex
} from '../../../../../src/diagnosis/domain/validate-knowledge-references.js'

/**
 * Expected 来源：Master Plan §6、诊断知识来源合同及持久化与发布合同。
 * 层次：unit_fake / L1。输入是手写的单候选关系索引，不访问 CMS、数据库或网络；
 * 仅校验引用结构，来源真实性、许可、发布状态和园艺正确性另由应用发布门验证。
 */
function createValidIndex(): KnowledgeReferenceIndex {
  return {
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'yellow-leaf-v1' }
    ],
    verifiedClaimRevisions: [{ sourceCode: 'source-a', claimCode: 'yellow-water', revisionNo: 1 }],
    causes: [{ causeCode: 'water-stress', parentCauseCode: null }],
    outcomes: [
      {
        outcomeCode: 'water-stress-possible',
        causeCode: 'water-stress',
        symptomModeRefs: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'yellow-leaf-v1' }
        ],
        differentialOutcomeCodes: []
      }
    ],
    actions: [{ actionCode: 'inspect-soil', riskLevel: 'low' }],
    mappings: [
      {
        mappingCode: 'water-inspection',
        outcomeCode: 'water-stress-possible',
        actionCode: 'inspect-soil'
      }
    ],
    claimLinks: [
      {
        targetKind: 'cause',
        targetCode: 'water-stress',
        sourceCode: 'source-a',
        claimCode: 'yellow-water',
        revisionNo: 1,
        linkRole: 'support'
      },
      {
        targetKind: 'outcome',
        targetCode: 'water-stress-possible',
        sourceCode: 'source-a',
        claimCode: 'yellow-water',
        revisionNo: 1,
        linkRole: 'support'
      },
      {
        targetKind: 'action',
        targetCode: 'inspect-soil',
        sourceCode: 'source-a',
        claimCode: 'yellow-water',
        revisionNo: 1,
        linkRole: 'support'
      },
      {
        targetKind: 'mapping',
        targetCode: 'water-inspection',
        sourceCode: 'source-a',
        claimCode: 'yellow-water',
        revisionNo: 1,
        linkRole: 'support'
      }
    ]
  }
}

/** 仅取稳定的内部错误代码，不把检查顺序误当成业务合同。 */
function issueCodes(index: ReturnType<typeof createValidIndex>): string[] {
  return validateKnowledgeReferences(index).map(issue => issue.code)
}

describe('诊断知识单候选引用准入', () => {
  // Happy：来源修订、题包入口、原因、结论、行动和映射均能在同一候选解析。
  test('完整同版关系可进入后续人工与内容校验', () => {
    expect(validateKnowledgeReferences(createValidIndex())).toEqual([])
  })

  // Edge U1：空缺依赖不能因为 SQL 允许 JSON 列而进入发布。
  test('拒绝缺失的原因父节点和结论原因', () => {
    const index = createValidIndex()
    const [cause] = index.causes
    const [outcome] = index.outcomes
    cause!.parentCauseCode = 'missing-parent'
    outcome!.causeCode = 'missing-cause'
    expect(issueCodes(index)).toEqual(
      expect.arrayContaining(['MISSING_CAUSE_PARENT', 'MISSING_OUTCOME_CAUSE'])
    )
  })

  // Edge U2：自指或多节点父链环会使原因分类无法形成有限层级。
  test('拒绝成环的园艺原因父链', () => {
    const index = createValidIndex()
    index.causes = [
      { causeCode: 'water-stress', parentCauseCode: 'abiotic' },
      { causeCode: 'abiotic', parentCauseCode: 'water-stress' }
    ]
    expect(issueCodes(index)).toContain('CAUSE_PARENT_CYCLE')
  })

  // Edge U3：JSON 内题包/鉴别结果没有关系外键，必须在应用层核验。
  test('拒绝未发布症状入口和缺失的备选结论', () => {
    const index = createValidIndex()
    const [outcome] = index.outcomes
    outcome!.symptomModeRefs = [
      { symptomModeCode: 'unpublished-pest', questionPackageReleaseRef: 'pest-v1' }
    ]
    outcome!.differentialOutcomeCodes = ['missing-outcome']
    expect(issueCodes(index)).toEqual(
      expect.arrayContaining(['UNKNOWN_SYMPTOM_MODE', 'MISSING_DIFFERENTIAL_OUTCOME'])
    )
  })

  // Reverse：相同症状代码不能从已发布题包 v1 静默换成另一个版本。
  test('拒绝与锁定题包不一致的 release 引用', () => {
    const index = createValidIndex()
    const [outcome] = index.outcomes
    outcome!.symptomModeRefs = [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'yellow-leaf-v2' }
    ]
    expect(issueCodes(index)).toContain('MISMATCHED_QUESTION_PACKAGE_RELEASE')
  })

  // Edge U3：结论—行动映射只能指向同候选的已列条目。
  test('拒绝映射中的缺失结论与行动', () => {
    const index = createValidIndex()
    const [mapping] = index.mappings
    mapping!.outcomeCode = 'other-bundle-outcome'
    mapping!.actionCode = 'other-bundle-action'
    expect(issueCodes(index)).toEqual(
      expect.arrayContaining(['MISSING_MAPPING_OUTCOME', 'MISSING_MAPPING_ACTION'])
    )
  })

  // Reverse：来源主张必须是精确修订，不得自动落到相同代码的“最新版”。
  test('拒绝不存在的来源主张修订与不存在的关联目标', () => {
    const index = createValidIndex()
    const [causeLink, outcomeLink] = index.claimLinks
    causeLink!.revisionNo = 2
    outcomeLink!.targetCode = 'other-bundle-outcome'
    expect(issueCodes(index)).toEqual(
      expect.arrayContaining(['MISSING_CLAIM_REVISION', 'MISSING_CLAIM_TARGET'])
    )
  })

  // Reverse：没有逐项来源的知识不能凭完整的展示文案发布。
  test('拒绝缺少逐项来源的行动与映射', () => {
    const index = createValidIndex()
    index.claimLinks = index.claimLinks.filter(
      link => link.targetKind !== 'action' && link.targetKind !== 'mapping'
    )
    expect(issueCodes(index)).toEqual(expect.arrayContaining(['MISSING_SOURCE_LINK']))
  })

  // Reverse：高风险行动必须有明确安全角色的来源主张，普通支持关系不能替代。
  test('拒绝没有安全主张的高风险行动', () => {
    const index = createValidIndex()
    const [action] = index.actions
    action!.riskLevel = 'high'
    expect(issueCodes(index)).toContain('MISSING_SAFETY_CLAIM')
  })

  // Edge U3：代码重名会使同包引用产生歧义，即使展示文案不同也必须拒绝。
  test('拒绝候选内重复的稳定代码', () => {
    const index = createValidIndex()
    index.actions.push({ actionCode: 'inspect-soil', riskLevel: 'low' })
    expect(issueCodes(index)).toContain('DUPLICATE_ACTION_CODE')
  })
})
