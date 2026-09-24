import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

const SCHEMA_PATH = resolve(
  findProjectRoot(),
  'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
)

/**
 * 独立 Expected 来源：诊断知识来源、Outcome/Action 字段及持久化合同。
 * 这只是结构测试样本，不是已审核植物病因、处置或真实 CMS 内容。
 */
function validCandidate(): Record<string, unknown> {
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

/** 来源于受审行动字段合同的结构样本，不代表该行动已有园艺审核。 */
function validAction(): Record<string, unknown> {
  return {
    actionCode: 'inspect',
    displayCategory: 'immediate',
    titleZh: '检查受损部位',
    purposeZh: '补充可观察证据。',
    stepsZh: ['观察叶背。'],
    applicabilityConditions: [],
    contraindications: [],
    stopConditions: [],
    riskLevel: 'low',
    safetyNotesZh: '观察时避免损伤健康组织。',
    followUpCriteria: []
  }
}

/** 编译本仓库交付的 JSON Schema，不以测试中的样本生成 Schema。 */
function validateCandidate() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

describe('诊断知识完整候选结构合同', () => {
  test('接受有来源的待判定结论而不强迫生成行动', () => {
    expect(validateCandidate()(validCandidate())).toBe(true)
  })

  test('接受结构合格的独立行动及结论—行动映射', () => {
    const candidate = validCandidate()
    candidate.actions = [validAction()]
    candidate.mappings = [
      {
        mappingCode: 'inspect-undetermined',
        outcomeCode: 'needs-more-evidence',
        actionCode: 'inspect',
        matchingConditions: [],
        contraindicationPriority: 1,
        sequenceNo: 1
      }
    ]
    candidate.claimLinks = [
      ...(candidate.claimLinks as unknown[]),
      {
        targetKind: 'action',
        targetCode: 'inspect',
        sourceCode: 'reviewed-source',
        claimCode: 'safe-inspection',
        revisionNo: 1,
        linkRole: 'safety'
      },
      {
        targetKind: 'mapping',
        targetCode: 'inspect-undetermined',
        sourceCode: 'reviewed-source',
        claimCode: 'safe-inspection',
        revisionNo: 1,
        linkRole: 'support'
      }
    ]
    expect(validateCandidate()(candidate)).toBe(true)
  })

  test('拒绝遗漏结论证据门和隔离门的候选', () => {
    const candidate = validCandidate()
    const [outcome] = candidate.outcomes as Array<Record<string, unknown>>
    delete outcome!.evidenceRules
    delete outcome!.isolationPolicy
    expect(validateCandidate()(candidate)).toBe(false)
  })

  test('拒绝原因、结论或行动数组内的 null 元素', () => {
    const candidate = validCandidate()
    candidate.causes = [null]
    expect(validateCandidate()(candidate)).toBe(false)
    candidate.causes = validCandidate().causes
    candidate.outcomes = [null]
    expect(validateCandidate()(candidate)).toBe(false)
    candidate.outcomes = validCandidate().outcomes
    candidate.actions = [null]
    expect(validateCandidate()(candidate)).toBe(false)
  })

  test('拒绝自由注入模型置信度与未受审操作字段', () => {
    const candidate = validCandidate()
    const [outcome] = candidate.outcomes as Array<Record<string, unknown>>
    outcome!.modelConfidencePercent = 75
    expect(validateCandidate()(candidate)).toBe(false)
    delete outcome!.modelConfidencePercent
    const action = { ...validAction(), unreviewedDrugDose: '随意使用' }
    candidate.actions = [action]
    expect(validateCandidate()(candidate)).toBe(false)
  })

  test('拒绝未知园艺原因分类、风险等级和空白步骤', () => {
    const candidate = validCandidate()
    const [cause] = candidate.causes as Array<Record<string, unknown>>
    cause!.causeCategory = 'yellow_leaf'
    expect(validateCandidate()(candidate)).toBe(false)
    cause!.causeCategory = 'undetermined'
    candidate.actions = [{ ...validAction(), stepsZh: ['  '], riskLevel: 'unknown' }]
    expect(validateCandidate()(candidate)).toBe(false)
  })

  test('行动标题不能超过 SQL 同名列长度，安全说明必须是受审文本', () => {
    const candidate = validCandidate()
    candidate.actions = [{ ...validAction(), titleZh: '叶'.repeat(192) }]
    expect(validateCandidate()(candidate)).toBe(false)
    candidate.actions = [{ ...validAction(), safetyNotesZh: [] }]
    expect(validateCandidate()(candidate)).toBe(false)
  })

  test('结论展示名不能超过 SQL 同名列长度', () => {
    const candidate = validCandidate()
    const [outcome] = candidate.outcomes as Array<Record<string, unknown>>
    outcome!.displayNameZh = '叶'.repeat(192)
    expect(validateCandidate()(candidate)).toBe(false)
  })

  test('拒绝审核候选把隔离或紧急程度缺省为未经证实的安全结论', () => {
    const candidate = validCandidate()
    const [outcome] = candidate.outcomes as Array<Record<string, unknown>>
    outcome!.isolationPolicy = { rules: [], fallback: 'not_required' }
    expect(validateCandidate()(candidate)).toBe(false)
    outcome!.isolationPolicy = { rules: [], fallback: 'undetermined' }
    outcome!.urgencyPolicy = { rules: [], fallback: 'monitor' }
    expect(validateCandidate()(candidate)).toBe(false)
  })
})
