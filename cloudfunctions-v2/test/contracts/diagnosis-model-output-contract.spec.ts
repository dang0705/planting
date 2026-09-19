import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：Canonical Master Plan §6.3、§10.1、§12 与 §16.1；
 * 以及 P1 配置目录中 diagnosis.result.schema_version 的“校验失败整份拒绝”边界。
 * 测试层次：unit_real_data；直接编译真实 JSON Schema，不访问模型、网络、数据库或旧运行时实现。
 */
const schemaPath = path.join(
  findProjectRoot(),
  'docs/backend-v2/contracts/schemas/diagnosis-model-output.v1.schema.json'
)

/** 模型输出只包含可进入诊断归约层的脱敏候选，不包含任何供应商原文或内部主键。 */
const validModelOutput = {
  contractVersion: 'diagnosis-model-output/v1',
  evidence: [
    {
      evidenceKey: 'evidence-leaf-1',
      source: 'visual',
      observation: '叶片边缘可见黄化区域。',
      confidence: 'medium'
    },
    {
      evidenceKey: 'evidence-answer-1',
      source: 'text',
      observation: '用户反馈最近浇水频率增加。',
      confidence: 'medium'
    }
  ],
  conclusionCandidates: [
    {
      candidateKey: 'possible-water-stress',
      summary: '存在水分管理相关压力的可能。',
      confidence: 'medium',
      supportingEvidenceKeys: ['evidence-leaf-1', 'evidence-answer-1']
    }
  ],
  uncertainty: {
    level: 'medium',
    reasons: ['单张图片不足以确认根部状态。'],
    missingEvidence: ['盆土表面与根部状态的补充观察']
  },
  recommendedActions: [
    {
      actionKey: 'confirm-soil-condition',
      instruction: '先按用户可见的土壤检查流程确认盆土状态。',
      purpose: '补充决定后续诊断所需的证据。',
      requiresUserConfirmation: true,
      producesCareFact: false,
      producesCarePlan: false
    }
  ]
}

const [firstEvidence] = validModelOutput.evidence
const [firstConclusionCandidate] = validModelOutput.conclusionCandidates
const [firstRecommendedAction] = validModelOutput.recommendedActions

function createValidator() {
  assert.ok(fs.existsSync(schemaPath), `缺少 AI 问诊模型输出 Schema：${schemaPath}`)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

describe('AI 视觉/文本诊断模型输出合同', () => {
  // Happy；Expected：模型输出必须同时交付证据、候选结论、置信/不确定性和仅为建议的动作。
  test('接受完整、脱敏且不能直接形成养护事实或计划的模型输出', () => {
    expect(createValidator()(validModelOutput)).toBe(true)
  })

  // Edge（U1）；Expected：结构化输出的四个顶层区块均为必填，缺失时整份拒绝而非猜测补齐。
  test.each(['evidence', 'conclusionCandidates', 'uncertainty', 'recommendedActions'])(
    '拒绝缺少必需区块：%s',
    requiredField => {
      const output = { ...validModelOutput } as Record<string, unknown>
      delete output[requiredField]

      expect(createValidator()(output)).toBe(false)
    }
  )

  // Edge（U3）；Expected：所有对象层级都禁止额外字段，避免原始模型输出、Prompt 或内部标识跨越 Adapter 边界。
  test.each([
    ['顶层原始模型输出', { ...validModelOutput, rawModelOutput: 'provider-private-text' }],
    ['顶层 Prompt', { ...validModelOutput, prompt: 'provider-private-prompt' }],
    ['顶层内部主键', { ...validModelOutput, diagnosisInternalId: 42 }],
    [
      '证据内部资产键',
      {
        ...validModelOutput,
        evidence: [{ ...firstEvidence, assetInternalId: 42 }]
      }
    ],
    [
      '候选结论内部规则键',
      {
        ...validModelOutput,
        conclusionCandidates: [{ ...firstConclusionCandidate, ruleInternalId: 42 }]
      }
    ],
    [
      '不确定性内部追踪键',
      {
        ...validModelOutput,
        uncertainty: { ...validModelOutput.uncertainty, traceId: 'trace-private' }
      }
    ],
    [
      '建议动作计划引用',
      {
        ...validModelOutput,
        recommendedActions: [{ ...firstRecommendedAction, planRef: 'plan-private' }]
      }
    ]
  ])('拒绝额外字段：%s', (_name, output) => {
    expect(createValidator()(output)).toBe(false)
  })

  // Reverse；Expected：诊断建议只能等待用户确认，不能让模型输出直接伪造事实或计划。
  test.each([
    { requiresUserConfirmation: false },
    { producesCareFact: true },
    { producesCarePlan: true }
  ])('拒绝会直接越权形成养护结果的建议动作：%o', override => {
    const output = {
      ...validModelOutput,
      recommendedActions: [{ ...firstRecommendedAction, ...override }]
    }

    expect(createValidator()(output)).toBe(false)
  })
})
