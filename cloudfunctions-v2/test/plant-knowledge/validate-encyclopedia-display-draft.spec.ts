import { describe, expect, test } from 'vitest'

import { validateEncyclopediaDisplayDraft } from '../../src/plant-knowledge/domain/validate-encyclopedia-display-draft.js'

const VALID_QUESTION = { question: '它的外观有什么特点？', answer: '可以观察叶片的形状和颜色。' }

const VALID_CONTENT = {
  introduction: '这是一种可通过叶片形态辨认的观叶植物。',
  appearance: '叶片呈绿色，叶缘完整。',
  distribution: '可见于其原生分布区及园艺栽培环境。',
  qa: [VALID_QUESTION]
}

/**
 * Expected 来源：plant-encyclopedia-display/v1 JSON Schema、
 * configuration-variable-catalog 中已冻结的 content_schema_version 与 forbidden_fields，
 * 以及 CMS 展示百科补全 Worker 合同。
 * 层次：unit_real_data / L1；经过实际运行时 Ajv 校验器，读取真实发布 Schema；
 * 不调用 Qwen、CloudBase CMS、MySQL 或 HTTP，亦不证明文本语义安全。
 */
describe('展示型植物百科草稿准入', () => {
  test('接受已冻结版本和完整展示内容', () => {
    expect(
      validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v1', VALID_CONTENT)
    ).toEqual({ ok: true, content: VALID_CONTENT })
  })

  test('未知结构版本不得降级使用当前 Schema', () => {
    expect(
      validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v2', VALID_CONTENT)
    ).toEqual({ ok: false, code: 'UNKNOWN_STRUCTURE_VERSION' })
  })

  test('缺少问答与空问答均不能通过', () => {
    const { qa: _removed, ...withoutQa } = VALID_CONTENT
    expect(validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v1', withoutQa)).toEqual({
      ok: false,
      code: 'INVALID_DISPLAY_CONTENT'
    })
    expect(
      validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v1', {
        ...VALID_CONTENT,
        qa: []
      })
    ).toEqual({ ok: false, code: 'INVALID_DISPLAY_CONTENT' })
  })

  test('超过三条问答不能进入展示百科', () => {
    expect(
      validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v1', {
        ...VALID_CONTENT,
        qa: Array.from({ length: 4 }, () => VALID_QUESTION)
      })
    ).toEqual({ ok: false, code: 'INVALID_DISPLAY_CONTENT' })
  })

  test('分类与养护禁区字段即使带有完整展示字段也要整份拒绝', () => {
    for (const field of ['family', 'toxicity', 'watering_frequency', 'diagnosis_basis']) {
      expect(
        validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v1', {
          ...VALID_CONTENT,
          [field]: '越界内容'
        })
      ).toEqual({ ok: false, code: 'INVALID_DISPLAY_CONTENT' })
    }
  })

  test('问答对象中的额外字段和非法条目不能绕过结构校验', () => {
    for (const qa of [
      [{ ...VALID_QUESTION, treatment_claim: '越界内容' }],
      [null, VALID_QUESTION]
    ]) {
      expect(
        validateEncyclopediaDisplayDraft('plant-encyclopedia-display/v1', { ...VALID_CONTENT, qa })
      ).toEqual({ ok: false, code: 'INVALID_DISPLAY_CONTENT' })
    }
  })

  test('校验后的受限内容不随原始模型对象后续变化而改变', () => {
    const untrustedContent = {
      ...VALID_CONTENT,
      qa: [{ ...VALID_QUESTION }]
    }
    const result = validateEncyclopediaDisplayDraft(
      'plant-encyclopedia-display/v1',
      untrustedContent
    )
    expect(result.ok).toBe(true)
    if (!result.ok) {
      return
    }

    untrustedContent.introduction = '改稿后的介绍'
    const [untrustedQuestion] = untrustedContent.qa
    untrustedQuestion!.answer = '改稿后的回答'
    expect(result.content.introduction).toBe(VALID_CONTENT.introduction)
    const [acceptedQuestion] = result.content.qa
    expect(acceptedQuestion!.answer).toBe(VALID_QUESTION.answer)
  })
})
