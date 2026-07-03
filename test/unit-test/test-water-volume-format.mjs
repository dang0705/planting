'use strict'

/**
 * 矿泉水瓶度量 + 落档动态化 单元测试（Task 5）。
 *
 * 覆盖：
 *   - formatMlToBottleText：ml → 「约X瓶」连续换算文案
 *   - classifyDoseByVolumeRatio：按 ml/盆体积 百分比落档（无盆体积 fallback 固定 ml）
 *   - resolveMlToDoseClass：录入侧 ml → 相对档反推
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const {
  BOTTLE_ML,
  formatMlToBottleText,
  formatMlRangeToBottleText,
  classifyDoseByVolumeRatio,
  resolveMlToDoseClass,
  DOSE_CLASS
} = require('../../cloudfunctions/layer/utils/water-volume-format.js')

function test(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
  } catch (error) {
    console.error(`✗ ${name}`)
    throw error
  }
}

/* ============================================================
 * 1. 瓶数换算文案
 * ============================================================ */

test('format: 基准瓶为 550ml', () => {
  assert.equal(BOTTLE_ML, 550)
})

test('format: 极少量走"喷一喷"', () => {
  assert.match(formatMlToBottleText(20), /喷/)
  assert.match(formatMlToBottleText(0), /喷|—|无/)
})

test('format: 约半瓶（275ml 附近）', () => {
  const text = formatMlToBottleText(275)
  assert.match(text, /半瓶/)
  assert.match(text, /275|ml/)
})

test('format: 约1瓶（550ml）', () => {
  const text = formatMlToBottleText(550)
  assert.match(text, /1\s*瓶|一瓶/)
})

test('format: 约1.5瓶（825ml）', () => {
  const text = formatMlToBottleText(825)
  assert.match(text, /1\.5\s*瓶/)
})

test('format: 2500~5000ml 仍用瓶（未达5升油桶）', () => {
  const text = formatMlToBottleText(2600)
  assert.match(text, /瓶/)
  assert.doesNotMatch(text, /桶/)
})

test('format: ≥5升改用油桶计量（约N桶）', () => {
  // 5000ml = 1 桶
  assert.match(formatMlToBottleText(5000), /约1桶/)
  assert.match(formatMlToBottleText(5000), /5升油桶|5L|升/)
  // 12000ml ≈ 2.4 桶 → 四舍五入 约2桶
  assert.match(formatMlToBottleText(12000), /约2桶/)
  // 85118ml ≈ 17.0 桶 → 约17桶
  assert.match(formatMlToBottleText(85118), /约17桶/)
})

test('format: 4999ml 仍用瓶（不足5升不进油桶）', () => {
  assert.doesNotMatch(formatMlToBottleText(4999), /桶/)
})

test('format: 0.5 瓶粒度就近取整', () => {
  // 400ml ≈ 0.73 瓶 → 就近 0.5 瓶粒度应落"约半瓶"或"约1瓶"，且带 ml
  const text = formatMlToBottleText(400)
  assert.match(text, /瓶/)
  assert.match(text, /400|ml/)
})

test('formatRange: 区间用上限换算瓶数', () => {
  // [55,83] → 用上限 83 换算 ≈ 0.5 瓶
  const text = formatMlRangeToBottleText([55, 83])
  assert.match(text, /瓶|喷/)
  assert.match(text, /ml/)
})

test('formatRange: 暂停区间 [0,0] 提示暂停', () => {
  const text = formatMlRangeToBottleText([0, 0])
  assert.match(text, /暂停|无需|—/)
})

test('formatRange: 非法输入回退安全文案', () => {
  assert.equal(typeof formatMlRangeToBottleText(null), 'string')
  assert.equal(typeof formatMlRangeToBottleText([]), 'string')
})

/* ============================================================
 * 2. 按盆体积百分比落档（动态化）
 * ============================================================ */

test('classify: 有盆体积时按百分比落档（5/15/40）', () => {
  const V = 1000
  assert.equal(classifyDoseByVolumeRatio(40, V), DOSE_CLASS.MIST) // 4% ≤5
  assert.equal(classifyDoseByVolumeRatio(120, V), DOSE_CLASS.SMALL) // 12% ≤15
  assert.equal(classifyDoseByVolumeRatio(300, V), DOSE_CLASS.NORMAL) // 30% ≤40
  assert.equal(classifyDoseByVolumeRatio(500, V), DOSE_CLASS.THOROUGH) // 50% >40
})

test('classify: 大盆 vs 小盆 同 ml 落不同档', () => {
  // 300ml 对 5000ml 大盆 = 6% → 少量；对 500ml 小盆 = 60% → 浇透
  assert.equal(classifyDoseByVolumeRatio(300, 5000), DOSE_CLASS.SMALL)
  assert.equal(classifyDoseByVolumeRatio(300, 500), DOSE_CLASS.THOROUGH)
})

test('classify: 无盆体积 fallback 到固定 ml 阈值（30/80/300）', () => {
  assert.equal(classifyDoseByVolumeRatio(30, 0), DOSE_CLASS.MIST)
  assert.equal(classifyDoseByVolumeRatio(80, 0), DOSE_CLASS.SMALL)
  assert.equal(classifyDoseByVolumeRatio(300, 0), DOSE_CLASS.NORMAL)
  assert.equal(classifyDoseByVolumeRatio(400, 0), DOSE_CLASS.THOROUGH)
})

/* ============================================================
 * 3. 录入侧 ml → 相对档反推
 * ============================================================ */

test('resolveMlToDoseClass: 有盆体积按百分比反推', () => {
  const V = 1000
  assert.equal(resolveMlToDoseClass(40, V), DOSE_CLASS.MIST)
  assert.equal(resolveMlToDoseClass(500, V), DOSE_CLASS.THOROUGH)
})

test('resolveMlToDoseClass: 无盆体积 fallback 固定阈值', () => {
  assert.equal(resolveMlToDoseClass(30, 0), DOSE_CLASS.MIST)
  assert.equal(resolveMlToDoseClass(400, null), DOSE_CLASS.THOROUGH)
})

test('resolveMlToDoseClass: 非法 ml 返回 unknown', () => {
  assert.equal(resolveMlToDoseClass(null, 1000), DOSE_CLASS.UNKNOWN)
  assert.equal(resolveMlToDoseClass(NaN, 1000), DOSE_CLASS.UNKNOWN)
})

console.log('\n矿泉水瓶度量 + 落档动态化测试全部通过')
