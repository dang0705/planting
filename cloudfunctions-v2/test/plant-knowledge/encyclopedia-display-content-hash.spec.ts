import { describe, expect, test } from 'vitest'

import { prepareEncyclopediaDisplayRevision } from '../../src/plant-knowledge/domain/validate-encyclopedia-display-draft.js'

const STRUCTURE_VERSION = 'plant-encyclopedia-display/v1'
const EXPECTED_CONTENT_SHA256 = 'cf4fe6ae53e68fdf6e2291fb1cebe0bbb1c2aafc77299a0ec0926c33a89f6167'

/** Expected 的完整展示正文来自已冻结 Schema；不是当前实现输出。 */
function validContent(): Record<string, unknown> {
  return {
    introduction: '展示介绍',
    appearance: '绿色叶片',
    distribution: '热带地区',
    qa: [{ question: '叶形如何？', answer: '心形。' }]
  }
}

/**
 * Expected 来源：CMS 展示百科补全 Worker 的 content_hash 规范与展示型 JSON Schema。
 * 黄金摘要根据独立写出的紧凑规范 JSON 字节计算，不从产品函数反推。
 * 层次：unit_real_data；使用真实版本 Schema、真实 Node SHA-256，不调用 CMS/MySQL。
 */
describe('展示百科修订的规范内容摘要', () => {
  test('完整中文正文产生确定的 SHA-256；对象键顺序不影响摘要', () => {
    const content = validContent()
    const reorderedContent = {
      qa: [{ answer: '心形。', question: '叶形如何？' }],
      distribution: '热带地区',
      appearance: '绿色叶片',
      introduction: '展示介绍'
    }

    const first = prepareEncyclopediaDisplayRevision(STRUCTURE_VERSION, content)
    const second = prepareEncyclopediaDisplayRevision(STRUCTURE_VERSION, reorderedContent)

    expect(first).toMatchObject({ ok: true, contentHash: EXPECTED_CONTENT_SHA256 })
    expect(second).toMatchObject({ ok: true, contentHash: EXPECTED_CONTENT_SHA256 })
  })

  test('改写问答内容或次序必须改变摘要', () => {
    const changed = validContent()
    changed.qa = [
      { question: '叶形如何？', answer: '心形。' },
      { question: '颜色如何？', answer: '绿色。' }
    ]
    const reordered = validContent()
    reordered.qa = [
      { question: '颜色如何？', answer: '绿色。' },
      { question: '叶形如何？', answer: '心形。' }
    ]

    const first = prepareEncyclopediaDisplayRevision(STRUCTURE_VERSION, changed)
    const second = prepareEncyclopediaDisplayRevision(STRUCTURE_VERSION, reordered)
    expect(first.ok).toBe(true)
    expect(second.ok).toBe(true)
    if (first.ok && second.ok) {
      expect(first.contentHash).not.toBe(EXPECTED_CONTENT_SHA256)
      expect(first.contentHash).not.toBe(second.contentHash)
    }
  })

  test('未知结构版本或越界字段不能得到可发布摘要', () => {
    expect(prepareEncyclopediaDisplayRevision('unknown/v1', validContent())).toEqual({
      ok: false,
      code: 'UNKNOWN_STRUCTURE_VERSION'
    })
    expect(
      prepareEncyclopediaDisplayRevision(STRUCTURE_VERSION, {
        ...validContent(),
        wateringFrequency: '每周一次'
      })
    ).toEqual({ ok: false, code: 'INVALID_DISPLAY_CONTENT' })
  })

  test('成功结果不因调用方继续修改原始草稿而变化', () => {
    const content = validContent()
    const result = prepareEncyclopediaDisplayRevision(STRUCTURE_VERSION, content)
    content.introduction = '审核后改稿'
    expect(result).toMatchObject({ ok: true, contentHash: EXPECTED_CONTENT_SHA256 })
    if (result.ok) {
      expect(result.content.introduction).toBe('展示介绍')
    }
  })
})
