import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { describe, expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createDiagnosisCandidatePreparation, type CandidateDependencyRequest } from '../../src/diagnosis/application/prepare-knowledge-candidate.js'

/**
 * L3 / unit_fake：Expected来自冻结候选与引用Schema、E05票据和原样审核摘要合同。
 * 真实执行AJV、完整JSON锁定、引用闭合与摘要；只替换来源/题包读取边界。
 * 结构样本不是已审核园艺内容；未覆盖真实MySQL、CMS、HTTP或知识发布。
 */
const schemas = () => ({
  candidate: JSON.parse(readFileSync(resolve(findProjectRoot(), 'docs/backend-v2/contracts/schemas/diagnosis-knowledge-candidate.v1.schema.json'), 'utf8')) as object,
  dependencies: JSON.parse(readFileSync(resolve(findProjectRoot(), 'docs/backend-v2/contracts/schemas/diagnosis-knowledge-reference-index.v1.schema.json'), 'utf8')) as object,
})

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


const verified = () => ({
  publishedSymptomModes: [{ symptomModeCode: 'yellow_leaf', questionPackageReleaseRef: 'question-yellow/v1' }],
  verifiedClaimRevisions: [{ sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }],
})

/** 独立测试序列化：固定合同的递归键排序与原数组顺序，不调用被测摘要函数。 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) {return `[${value.map(canonical).join(',')}]`}
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Record<string, unknown>)[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

describe('完整候选接收与引用审核准备', () => {
  test('真实Schema→依赖→闭合→摘要，只得到待人工审核候选', async () => {
    const read = vi.fn(async (_request: CandidateDependencyRequest) => verified())
    const input = validCandidate()
    const expectedHash = createHash('sha256').update(canonical(input)).digest('hex')
    const result = await createDiagnosisCandidatePreparation(schemas(), { read })(input)
    expect(result.status).toBe('prepared_for_review')
    if (result.status !== 'prepared_for_review') {throw new Error('候选应进入审核准备')}
    expect(result.contentSha256).toBe(expectedHash)
    expect(result.candidate).toEqual(input)
    expect(Object.isFrozen(result.candidate)).toBe(true)
    expect(Object.isFrozen(result.candidate.outcomes)).toBe(true)
    expect(read).toHaveBeenCalledTimes(1)
    expect(read.mock.calls[0]?.[0]).toEqual({
      symptomModeRefs: input.symptomModeRefs,
      claimRevisions: [{ sourceCode: 'reviewed-source', claimCode: 'multi-cause', revisionNo: 1 }],
    })
  })

  test.each([null, {}, { ...validCandidate(), modelConfidencePercent: 99 }])('非法候选整份拒绝且不读依赖 %#', async input => {
    const read = vi.fn(async () => verified())
    expect(await createDiagnosisCandidatePreparation(schemas(), { read })(input)).toEqual({ status: 'invalid_candidate' })
    expect(read).not.toHaveBeenCalled()
  })

  test('未发布题包不能得到待审核完整快照', async () => {
    const result = await createDiagnosisCandidatePreparation(schemas(), {
      read: async () => ({ ...verified(), publishedSymptomModes: [] }),
    })(validCandidate())
    expect(result.status).toBe('invalid_references')
    if (result.status !== 'invalid_references') {throw new Error('应拒绝未发布题包')}
    expect(result.issues.map(x => x.code)).toContain('UNPUBLISHED_CANDIDATE_QUESTION_PACKAGE')
  })

  test('未验证来源主张拒绝，不能用结构校验冒充来源审核', async () => {
    const result = await createDiagnosisCandidatePreparation(schemas(), {
      read: async () => ({ ...verified(), verifiedClaimRevisions: [] }),
    })(validCandidate())
    expect(result.status).toBe('invalid_references')
  })

  test('等待来源读回时调用方修改内容，不影响本次锁定快照与摘要', async () => {
    const input = validCandidate()
    const expected = structuredClone(input)
    const prepare = createDiagnosisCandidatePreparation(schemas(), { read: async () => {
      (input.outcomes as Array<Record<string, unknown>>)[0]!.summaryZh = '被替换的正文'
      return verified()
    } })
    const result = await prepare(input)
    expect(result.status).toBe('prepared_for_review')
    if (result.status !== 'prepared_for_review') {throw new Error('原候选应可准备')}
    expect(result.candidate).toEqual(expected)
    expect(result.contentSha256).toBe(createHash('sha256').update(canonical(expected)).digest('hex'))
  })

  test('来源读取失败传播给受控上层，不返回虚假审核候选', async () => {
    const failure = new Error('测试依赖不可用')
    await expect(createDiagnosisCandidatePreparation(schemas(), { read: async () => { throw failure } })(validCandidate())).rejects.toBe(failure)
  })

  test('依赖返回非法主张修订号时失败关闭', async () => {
    const dependencies = verified()
    // 冻结索引Schema允许0，负数才违反unsigned合同；不能靠猜测起始修订号拒绝0。
    dependencies.verifiedClaimRevisions[0]!.revisionNo = -1
    expect(await createDiagnosisCandidatePreparation(schemas(), { read: async () => dependencies })(validCandidate())).toEqual({ status: 'invalid_dependencies' })
  })

  test('非JSON值不能借Schema检查或JSON转换丢失内容', async () => {
    const input = validCandidate()
    input.revisionNo = new Number(1)
    const read = vi.fn(async () => verified())
    expect(await createDiagnosisCandidatePreparation(schemas(), { read })(input)).toEqual({ status: 'invalid_candidate' })
    expect(read).not.toHaveBeenCalled()
  })
})
