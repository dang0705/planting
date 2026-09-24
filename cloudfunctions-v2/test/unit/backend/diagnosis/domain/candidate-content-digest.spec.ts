import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../../../../support/project-root.js'
import { calculateCandidateContentSha256 } from '../../../../../src/diagnosis/domain/candidate-content-digest.js'

type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject
type JsonObject = { [key: string]: JsonValue }

const EXPECTED_CANONICAL_JSON =
  '{"actions":[],"bundleCode":"yellow_leaf","causes":[{"applicablePlantScope":{"allowUnknownIdentity":true,"mode":"all_reviewed","taxa":[]},"causeCategory":"undetermined","causeCode":"undetermined","definitionZh":"证据不足。","displayNameZh":"原因待判定","parentCauseCode":null}],"claimLinks":[{"claimCode":"multi-cause","linkRole":"limit","revisionNo":1,"sourceCode":"reviewed-source","targetCode":"needs-evidence","targetKind":"outcome"},{"claimCode":"multi-cause","linkRole":"support","revisionNo":1,"sourceCode":"reviewed-source","targetCode":"undetermined","targetKind":"cause"}],"mappings":[],"outcomes":[{"affectedPartCodes":["leaf"],"applicablePlantScope":{"allowUnknownIdentity":true,"mode":"all_reviewed","taxa":[]},"causeCode":"undetermined","conflictPolicy":"defer","differentialOutcomeCodes":[],"displayNameZh":"仍需补充证据","evidenceRules":{"opposing":[],"required":[],"supporting":[]},"followUpCriteria":[],"isolationPolicy":{"fallback":"undetermined","rules":[]},"outcomeCode":"needs-evidence","problemTypeCode":"undetermined","severityCriteria":[],"summaryZh":"暂不能判断。","symptomModeRefs":[{"questionPackageReleaseRef":"question-yellow/v1","symptomModeCode":"yellow_leaf"}],"uncertaintyPolicy":"unconfirmed_when_insufficient","urgencyPolicy":{"fallback":"unknown","rules":[]}}],"revisionNo":1,"schemaVersion":"diagnosis-knowledge-candidate/v1","symptomModeRefs":[{"questionPackageReleaseRef":"question-yellow/v1","symptomModeCode":"yellow_leaf"}]}'
const EXPECTED_CANDIDATE_SHA256 = 'f602675f2c13dabae9a79906457f32251897bfdd797e2e526d807535e0f45292'
const EXPECTED_NULL_ARRAY_CANONICAL_JSON = '{"values":[null]}'
const EXPECTED_NULL_ARRAY_SHA256 =
  '4bcd6a994ecf64682ec3e8c766c415c4765e070a09b4250701144a36db79dde0'

/**
 * 独立 Expected 来源：诊断知识持久化合同摘要规则与候选结构 v1 Schema。
 * 层次为 unit_fake / L1：固定候选向量已通过 Schema；null/undefined/稀疏洞用例只检验
 * JSON 序列化边界，不代表候选 v1 Schema 允许含 null 的业务数组。
 * 本组不证明真实 CMS/来源状态、候选条件语义或发布事务。
 */
function validCandidate(): JsonObject {
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
        definitionZh: '证据不足。',
        applicablePlantScope: { mode: 'all_reviewed', taxa: [], allowUnknownIdentity: true }
      }
    ],
    outcomes: [
      {
        outcomeCode: 'needs-evidence',
        causeCode: 'undetermined',
        displayNameZh: '仍需补充证据',
        summaryZh: '暂不能判断。',
        problemTypeCode: 'undetermined',
        symptomModeRefs: [
          { symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }
        ],
        affectedPartCodes: ['leaf'],
        applicablePlantScope: { mode: 'all_reviewed', taxa: [], allowUnknownIdentity: true },
        evidenceRules: { required: [], supporting: [], opposing: [] },
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
        targetKind: 'outcome',
        targetCode: 'needs-evidence',
        sourceCode: 'reviewed-source',
        claimCode: 'multi-cause',
        revisionNo: 1,
        linkRole: 'limit'
      },
      {
        targetKind: 'cause',
        targetCode: 'undetermined',
        sourceCode: 'reviewed-source',
        claimCode: 'multi-cause',
        revisionNo: 1,
        linkRole: 'support'
      }
    ]
  }
}

