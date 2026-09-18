'use strict'

/**
 * 水量工具单元测试。
 *
 * Part 1：文案换算（前端 src/utils/water-volume-format.js）
 * Part 2/3：剂量落档算法（后端 cloudfunctions/layer/utils/water-volume-format.js）
 */

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import {
  BOTTLE_ML,
  formatMlToBottleText,
  formatMlRangeToBottleText
} from '../../../../src/utils/water-volume-format.js'

const require = createRequire(import.meta.url)

const {
  classifyDoseByVolumeRatio,
  resolveMlToDoseClass,
  DOSE_CLASS
} = require('../../../../cloudfunctions/layer/utils/water-volume-format.js')

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
 * 1. 瓶数换算文案（前端）
 * ============================================================ */

test('format: 基准瓶为 550ml', () => {
  assert.equal(BOTTLE_ML, 550)
})

test('format: 极少量归约半瓶', () => {
  assert.match(formatMlToBottleText(20), /半瓶/)
  assert.match(formatMlToBottleText(0), /无需/)
})

test('format: 约半瓶（275ml 附近）', () => {
  const text = formatMlToBottleText(275)
  assert.match(text, /半瓶/)
  assert.match(text, /矿泉水瓶/)
})

test('format: 约1瓶（550ml）', () => {
  const text = formatMlToBottleText(550)
  assert.match(text, /1\s*瓶/)
})

test('format: 约1.5瓶（825ml）', () => {
  const text = formatMlToBottleText(825)
  assert.match(text, /1\.5\s*瓶/)
})

test('format: 2500ml 达到油桶门槛用桶', () => {
  const text = formatMlToBottleText(2500)
  assert.match(text, /桶/)
  assert.doesNotMatch(text, /瓶/)
})

test('format: ≥2500ml 用油桶计量（约N桶）', () => {
  assert.match(formatMlToBottleText(5000), /约1桶/)
  assert.match(formatMlToBottleText(5000), /5L/)
  assert.match(formatMlToBottleText(12000), /约2桶/)
  assert.match(formatMlToBottleText(85118), /约17桶/)
})

test('format: 2499ml 仍用瓶（不足2500不进油桶）', () => {
  assert.doesNotMatch(formatMlToBottleText(2499), /桶/)
})

test('formatRange: 区间用上限换算瓶数', () => {
  const text = formatMlRangeToBottleText([55, 83])
  assert.match(text, /瓶/)
})

test('formatRange: 暂停区间 [0,0] 提示暂停', () => {
  const text = formatMlRangeToBottleText([0, 0])
  assert.match(text, /暂停|无需|-/)
})

test('formatRange: 非法输入回退安全文案', () => {
  assert.equal(typeof formatMlRangeToBottleText(null), 'string')
  assert.equal(typeof formatMlRangeToBottleText([]), 'string')
})

test('formatRange: [1000,1500] 都<2500 -> 瓶', () => {
  const text = formatMlRangeToBottleText([1000, 1500])
  assert.match(text, /瓶/)
  assert.doesNotMatch(text, /桶/)
})

test('formatRange: [6000,9000] 都≥2500 -> 桶', () => {
  const text = formatMlRangeToBottleText([6000, 9000])
  assert.match(text, /桶/)
})

/* ============================================================
 * 2. 按盆体积百分比落档（动态化）-- 后端算法
 * ============================================================ */

test('classify: 有盆体积时按百分比落档（5/15/40）', () => {
  const V = 1000
  assert.equal(classifyDoseByVolumeRatio(40, V), DOSE_CLASS.MIST) // 4% ≤5
  assert.equal(classifyDoseByVolumeRatio(120, V), DOSE_CLASS.SMALL) // 12% ≤15
  assert.equal(classifyDoseByVolumeRatio(300, V), DOSE_CLASS.NORMAL) // 30% ≤40
  assert.equal(classifyDoseByVolumeRatio(500, V), DOSE_CLASS.THOROUGH) // 50% >40
})

test('classify: 大盆 vs 小盆 同 ml 落不同档', () => {
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
 * 3. 录入侧 ml -> 相对档反推 -- 后端算法
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

console.log('\n水量工具测试全部通过')
