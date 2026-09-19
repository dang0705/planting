import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户已锁定的 P1 视觉 Prompt 边界，以及
 * diagnosis-model-output.v1.schema.json 中固定的 contractVersion。
 * 测试层次：unit_real_data；只读取真实合同制品，不访问模型、网络、数据库或旧运行时。
 */
const projectRoot = findProjectRoot()
const promptPath = path.join(
  projectRoot,
  'docs/backend-v2/contracts/prompts/diagnosis-visual.v1.txt'
)
const releasePath = path.join(
  projectRoot,
  'docs/backend-v2/contracts/prompts/diagnosis-visual.v1.release.json'
)
const resultSchemaPath = path.join(
  projectRoot,
  'docs/backend-v2/contracts/schemas/diagnosis-model-output.v1.schema.json'
)

const expectedPromptVersion = 'diagnosis-visual/v1'
const expectedResultSchemaVersion = 'diagnosis-model-output/v1'
const expectedNormalizedSha256 = '11c58cebe3b3c41097d6f6d6b3c5b5d7eb16248e4f07bacd497868a647ccc964'

/** 统一换行且保留唯一末尾换行，保证跨平台读取同一 release 得到同一哈希。 */
function normalizePromptText(promptText: string): string {
  return promptText.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
}

function readPromptText(): string {
  assert.ok(fs.existsSync(promptPath), `缺少已冻结的视觉 Prompt：${promptPath}`)
  return fs.readFileSync(promptPath, 'utf8')
}

function readRelease(): Record<string, unknown> {
  assert.ok(fs.existsSync(releasePath), `缺少视觉 Prompt release：${releasePath}`)
  return JSON.parse(fs.readFileSync(releasePath, 'utf8')) as Record<string, unknown>
}

describe('诊断视觉 Prompt 不可变 release', () => {
  // Happy（I1）；Expected：已锁定 Prompt 必须以规范化 SHA-256 和唯一版本号形成可复算 release。
  test('将规范化 Prompt 与 release 元数据固定到同一 SHA-256', () => {
    const normalizedPrompt = normalizePromptText(readPromptText())
    const release = readRelease()
    const actualSha256 = crypto.createHash('sha256').update(normalizedPrompt, 'utf8').digest('hex')

    expect(normalizedPrompt.endsWith('\n')).toBe(true)
    expect(release.promptVersion).toBe(expectedPromptVersion)
    expect(release.normalizedSha256).toBe(expectedNormalizedSha256)
    expect(actualSha256).toBe(expectedNormalizedSha256)
  })

  // Edge（I2）；Expected：视觉 Prompt 只能保留静态可见证据边界，不得引入旧动态查询、模型选择或内部可观测性指令。
  test('只含静态可见证据边界，且不含敏感或旧运行时指令', () => {
    const promptText = readPromptText()

    for (const requiredRule of [
      '只描述当前图片中可直接复核',
      '不得推断病因、病名、治疗、浇水行为、长期状态或最终诊断',
      '仅返回一个合法 JSON 对象',
      '不得创建、确认或更新任何养护事实、养护计划或提醒'
    ]) {
      expect(promptText).toContain(requiredRule)
    }

    for (const forbiddenInstruction of [
      'qwen',
      'bailian',
      'sql',
      'select ',
      '数据库',
      '日志',
      'traceId',
      'rawModelOutput',
      '原始模型输出',
      'user_plant_id',
      'prompt-symptom',
      '动态区',
      '模型名'
    ]) {
      expect(promptText.toLowerCase()).not.toContain(forbiddenInstruction.toLowerCase())
    }
  })

  // Reverse（I3）；Expected：release 必须绑定真实 Schema 的固定版本，防止未知模型输出形状被悄然接受。
  test('绑定 diagnosis-model-output/v1 Schema，不允许脱离其合同版本', () => {
    const release = readRelease()
    const resultSchema = JSON.parse(fs.readFileSync(resultSchemaPath, 'utf8')) as {
      properties?: { contractVersion?: { const?: unknown } }
    }

    expect(release.resultSchemaVersion).toBe(expectedResultSchemaVersion)
    expect(release.language).toBe('zh-CN')
    expect(resultSchema.properties?.contractVersion?.const).toBe(expectedResultSchemaVersion)
    expect(release.boundaries).toEqual({
      visibleEvidenceOnly: true,
      inferCauseOrTreatment: false,
      strictJsonOnly: true,
      createsCareFact: false,
      createsCarePlan: false
    })
  })
})