/** 使用独立 JSON Schema 制品确认摘要样例完整，不从摘要器反推 Expected。 */
function loadCandidateValidator() {
  const schemaPath = resolve(
    findProjectRoot(),
    'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'
  )
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

const validateCandidate = loadCandidateValidator()

/** 重建相同 JSON 值但反转每层对象键的插入顺序，数组顺序保持不变。 */
function reverseObjectKeyInsertionOrder(value: JsonValue): JsonValue {
  if (Array.isArray(value)) {
    return value.map(reverseObjectKeyInsertionOrder)
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).reverse()
    return Object.fromEntries(
      entries.map(([key, nestedValue]) => [key, reverseObjectKeyInsertionOrder(nestedValue)])
    ) as JsonObject
  }
  return value
}

describe('诊断知识完整候选内容摘要', () => {
  test('递归排序对象键并以紧凑 UTF-8 序列化得到固定 SHA-256', () => {
    const candidate = validCandidate()
    const reorderedKeys = reverseObjectKeyInsertionOrder(candidate)

    expect(validateCandidate(candidate)).toBe(true)
    expect(validateCandidate(reorderedKeys)).toBe(true)
    expect(createHash('sha256').update(EXPECTED_CANONICAL_JSON, 'utf8').digest('hex')).toBe(
      EXPECTED_CANDIDATE_SHA256
    )
    expect(calculateCandidateContentSha256(candidate)).toBe(EXPECTED_CANDIDATE_SHA256)
    expect(calculateCandidateContentSha256(reorderedKeys as JsonObject)).toBe(
      EXPECTED_CANDIDATE_SHA256
    )
  })

  test('数组原有顺序属于候选内容，不自动排序成同一摘要', () => {
    const candidate = validCandidate()
    const claimLinks = candidate.claimLinks as JsonObject[]
    claimLinks.reverse()

    expect(validateCandidate(candidate)).toBe(true)
    expect(calculateCandidateContentSha256(candidate)).toBe(
      'f7cf61f569c95745a53467530fcac768e15a27762614daeee3e59d3ea976600d'
    )
  })

  test('精确来源主张修订变化会改变候选摘要', () => {
    const candidate = validCandidate()
    const [firstClaimLink] = candidate.claimLinks as JsonObject[]
    firstClaimLink!.revisionNo = 2

    expect(validateCandidate(candidate)).toBe(true)
    expect(calculateCandidateContentSha256(candidate)).not.toBe(EXPECTED_CANDIDATE_SHA256)
  })

  test('题包精确发布引用变化会改变候选摘要', () => {
    const candidate = validCandidate()
    const [firstSymptomModeRef] = candidate.symptomModeRefs as JsonObject[]
    firstSymptomModeRef!.questionPackageReleaseRef = 'question-yellow/v2'

    expect(validateCandidate(candidate)).toBe(true)
    expect(calculateCandidateContentSha256(candidate)).not.toBe(EXPECTED_CANDIDATE_SHA256)
  })

  test('JSON 数组中的 null 保留为合法 JSON 值', () => {
    expect(
      createHash('sha256').update(EXPECTED_NULL_ARRAY_CANONICAL_JSON, 'utf8').digest('hex')
    ).toBe(EXPECTED_NULL_ARRAY_SHA256)
    expect(calculateCandidateContentSha256({ values: [null] })).toBe(EXPECTED_NULL_ARRAY_SHA256)
  })

  test('拒绝 JSON 数组中的 undefined', () => {
    const candidateWithUndefined = { values: [undefined] } as unknown as JsonObject

    expect(() => calculateCandidateContentSha256(candidateWithUndefined)).toThrow(TypeError)
  })

  test('拒绝 JSON 数组中的稀疏元素洞', () => {
    const sparseArray = Array<JsonValue>(Number('1'))
    const candidateWithHole: JsonObject = { values: sparseArray }

    expect(() => calculateCandidateContentSha256(candidateWithHole)).toThrow(TypeError)
  })
})
