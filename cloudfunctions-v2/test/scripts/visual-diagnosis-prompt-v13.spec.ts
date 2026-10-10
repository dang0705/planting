import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { extractPrefixFromDraft } from '../../scripts/visual-diagnosis-eval/eval-core.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：主代理 2026-10-11 裁定——采用 A1 输出瘦身；「按产品标签」「安全间隔期」两项用药提示由服务端补写，
 * 模型不再输出；公开 careProposalKind 与 care 域能力类型对齐（watering、fertilizing、lighting、ventilation、none）。
 * 测试层次：unit_real_data（读取提示词草案，不调用模型）。
 */
const draft = fs.readFileSync(
  path.join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/visual-diagnosis-prompt.v1.3.draft.md'),
  'utf8'
)
const prefix = extractPrefixFromDraft(draft)

describe('提示词 v1.3 草案固定前缀', () => {
  test('不再要求模型输出两项用药提示字段，并说明由服务端补写', () => {
    expect(prefix).not.toMatch(/"labelDosageNotice":\s*true/u)
    expect(prefix).not.toMatch(/"edibleSafetyIntervalNotice":\s*true/u)
    expect(prefix).toContain('由服务端写入，你不要输出这两句')
  })

  test('careProposalKind 只使用与 care 能力对齐的取值', () => {
    expect(prefix).toContain('"careProposalKind": "watering|fertilizing|lighting|ventilation|none')
    expect(prefix).not.toMatch(/careProposalKind[^\n]*(humidity|repotting|light\|)/u)
  })
})
