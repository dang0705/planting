import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/** 独立合同制品路径；测试读取实际交付 Schema，不从被测校验器生成期望。 */
const schemaPath = resolve(
  findProjectRoot(),
  'docs/backend-v2/contracts/schemas/diagnosis-knowledge-reference-index.v1.schema.json'
)

/** 已冻结关系索引的最小有效样本，不代表一份已审核园艺知识。 */
function validIndex(): Record<string, unknown> {
  return {
    publishedSymptomModes: [
      { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
    ],
    verifiedClaimRevisions: [
      { sourceCode: 'extension', claimCode: 'yellow-multicausal', revisionNo: 1 }
    ],
    causes: [{ causeCode: 'undetermined', parentCauseCode: null }],
    outcomes: [
      {
        outcomeCode: 'needs-more-evidence',
        causeCode: 'undetermined',
        symptomModeRefs: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
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
        sourceCode: 'extension',
        claimCode: 'yellow-multicausal',
        revisionNo: 1,
        linkRole: 'support'
      },
      {
        targetKind: 'outcome',
        targetCode: 'needs-more-evidence',
        sourceCode: 'extension',
        claimCode: 'yellow-multicausal',
        revisionNo: 1,
        linkRole: 'limit'
      }
    ]
  }
}

/** 编译实际 JSON Schema；不存在时作为测试先行的 RED。 */
function validateIndex() {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

describe('诊断知识单候选关系索引结构合同', () => {
  test('接受保留待判定结论且没有行动的同版索引', () => {
    expect(validateIndex()(validIndex())).toBe(true)
  })

  test('拒绝题包发布引用缺失', () => {
    const index = validIndex()
    index.publishedSymptomModes = [{ symptomModeCode: 'yellow_leaf' }]
    expect(validateIndex()(index)).toBe(false)
  })

  test('拒绝来源主张修订号为非整数或负数', () => {
    const index = validIndex()
    index.verifiedClaimRevisions = [
      { sourceCode: 'extension', claimCode: 'yellow-multicausal', revisionNo: -1 }
    ]
    expect(validateIndex()(index)).toBe(false)
    index.verifiedClaimRevisions = [
      { sourceCode: 'extension', claimCode: 'yellow-multicausal', revisionNo: 1.5 }
    ]
    expect(validateIndex()(index)).toBe(false)
  })

  test('拒绝数组元素洞和 null 条目', () => {
    const index = validIndex()
    index.outcomes = [null]
    expect(validateIndex()(index)).toBe(false)
    index.outcomes = [undefined]
    expect(validateIndex()(index)).toBe(false)
  })

  test('拒绝未知风险等级、关联角色和多余内部字段', () => {
    const index = validIndex()
    index.actions = [{ actionCode: 'observe', riskLevel: 'unreviewed' }]
    expect(validateIndex()(index)).toBe(false)
    index.actions = []
    const [firstLink] = index.claimLinks as Array<Record<string, unknown>>
    firstLink!.linkRole = 'auto_publish'
    expect(validateIndex()(index)).toBe(false)
    firstLink!.linkRole = 'support'
    index.internalId = 12
    expect(validateIndex()(index)).toBe(false)
  })
})
