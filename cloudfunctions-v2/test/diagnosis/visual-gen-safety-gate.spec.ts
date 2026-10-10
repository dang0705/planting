import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { evaluateVisualGenOutput } from '../../src/diagnosis/domain/visual-gen-safety-gate.js'
import { projectVisualGenResult } from '../../src/diagnosis/domain/project-visual-gen-result.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnc 安全门条款、合同 C2（diagnosis-rich-response-experiment.md，2026-10-11 修订）、
 * diagnosis-result/v2 Schema、diagnosis-visual-api/v1 §5 与药剂允许名单 v1（含 aliases）。
 * 规则：不得出现剂量与浓度、用药步骤不得写具体间隔或次数；药剂名规范化到名单规范名，名单外拒绝；
 * 证据不足、非植物时不得给候选与立即处理；两项用药提示由服务端补写（可食用或未知时补安全间隔期）；
 * 投影结果必须通过 diagnosis-result/v2 严格校验，且不含模型原文、提示词或内部编号。
 * 测试层次：unit_fake（纯函数，不调用模型）。
 */
const root = findProjectRoot()
const schemaPath = path.join(
  root,
  'docs/backend-v2/contracts/schemas/diagnosis-result.v2.schema.json'
)
const validateV2 = new Ajv2020({ allErrors: true, strict: true }).compile(
  JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
)
const causeCatalog = [
  'pest_whitefly',
  'pest_mealybug',
  'fungal_sooty_mold',
  'none_no_obvious_problem'
]

function output(
  patch: Record<string, unknown> = {},
  classificationPatch: Record<string, unknown> = {}
) {
  return {
    contractVersion: 'diagnosis-visual-gen-output/v1',
    classification: {
      isPlant: 'yes',
      usable: 'good',
      qualityIssues: [],
      overallStatus: 'problem_found',
      candidates: [
        {
          rank: 1,
          causeCode: 'pest_whitefly',
          certaintyBand: 'likely',
          directMarkerKeys: ['white_flies']
        }
      ],
      severity: 'moderate',
      urgency: 'immediate',
      isolation: 'recommended',
      edibleContext: 'unknown',
      ...classificationPatch
    },
    perImage: [{ imageIndex: 1, visiblePart: 'leaf_back', quality: 'good', noteZh: '叶背清晰' }],
    titleZh: '白粉虱虫害',
    summaryZh: '叶背可见粉虱成虫和若虫，较可能是白粉虱危害。',
    diagnosisTable: {
      problemTypeZh: '刺吸式害虫危害',
      certaintyZh: '较可能',
      certaintyReasonZh: '同时看到成虫和若虫',
      mainEvidenceZh: '叶背聚集白色小飞虫',
      urgencyZh: '需尽快处理',
      isolationZh: '建议隔离：成虫会飞'
    },
    identificationBasis: [{ aspectZh: '虫体特征', detailZh: '叶背成群白色小飞虫', imageIndex: 1 }],
    alternatives: [
      {
        causeCode: 'pest_mealybug',
        nameZh: '粉蚧',
        whyLessLikelyZh: '未见棉絮',
        howToRuleOutZh: '查叶腋'
      }
    ],
    immediateActions: [
      {
        stepNo: 1,
        titleZh: '隔离植株',
        detailZh: '搬离其他植物',
        causeCodes: ['pest_whitefly'],
        riskLevel: 'low',
        agentNames: []
      },
      {
        stepNo: 2,
        titleZh: '选用低毒药剂',
        detailZh: '可选矿物油，重点喷叶背，按产品标签的间隔重复处理，并在下次处理前复查',
        causeCodes: ['pest_whitefly'],
        riskLevel: 'medium',
        riskReasonZh: '虫口较多',
        agentNames: ['矿物油']
      }
    ],
    ongoingCare: [
      {
        stepNo: 1,
        titleZh: '加强通风',
        detailZh: '放在通风处',
        causeCodes: ['pest_whitefly'],
        careProposalKind: 'ventilation'
      },
      {
        stepNo: 2,
        titleZh: '提高湿度',
        detailZh: '托盘加水',
        causeCodes: ['pest_whitefly'],
        careProposalKind: 'humidity'
      }
    ],
    prevention: [{ titleZh: '新株先观察', detailZh: '单独放一段时间' }],
    cautions: [{ detailZh: '用药前先在少量叶片试用' }],
    followUp: { recheckZh: '几天后复查叶背', escalateZh: '虫量不降时线下核验' },
    retakeRequests: [],
    followUpQuestions: [],
    ...patch
  }
}

const context = { edibleContext: 'unknown' as const, causeCatalog }

