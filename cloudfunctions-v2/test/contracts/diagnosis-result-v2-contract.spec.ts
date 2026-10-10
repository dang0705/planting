import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-10 裁决（视觉诊断改为受约束的生成式），
 * docs/backend-v2/architecture/visual-diagnosis-plan-2026-10-10.md §2.3 C10 与 §5 安全门：
 * 不给剂量、可食用须提示安全间隔期、高风险须理由、生成内容须标注 AI 生成、v1 不动。
 * 测试层次：unit_real_data；编译真实合同文件，不调用模型、CMS、MySQL 或 HTTP。
 * 未覆盖：服务端正则/词典安全门、编号先行的键顺序检查、模型输出到公开结果的投影。
 */
const root = findProjectRoot()
const schemaPath = path.join(
  root,
  'docs/backend-v2/contracts/schemas/diagnosis-result.v2.schema.json'
)
const v1SchemaPath = path.join(
  root,
  'docs/backend-v2/contracts/schemas/diagnosis-result.v1.schema.json'
)
const allowlistPath = path.join(
  root,
  'docs/backend-v2/contracts/diagnosis-visual-gen-agent-allowlist.v1.json'
)

/** 一条受约束生成的用药行动：低毒药剂、按标签用量、可食用安全间隔期、风险理由齐全。 */
const generatedAgentAction = {
  displayCategory: 'immediate',
  generationSource: 'model_constrained',
  titleZh: '选用低毒药剂',
  purposeZh: '虫口较多时减少粉虱数量。',
  stepsZh: ['可选苦参碱，重点喷叶背，按产品标签的用量和间隔连续处理。'],
  selectionReasonZh: '叶背可见成虫和若虫，仅冲洗难以清除。',
  applicabilityZh: '适用于本次拍摄的盆栽番茄。',
  riskLevel: 'moderate',
  riskReasonZh: '虫口较多，选用低毒生物源药剂。',
  agentNamesZh: ['苦参碱'],
  labelDosageNotice: true,
  edibleSafetyIntervalNotice: true,
  safetyNotesZh: ['先在少量叶片试用。'],
  contraindicationsZh: [],
  stopConditionsZh: ['叶片出现灼伤时停止使用。'],
  followUpZh: '几天后复查叶背若虫。',
  publicSources: [],
  aiGeneratedNotice: true,
  requiresUserConfirmation: true
}

/** 受约束生成的公开结果：编号已由服务端归约为中文展示，内容标注 AI 生成。 */
const validResult = {
  contractVersion: 'diagnosis-result/v2',
  generationSource: 'model_constrained',
  aiGeneratedNoticeZh: '以下内容由 AI 根据照片生成，仅作远程参考。',
  edibleContext: 'yes',
  titleZh: '白粉虱虫害',
  summaryZh: '叶背可见大量粉虱成虫和若虫，较可能是白粉虱危害。',
  problemType: '刺吸式害虫危害',
  causeCategory: '虫害',
  certaintyLevel: 'likely',
  certaintyReasonZh: '叶背同时看到成虫和固定若虫两种直接证据。',
  severityLevel: 'medium',
  severityReasonZh: '虫口较多但新叶仍正常。',
  urgencyLevel: 'immediate',
  urgencyReasonZh: '粉虱繁殖快，会继续吸汁并诱发煤污。',
  isolationDecision: 'required',
  isolationReasonZh: '成虫会飞，容易扩散到周围植物。',
  evidenceFindings: [
    {
      observationZh: '叶背聚集白色小飞虫和椭圆扁平若虫。',
      affectedPartZh: '叶背',
      sourceType: 'image',
      direction: 'supports',
      coverageZh: '仅覆盖所拍摄的叶片。'
    }
  ],
  evidenceLimitations: [],
  missingEvidence: [],
  alternativeOutcomes: [],
  recommendedActions: [generatedAgentAction],
  followUp: {
    observationsZh: ['叶背是否仍有新若虫。'],
    escalationZh: '连续处理后虫量仍不下降时建议线下核验。'
  },
  publicSources: [],
  knowledgeVersionZh: '视觉诊断生成式版本组 v1'
}

