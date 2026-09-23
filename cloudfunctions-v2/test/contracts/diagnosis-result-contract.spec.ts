import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：docs/backend-v2/contracts/diagnosis-outcome-fields.md 的「本次诊断结果」
 * 与用户提供的一隅结果页截图。截图只锁定信息分区，不证明具体处置或百分比正确。
 * 测试层次：unit_real_data；编译真实合同文件，不调用模型、CMS、MySQL 或 HTTP。
 */
const schemaPath = path.join(
  findProjectRoot(),
  'docs/backend-v2/contracts/schemas/diagnosis-result.v1.schema.json'
)

/** 一次证据不足的结果仍须把不确定性、缺口与行动边界表达完整。 */
const validResult = {
  contractVersion: 'diagnosis-result/v1',
  titleZh: '叶尖受损，原因仍需核对',
  summaryZh: '目前只看到叶尖局部变化，不能仅凭这张照片确认病因。',
  problemType: '养护或环境相关问题',
  causeCategory: '待判定',
  certaintyLevel: 'unconfirmed',
  certaintyReasonZh: '缺少叶背、盆土和近期养护信息。',
  severityLevel: 'unknown',
  urgencyLevel: 'unknown',
  urgencyReasonZh: '现有画面不能判断整株受损范围。',
  isolationDecision: 'undetermined',
  isolationReasonZh: '没有观察到叶背与其他叶片，暂不能判断传染风险。',
  evidenceFindings: [
    {
      observationZh: '画面中的叶尖有局部干枯。',
      affectedPartZh: '叶尖',
      sourceType: 'image',
      direction: 'supports',
      coverageZh: '仅覆盖所拍摄叶片的正面。'
    }
  ],
  evidenceLimitations: [
    {
      limitationZh: '未拍摄叶背。',
      impactZh: '无法检查叶背虫体或病斑。',
      nextEvidenceZh: '补拍受损叶片的叶背。'
    }
  ],
  missingEvidence: [{ needZh: '近期浇水与盆土状态', reasonZh: '用于区分水分压力与其他原因。' }],
  alternativeOutcomes: [],
  recommendedActions: [
    {
      displayCategory: 'immediate',
      titleZh: '先检查受损叶片和盆土',
      purposeZh: '补充会改变结论的证据。',
      stepsZh: ['检查叶背，并记录盆土表面状态。'],
      selectionReasonZh: '现有证据不足，优先补充观察。',
      safetyNotesZh: [],
      contraindicationsZh: [],
      followUpZh: '观察新叶是否继续出现类似损伤。',
      requiresUserConfirmation: true
    }
  ],
  followUp: {
    observationsZh: ['新叶和其他叶片是否出现同类变化。'],
    escalationZh: '若损伤快速扩大，应重新诊断。'
  },
  publicSources: [
    {
      sourceTypeZh: '园艺机构资料',
      titleZh: '经审核资料示例',
      applicabilityZh: '仅用于说明证据局限和补充观察的必要性。'
    }
  ],
  knowledgeVersionZh: '诊断知识示例版本 v1'
}

const [firstFinding] = validResult.evidenceFindings
const [firstAction] = validResult.recommendedActions
const [firstSource] = validResult.publicSources

function createValidator() {
  assert.ok(fs.existsSync(schemaPath), `缺少本次诊断结果 Schema：${schemaPath}`)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

describe('本次诊断结果公开结构合同', () => {
  // Happy：完整结果必须容纳截图的信息密度，同时把证据缺口和行动确认边界写清楚。
  test('接受包含证据、限制、其他可能和分层行动的结构化结果', () => {
    expect(createValidator()(validResult)).toBe(true)
  })

  // Edge U1：结论不能靠缺省值填成「低风险」或「不需隔离」。
  test.each(['certaintyReasonZh', 'urgencyReasonZh', 'isolationReasonZh', 'evidenceLimitations'])(
    '拒绝缺少判断依据或证据限制：%s',
    field => {
      const result = { ...validResult } as Record<string, unknown>
      delete result[field]
      expect(createValidator()(result)).toBe(false)
    }
  )

  // Edge U1：证据数组的元素洞不能被过滤后当作有效证据。
  test('拒绝证据数组中的空元素及没有公开来源的结果', () => {
    expect(createValidator()({ ...validResult, evidenceFindings: [null, firstFinding] })).toBe(
      false
    )
    expect(createValidator()({ ...validResult, publicSources: [] })).toBe(false)
  })

  // Edge U3：公开结果不能混入数据库主键、原始模型内容或未经审核的行动字段。
  test.each([
    ['内部主键', { ...validResult, internalId: 42 }],
    ['原始模型输出', { ...validResult, rawModelOutput: 'private' }],
    [
      '未经审核药剂用量',
      {
        ...validResult,
        recommendedActions: [{ ...firstAction, drugDose: 'unreviewed' }]
      }
    ]
  ])('拒绝公开结果中的内部或未经合同定义的字段：%s', (_name, result) => {
    expect(createValidator()(result)).toBe(false)
  })

  // Reverse：模型自评百分比不能直接成为公开诊断的置信概率。
  test('拒绝模型自评百分比', () => {
    expect(createValidator()({ ...validResult, confidencePercent: 75 })).toBe(false)
  })

  // Edge U3：结构合同仅允许 HTTPS 公共来源；域名及许可由发布/响应层再次校验。
  test('拒绝不安全的公开来源链接', () => {
    const result = {
      ...validResult,
      publicSources: [{ ...firstSource, url: 'http://example.org/source' }]
    }
    expect(createValidator()(result)).toBe(false)
  })

  // Reverse：建议仍须用户确认，不能通过结构合同写成事实或计划。
  test('拒绝不需要用户确认的行动', () => {
    const result = {
      ...validResult,
      recommendedActions: [{ ...firstAction, requiresUserConfirmation: false }]
    }
    expect(createValidator()(result)).toBe(false)
  })
})
