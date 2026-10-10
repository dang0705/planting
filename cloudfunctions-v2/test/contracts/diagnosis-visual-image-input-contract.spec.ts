import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：用户 2026-10-10 裁定（经协调方转达）——
 * ① 每次诊断最多 3 张图（配置目录 confirmed，策略发布层，取值 3）；
 * ② 客户端不限制像素，由青花植服务端在送模型前统一缩放到 1024² 以内（保持长宽比、只缩不放大），
 *    这是必经步骤，模型输入侧的代码层硬上限为 1024²；端上上传大小仍走资产策略；
 * ③ 输入 token 预算：固定前缀 + 上下文 ≤600 + 用户文本 ≤300 + 图片数 × ≤1,026 ≤ 32K × 90%。
 * 测试层次：unit_real_data（读取真实合同制品与配置目录，不调用模型、不处理图片）。
 * 未覆盖：适配器实现、图片实际缩放质量、百炼侧 max_pixels 行为的线上复核。
 */
const root = findProjectRoot()
const contractDir = path.join(root, 'docs/backend-v2/contracts')
const budgetPath = path.join(contractDir, 'diagnosis-visual-image-input.v1.json')
const contractPath = path.join(contractDir, 'diagnosis-visual-image-input.md')

interface ImageInputBudget {
  contractVersion: string
  maxImagesPerCall: number
  maxPixels: number
  pixelsPerToken: number
  imageMarkerTokens: number
  perImageMaxTokens: number
  prefixReserveTokens: number
  contextSummaryMaxTokens: number
  userTextMaxTokens: number
  inputTierCeilingTokens: number
  safetyMarginRatio: number
  resize: { mode: string; keepAspectRatio: boolean; upscale: boolean; enforcedAt: string }
  uploadLimitRef: string
}

function loadBudget(): ImageInputBudget {
  assert.ok(fs.existsSync(budgetPath), `缺少图片输入预算制品：${budgetPath}`)
  return JSON.parse(fs.readFileSync(budgetPath, 'utf8')) as ImageInputBudget
}

describe('视觉诊断图片输入合同 v1', () => {
  test('单图 token 上限由像素上限推出（32×32 像素/token + 2 个标记）', () => {
    const budget = loadBudget()
    expect(budget.maxPixels).toBe(1024 * 1024)
    expect(budget.perImageMaxTokens).toBe(
      budget.maxPixels / budget.pixelsPerToken + budget.imageMarkerTokens
    )
    expect(budget.perImageMaxTokens).toBe(1026)
  })

  test('最多 3 张图时单次输入不超过 32K 档的 90%', () => {
    const budget = loadBudget()
    expect(budget.maxImagesPerCall).toBe(3)
    const total =
      budget.prefixReserveTokens +
      budget.contextSummaryMaxTokens +
      budget.userTextMaxTokens +
      budget.maxImagesPerCall * budget.perImageMaxTokens
    expect(total).toBeLessThanOrEqual(
      budget.inputTierCeilingTokens * (1 - budget.safetyMarginRatio)
    )
    expect(budget.inputTierCeilingTokens).toBe(32000)
    expect(budget.safetyMarginRatio).toBe(0.1)
  })

  test('服务端缩放是必经步骤：只缩不放大、保持长宽比', () => {
    const budget = loadBudget()
    expect(budget.resize).toEqual({
      mode: 'downscale_only',
      keepAspectRatio: true,
      upscale: false,
      enforcedAt: 'server_before_model'
    })
    expect(budget.uploadLimitRef).toBe('storage.upload.max_image_bytes')
  })

  test('配置目录：每次诊断最多图片数已冻结为 3（策略发布层）', () => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'),
        'utf8'
      )
    ) as {
      variables: { id: string; status: string; currentValue: unknown; configurationTier: string }[]
    }
    const item = catalog.variables.find(variable => variable.id === 'diagnosis.visual.max_images')
    expect(item).toMatchObject({
      status: 'confirmed',
      currentValue: 3,
      configurationTier: 'policy'
    })
  })

  test('合同正文写明服务端缩放与客户端不限制像素，并登记注册表哈希', () => {
    assert.ok(fs.existsSync(contractPath), `缺少合同正文：${contractPath}`)
    const content = fs.readFileSync(contractPath, 'utf8')
    expect(content).toContain('合同版本：`diagnosis-visual-image-input/v1`')
    expect(content).toContain('客户端不限制像素')
    expect(content).toContain('只缩不放大')
    expect(content).toContain('max_pixels')
    const registry = JSON.parse(
      fs.readFileSync(path.join(contractDir, 'contract-registry.json'), 'utf8')
    ) as {
      contracts: { id: string; file: string; sha256: string }[]
    }
    for (const id of ['diagnosis-visual-image-input', 'diagnosis-visual-image-input-budget']) {
      const entry = registry.contracts.find(item => item.id === id)
      assert.ok(entry, `注册表缺少 ${id}`)
      const bytes = fs.readFileSync(path.join(contractDir, entry.file))
      expect(entry.sha256).toBe(createHash('sha256').update(bytes).digest('hex'))
    }
  })
})