function createValidator() {
  assert.ok(fs.existsSync(schemaPath), `缺少公开诊断结果 v2 Schema：${schemaPath}`)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

function withAction(patch: Record<string, unknown>, omit: string[] = []) {
  const action = { ...generatedAgentAction, ...patch } as Record<string, unknown>
  omit.forEach(key => delete action[key])
  return { ...validResult, recommendedActions: [action] }
}

describe('公开诊断结果 v2（受约束生成式）结构合同', () => {
  // Happy：竞品式完整内容在生成式来源下可以没有逐项公开来源，但必须标注 AI 生成。
  test('接受带用药安全提示的受约束生成结果', () => {
    expect(createValidator()(validResult)).toBe(true)
  })

  // Reverse：v1 合同保持不变，仍要求逐项公开来源（C10「不改 v1」）。
  test('v1 Schema 保持原样：版本常量仍为 diagnosis-result/v1', () => {
    const v1 = JSON.parse(fs.readFileSync(v1SchemaPath, 'utf8')) as {
      properties: { contractVersion: { const: string } }
    }
    expect(v1.properties.contractVersion.const).toBe('diagnosis-result/v1')
  })

  // Edge：生成内容缺少 AI 生成标注时拒绝（顶层与行动两级）。
  test('拒绝缺少 AI 生成标注的生成式结果或行动', () => {
    const top = { ...validResult } as Record<string, unknown>
    delete top.aiGeneratedNoticeZh
    expect(createValidator()(top)).toBe(false)
    expect(createValidator()(withAction({}, ['aiGeneratedNotice']))).toBe(false)
  })

  // Reverse：已审核知识来源仍须逐项公开来源，不能借 v2 绕过。
  test('已审核知识来源的行动与结果仍须公开来源', () => {
    expect(
      createValidator()({
        ...validResult,
        generationSource: 'reviewed_knowledge',
        recommendedActions: [
          { ...generatedAgentAction, generationSource: 'reviewed_knowledge', publicSources: [] }
        ]
      })
    ).toBe(false)
  })

  // 安全门：不给剂量（生成式步骤中出现数字剂量即拒绝）。
  test.each([
    '苦参碱稀释1000倍后喷施叶背。',
    '每升水加 2 毫升药剂。',
    '用 0.3% 浓度喷施。',
    '每次用药 5ml。'
  ])('拒绝生成式步骤中的剂量：%s', step => {
    expect(createValidator()(withAction({ stepsZh: [step] }))).toBe(false)
  })

  // 用户 2026-10-10 裁定 D15：重复处理只能用通用表述，禁止具体天数和次数（仅约束涉及药剂的生成式步骤）。
  test('接受通用的重复处理表述', () => {
    expect(
      createValidator()(withAction({ stepsZh: ['按产品标签的间隔重复处理，并在下次处理前复查。'] }))
    ).toBe(true)
  })

  test.each(['每隔 7 天喷一次。', '连续喷 3 次。', '间隔 5～7 天复喷。', '3 天后再喷一次。'])(
    '拒绝用药步骤中的具体间隔或次数：%s',
    step => {
      expect(createValidator()(withAction({ stepsZh: [step] }))).toBe(false)
    }
  )

  test('不涉及药剂的生成式步骤可以写观察天数与次数', () => {
    const action = withAction({ stepsZh: ['浇透后 2～3 天检查盆土，浇水 2 次后再观察新叶。'] }, [
      'agentNamesZh',
      'labelDosageNotice',
      'edibleSafetyIntervalNotice'
    ])
    expect(createValidator()(action)).toBe(true)
  })

  test('合同 C2 写明重复处理的允许表述与禁止示例', () => {
    const contract = fs.readFileSync(
      path.join(root, 'docs/backend-v2/contracts/diagnosis-rich-response-experiment.md'),
      'utf8'
    )
    expect(contract).toContain('按产品标签的间隔重复处理，并在下次处理前复查')
    expect(contract).toContain('每 7 天喷一次')
  })

  // 安全门：用药必须提示按产品标签。
  test('拒绝缺少按标签用量提示的用药行动', () => {
    expect(createValidator()(withAction({}, ['labelDosageNotice']))).toBe(false)
    expect(createValidator()(withAction({ labelDosageNotice: false }))).toBe(false)
  })

  // 安全门：可食用或可食用性未知时用药，必须提示安全间隔期。
  test.each(['yes', 'unknown'])('可食用背景=%s 时拒绝缺少安全间隔期提示', edibleContext => {
    const result = { ...withAction({}, ['edibleSafetyIntervalNotice']), edibleContext }
    expect(createValidator()(result)).toBe(false)
  })

  // Edge：确认不可食用时，安全间隔期提示可省略。
  test('确认不可食用时允许省略安全间隔期提示', () => {
    const result = { ...withAction({}, ['edibleSafetyIntervalNotice']), edibleContext: 'no' }
    expect(createValidator()(result)).toBe(true)
  })

  // 安全门：药剂只能取自允许名单。
  test('拒绝名单外药剂', () => {
    expect(createValidator()(withAction({ agentNamesZh: ['克百威'] }))).toBe(false)
  })

  // 安全门：中、高风险行动必须给理由（两种来源都适用）。
  test.each(['moderate', 'high'])('风险等级 %s 缺少理由时拒绝', riskLevel => {
    expect(createValidator()(withAction({ riskLevel }, ['riskReasonZh']))).toBe(false)
  })

  // 用语门：公开把握说明不得出现百分比或概率表达。
  test.each(['约95%的把握', '百分之九十可能', '概率较高'])(
    '拒绝把握理由中的数值化表达：%s',
    certaintyReasonZh => {
      expect(createValidator()({ ...validResult, certaintyReasonZh })).toBe(false)
    }
  )

  // Reverse：建议仍须用户确认，不能借生成式写成养护事实。
  test('拒绝不需要用户确认的生成式行动', () => {
    expect(createValidator()(withAction({ requiresUserConfirmation: false }))).toBe(false)
  })

  // Edge：不能夹带原始模型输出或提示词。
  test.each(['rawModelOutput', 'promptText', 'causeCode'])('拒绝内部字段：%s', field => {
    expect(createValidator()({ ...validResult, [field]: 'x' })).toBe(false)
  })

  // 一致性：Schema 中的药剂枚举必须与登记的允许名单逐项一致，且名单标注待园艺来源审核。
  test('药剂枚举与允许名单一致，且名单状态为待园艺来源审核', () => {
    const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as {
      $defs: { agentName: { enum: string[] } }
    }
    const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf8')) as {
      reviewStatus: string
      agents: { nameZh: string }[]
    }
    expect(allowlist.reviewStatus).toBe('pending_horticulture_source_review')
    expect(allowlist.agents).toHaveLength(20)
    expect(schema.$defs.agentName.enum).toEqual(allowlist.agents.map(agent => agent.nameZh))
  })
})
