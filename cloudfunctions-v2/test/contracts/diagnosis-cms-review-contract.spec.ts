import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * 独立 Expected：诊断知识 CMS 人工审核交换合同中的两个互斥命令。
 * 测试层次：unit_real_data；只编译真实 JSON Schema，不替代 CMS 身份、数据库或发布事务验收。
 */
const contractDir = path.join(findProjectRoot(), 'docs/backend-v2/contracts/schemas')

/** 审核决定只能批准或驳回一份确切内容。 */
const validDecision = {
  protocolVersion: 'diagnosis-cms-review/v1',
  reviewRef: 'review-001',
  candidateRef: 'candidate-001',
  contentSha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  decision: 'approved',
  reasonZh: '已核对来源与适用范围。'
}

/** 撤销必须明确指向既有审核，且由服务端解析候选与摘要。 */
const validRevocation = {
  protocolVersion: 'diagnosis-cms-review/v1',
  revocationRef: 'revocation-001',
  targetReviewRef: 'review-001',
  reasonZh: '原来源主张已失效。'
}

function validatorFor(name: 'decision' | 'revocation') {
  const schemaPath = path.join(contractDir, `diagnosis-cms-review-${name}.v1.schema.json`)
  assert.ok(fs.existsSync(schemaPath), `缺少诊断 CMS 审核结构合同：${schemaPath}`)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
  return new Ajv2020({ allErrors: true, strict: true }).compile(schema)
}

describe('诊断知识 CMS 审核请求结构合同', () => {
  test('接受绑定候选与摘要的批准和驳回决定', () => {
    const validate = validatorFor('decision')
    expect(validate(validDecision)).toBe(true)
    expect(
      validate({
        ...validDecision,
        reviewRef: 'review-002',
        decision: 'rejected',
        reasonZh: '证据不足。'
      })
    ).toBe(true)
  })

  test('撤销不是第三种审核决定', () => {
    expect(validatorFor('decision')({ ...validDecision, decision: 'revoked' })).toBe(false)
  })

  test('拒绝没有候选摘要或使用非法摘要的审核', () => {
    const validate = validatorFor('decision')
    const { contentSha256: _omitted, ...withoutHash } = validDecision
    expect(validate(withoutHash)).toBe(false)
    expect(validate({ ...validDecision, contentSha256: 'not-a-sha256' })).toBe(false)
  })

  test('拒绝未知协议版本或没有审核理由的决定', () => {
    const validate = validatorFor('decision')
    expect(validate({ ...validDecision, protocolVersion: 'unknown' })).toBe(false)
    expect(validate({ ...validDecision, reasonZh: '' })).toBe(false)
  })

  test('拒绝请求体自报管理员身份或审核时间', () => {
    const validate = validatorFor('decision')
    expect(validate({ ...validDecision, reviewerRef: 'admin-001' })).toBe(false)
    expect(validate({ ...validDecision, reviewedAtMs: 1 })).toBe(false)
  })

  test('接受带独立幂等引用和撤销理由的撤销命令', () => {
    expect(validatorFor('revocation')(validRevocation)).toBe(true)
  })

  test('撤销必须指向审核并提供非空理由', () => {
    const validate = validatorFor('revocation')
    const { targetReviewRef: _omitted, ...withoutTarget } = validRevocation
    expect(validate(withoutTarget)).toBe(false)
    expect(validate({ ...validRevocation, reasonZh: '' })).toBe(false)
  })

  test('撤销不能复用未知协议或缺少独立幂等引用', () => {
    const validate = validatorFor('revocation')
    expect(validate({ ...validRevocation, protocolVersion: 'unknown' })).toBe(false)
    const { revocationRef: _omitted, ...withoutRef } = validRevocation
    expect(validate(withoutRef)).toBe(false)
  })

  test('撤销不能替换目标候选或自报审核身份', () => {
    const validate = validatorFor('revocation')
    expect(validate({ ...validRevocation, candidateRef: 'candidate-002' })).toBe(false)
    expect(validate({ ...validRevocation, reviewerRef: 'admin-001' })).toBe(false)
  })
})
