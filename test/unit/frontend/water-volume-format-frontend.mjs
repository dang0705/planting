'use strict'

/**
 * 前端水量工具测试：油桶文案口径、盆体积估算、巨盆二次确认判定。
 * 文案换算全部在前端，后端只返回 amountRangeMl。
 */

import assert from 'node:assert/strict'
import {
  BOTTLE_ML,
  BUCKET_ML,
  OVERSIZED_POT_VOLUME_ML,
  formatMlToBottleText,
  formatMlRangeToBottleText,
  resolveWateringDoseOptions,
  isDoseOptionsUsingBucket,
  estimatePotVolumeMl,
  isOversizedPot
} from '../../../src/utils/water-volume-format.js'

function test(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

test('常量：瓶 550ml、油桶 5000ml、巨盆阈值 50000ml', () => {
  assert.equal(BOTTLE_ML, 550)
  assert.equal(BUCKET_ML, 5000)
  assert.equal(OVERSIZED_POT_VOLUME_ML, 50000)
})

test('文案：≥2500ml 用油桶、0.5 粒度', () => {
  assert.match(formatMlToBottleText(5000), /1 × 5L油桶/)
  assert.match(formatMlToBottleText(85118), /5L油桶/)
  assert.match(formatMlToBottleText(2500), /5L油桶/)
  assert.match(formatMlToBottleText(550), /1 × 矿泉水瓶/)
})

test('文案：2499ml 仍用瓶（不足2500不进油桶）', () => {
  assert.doesNotMatch(formatMlToBottleText(2499), /桶/)
})

test('文案：带完整单位后缀', () => {
  assert.match(formatMlToBottleText(550), /矿泉水瓶/)
  assert.match(formatMlToBottleText(5000), /5L油桶/)
})

test('体积估算：100x100x50 圆柱盆 ≈ 393 升', () => {
  const v = estimatePotVolumeMl({
    potTopDiameterCm: 100,
    potBottomDiameterCm: 100,
    potHeightCm: 50
  })
  assert.ok(v > 390000 && v < 395000, `实际 ${Math.round(v)}ml`)
})

test('巨盆判定：100x100x50 触发二次确认', () => {
  assert.equal(
    isOversizedPot({ potTopDiameterCm: 100, potBottomDiameterCm: 100, potHeightCm: 50 }),
    true
  )
})

test('常规盆不触发：口径20 高18', () => {
  assert.equal(
    isOversizedPot({ potTopDiameterCm: 20, potBottomDiameterCm: 16, potHeightCm: 18 }),
    false
  )
})

test('缺尺寸返回 0，不误触发', () => {
  assert.equal(estimatePotVolumeMl({}), 0)
  assert.equal(isOversizedPot({}), false)
})

/* ============================================================
 * dose slider 桶判定阈值（10% 盆体积 ≥ 2500ml 即含桶档）
 * ============================================================ */

test('dose slider: 常规盆(15000ml)最低档不含桶--10%档=1500ml < 2500ml', () => {
  assert.equal(isDoseOptionsUsingBucket(15000), false)
  // 混排模式：低档用瓶，高档（≥2500ml）可能用桶
  const opts = resolveWateringDoseOptions(15000)
  assert.ok(opts.some(o => o.label.includes('瓶')))
})

test('dose slider: 大盆(50000ml)含桶--10%档=5000ml ≥ 2500ml', () => {
  assert.equal(isDoseOptionsUsingBucket(50000), true)
  const opts = resolveWateringDoseOptions(50000)
  assert.ok(opts.some(o => o.label.includes('桶')))
})

test('dose slider: 阈值边界 potVolumeMl=25000 恰好切桶', () => {
  // 25000×0.1=2500 ≥2500 -> 含桶
  assert.equal(isDoseOptionsUsingBucket(25000), true)
  // 24990×0.1=2499 <2500 -> 不含桶
  assert.equal(isDoseOptionsUsingBucket(24990), false)
})

test('dose slider: 档位 label 为「约 N × 单位」格式', () => {
  const opts = resolveWateringDoseOptions(50000)
  // 大盆档位应为「约 N × 5L油桶」格式（不再含换行）
  const bucketOpt = opts.find(o => o.icon === 'bucket')
  assert.ok(bucketOpt, '大盆档位应含桶')
  assert.match(bucketOpt.label, /约 .+ × 5L油桶/, '桶档 label 应为「约 N × 5L油桶」格式')
})

test('formatRange: [1000,1500] 用瓶（与 slider 一致）', () => {
  assert.match(formatMlRangeToBottleText([1000, 1500]), /瓶/)
})

test('formatRange: [6000,9000] 用桶（与 slider 一致）', () => {
  assert.match(formatMlRangeToBottleText([6000, 9000]), /桶/)
})

console.log('\n前端水量工具测试全部通过')