describe('视觉诊断安全门', () => {
  test('合规输出通过：药剂别名规范化为名单规范名，两项用药提示由服务端补写', () => {
    const result = evaluateVisualGenOutput(output(), context)
    expect(result.status).toBe('pass')
    if (result.status !== 'pass') {
      return
    }
    const agentStep = result.output.immediateActions[1]
    expect(agentStep?.agentNames).toEqual(['矿物油（园艺油）'])
    expect(agentStep).toMatchObject({ labelDosageNotice: true, edibleSafetyIntervalNotice: true })
  })

  test('确认不可食用时只补按标签提示', () => {
    const result = evaluateVisualGenOutput(output({}, { edibleContext: 'no' }), {
      ...context,
      edibleContext: 'no'
    })
    expect(result.status).toBe('pass')
    if (result.status !== 'pass') {
      return
    }
    expect(result.output.immediateActions[1]).not.toHaveProperty('edibleSafetyIntervalNotice')
  })

  test.each([
    ['稀释倍数', { detailZh: '矿物油稀释 200 倍喷施' }, 'dose_in_step'],
    ['用量', { detailZh: '每次用 5 毫升' }, 'dose_in_step'],
    ['具体间隔', { detailZh: '每隔 7 天喷一次' }, 'specific_interval_or_count'],
    ['具体次数', { detailZh: '连续喷 3 次' }, 'specific_interval_or_count']
  ])('拒绝用药步骤中的%s', (_name, patch, reason) => {
    const base = output()
    const steps: Record<string, unknown>[] = [...base.immediateActions]
    steps[1] = { ...steps[1]!, ...patch }
    const result = evaluateVisualGenOutput({ ...base, immediateActions: steps }, context)
    expect(result).toMatchObject({ status: 'reject', reasons: expect.arrayContaining([reason]) })
  })

  test('拒绝名单外药剂', () => {
    const base = output()
    const steps: Record<string, unknown>[] = [...base.immediateActions]
    steps[1] = { ...steps[1]!, agentNames: ['吡虫啉'] }
    expect(evaluateVisualGenOutput({ ...base, immediateActions: steps }, context)).toMatchObject({
      status: 'reject',
      reasons: expect.arrayContaining(['agent_not_allowed'])
    })
  })

  test.each(['insufficient_evidence', 'not_plant'])(
    '总体状态为 %s 时不得给候选或立即处理',
    overallStatus => {
      const result = evaluateVisualGenOutput(output({}, { overallStatus }), context)
      expect(result).toMatchObject({
        status: 'reject',
        reasons: expect.arrayContaining(['conclusion_without_evidence'])
      })
    }
  )

  test('拒绝不在病因闭集内的编号、数值化把握与格式错误', () => {
    expect(
      evaluateVisualGenOutput(
        output(
          {},
          {
            candidates: [
              { rank: 1, causeCode: 'made_up', certaintyBand: 'likely', directMarkerKeys: [] }
            ]
          }
        ),
        context
      )
    ).toMatchObject({
      status: 'reject',
      reasons: expect.arrayContaining(['cause_code_not_in_catalog'])
    })
    expect(evaluateVisualGenOutput(output({ summaryZh: '约 95% 是粉虱' }), context)).toMatchObject({
      status: 'reject',
      reasons: expect.arrayContaining(['numeric_certainty'])
    })
    expect(evaluateVisualGenOutput({ contractVersion: 'x' }, context)).toMatchObject({
      status: 'reject',
      reasons: ['malformed_output']
    })
  })
})

describe('投影为公开结果 v2', () => {
  test('投影结果通过 diagnosis-result/v2 严格校验，careProposalKind 对齐 care 能力，非 care 类型投影为 none', () => {
    const gate = evaluateVisualGenOutput(output(), context)
    expect(gate.status).toBe('pass')
    if (gate.status !== 'pass') {
      return
    }
    const projected = projectVisualGenResult(gate.output, { edibleContext: 'unknown' })
    expect(validateV2(projected)).toBe(true)
    const kinds = projected.recommendedActions.map(action => action.careProposalKind)
    expect(kinds).toContain('ventilation')
    expect(kinds).not.toContain('humidity')
    expect(projected.recommendedActions.find(action => action.agentNamesZh?.length)).toMatchObject({
      labelDosageNotice: true,
      edibleSafetyIntervalNotice: true
    })
  })

  test('公开结果不含模型原文、提示词或内部编号', () => {
    const gate = evaluateVisualGenOutput(output(), context)
    if (gate.status !== 'pass') {
      throw new Error('gate')
    }
    const serialized = JSON.stringify(
      projectVisualGenResult(gate.output, { edibleContext: 'unknown' })
    )
    for (const forbidden of [
      'pest_whitefly',
      'causeCode',
      'contractVersion":"diagnosis-visual-gen-output',
      'directMarkerKeys'
    ]) {
      expect(serialized).not.toContain(forbidden)
    }
  })
})
