import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import Ajv from 'ajv'
import { test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：Canonical Master Plan 5.6、plant-taxonomy/v1、CMS 展示百科 Worker
 * 和业务关键变量目录中的 `plant-knowledge.cms.qa_target_count`。
 * 测试层次：unit_real_data / L3 合同；读取真实 JSON Schema，并经过真实 Ajv 编译
 * 与校验，不连接 CloudBase、MySQL、CMS 或模型 Provider。
 *
 * 这份测试只锁展示型内容合同：简介、外观、分布和 1–3 条简短问答。
 * 分类、养护、安全和诊断字段不是展示内容的降级字段，而是必须拒绝的跨层输入。
 */
test('植物百科展示内容 Schema 只允许展示字段和 1–3 条简短问答', () => {
  const root = findProjectRoot()
  const emptyQaCount = 0
  const excessiveQaCount = 4
  const schemaPath = path.join(
    root,
    'docs/backend-v2/contracts/schemas/plant-encyclopedia-display.v1.schema.json',
  )

  assert.ok(fs.existsSync(schemaPath), `缺少展示百科 Schema：${schemaPath}`)

  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as Record<string, unknown>
  assert.equal(typeof schema.title, 'string')
  assert.match(schema.title as string, /[\u3400-\u9fff]/u, 'Schema 标题必须包含中文')
  assert.equal(typeof schema.description, 'string')
  assert.match(schema.description as string, /[\u3400-\u9fff]/u, 'Schema 描述必须包含中文')

  const ajv = new Ajv({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)

  const validQuestion = {
    question: '它的外观有什么特点？',
    answer: '可以先观察叶片的形状、颜色和整体轮廓。',
  }
  const secondQuestion = {
    question: '它通常在哪里被观察到？',
    answer: '可以在原生分布区或园艺栽培环境中观察到它。',
  }
  const thirdQuestion = {
    question: '认识它时可以先看什么？',
    answer: '可以先看整体轮廓和叶片的可见特征。',
  }
  const validContent = {
    introduction: '这是一种适合用于植物识别后基础展示的常见观叶植物。',
    appearance: '叶片呈绿色，形态和质感是辨认它时较容易观察到的外观特征。',
    distribution: '常见于其原生分布区及园艺栽培环境，具体范围因种类而异。',
    qa: [validQuestion],
  }

  assert.equal(validate(validContent), true, JSON.stringify(validate.errors))
  assert.equal(
    validate({
      ...validContent,
      qa: [validQuestion, secondQuestion, thirdQuestion],
    }),
    true,
    '恰好三条问答仍属于有效展示内容',
  )

  for (const field of ['introduction', 'appearance', 'distribution', 'qa']) {
    const missingField: Record<string, unknown> = { ...validContent }
    delete missingField[field]
    assert.equal(
      validate(missingField),
      false,
      `缺少必填展示字段时必须拒绝：${field}`,
    )
  }

  for (const count of [emptyQaCount, excessiveQaCount]) {
    const invalidCount = {
      ...validContent,
      qa: Array.from({ length: count }, () => validQuestion),
    }
    assert.equal(
      validate(invalidCount),
      false,
      `问答数量 ${count} 不在 1–3 条范围内时必须拒绝`,
    )
  }

  assert.equal(
    validate({
      ...validContent,
      introduction: '',
    }),
    false,
    '简介不得为空字符串',
  )
  assert.equal(
    validate({
      ...validContent,
      qa: [{ question: '', answer: '有可观察的外观特征。' }],
    }),
    false,
    '问答问题不得为空字符串',
  )
  assert.equal(
    validate({
      ...validContent,
      qa: [{ question: '如何描述它？', answer: '' }],
    }),
    false,
    '问答答案不得为空字符串',
  )

  for (const [field, value] of [
    ['introduction', '植'.repeat(501)],
    ['appearance', '叶'.repeat(301)],
    ['distribution', '地'.repeat(301)],
  ] as const) {
    assert.equal(validate({ ...validContent, [field]: value }), false, `${field} 不得超过展示上限`)
  }
  assert.equal(
    validate({
      ...validContent,
      qa: [{ question: '问'.repeat(81), answer: '简短回答。' }],
    }),
    false,
    '问答问题不得超过 80 个字符',
  )
  assert.equal(
    validate({
      ...validContent,
      qa: [{ question: '如何描述它？', answer: '答'.repeat(301) }],
    }),
    false,
    '问答答案不得超过 300 个字符',
  )

  assert.equal(
    validate({ ...validContent, unexpected: '禁止扩展顶层展示合同' }),
    false,
    '顶层 additionalProperties 必须为 false',
  )
  assert.equal(
    validate({
      ...validContent,
      qa: [{ ...validQuestion, internalNote: '禁止扩展问答对象' }],
    }),
    false,
    '问答对象 additionalProperties 必须为 false',
  )

  const forbiddenFields = [
    'family',
    'genus',
    'species',
    'authority_source',
    'authority_taxon_id',
    'accepted_scientific_name',
    'scientific_name_mutation',
    'taxonomy_review_status',
    'release_status',
    'toxicity',
    'edibility',
    'medicinal_claim',
    'child_safety',
    'pet_safety',
    'watering_frequency',
    'fertilizing_frequency',
    'lighting_requirement',
    'ventilation_requirement',
    'temperature_requirement',
    'humidity_requirement',
    'pest_or_disease_fact',
    'diagnosis_basis',
    'treatment_claim',
    'safety_fact',
  ]

  for (const field of forbiddenFields) {
    assert.equal(
      validate({ ...validContent, [field]: '越界字段' }),
      false,
      `展示百科不得接受禁区字段：${field}`,
    )
  }
})
