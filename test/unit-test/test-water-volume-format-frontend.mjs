'use strict'

/**
 * 前端水量工具镜像测试：油桶文案口径、盆体积估算、巨盆二次确认判定。
 * 与后端 water-volume-format 口径一致性由「油桶阈值/换算」共同断言。
 */

import assert from 'node:assert/strict'
import {
  BOTTLE_ML,
  BUCKET_ML,
  OVERSIZED_POT_VOLUME_ML,
  formatMlToBottleText,
  estimatePotVolumeMl,
  isOversizedPot
} from '../../src/utils/water-volume-format.js'

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

test('前端文案与后端一致：≥5升用油桶、四舍五入', () => {
  assert.match(formatMlToBottleText(5000), /约1桶/)
  assert.match(formatMlToBottleText(85118), /约17桶/)
  assert.doesNotMatch(formatMlToBottleText(4999), /桶/)
  assert.match(formatMlToBottleText(550), /1瓶|约1瓶/)
})

test('体积估算：100x100x50 圆柱盆 ≈ 393 升', () => {
  const v = estimatePotVolumeMl({ potTopDiameterCm: 100, potBottomDiameterCm: 100, potHeightCm: 50 })
  assert.ok(v > 390000 && v < 395000, `实际 ${Math.round(v)}ml`)
})

test('巨盆判定：100x100x50 触发二次确认', () => {
  assert.equal(isOversizedPot({ potTopDiameterCm: 100, potBottomDiameterCm: 100, potHeightCm: 50 }), true)
})

test('常规盆不触发：口径20 高18', () => {
  assert.equal(isOversizedPot({ potTopDiameterCm: 20, potBottomDiameterCm: 16, potHeightCm: 18 }), false)
})

test('缺尺寸返回 0，不误触发', () => {
  assert.equal(estimatePotVolumeMl({}), 0)
  assert.equal(isOversizedPot({}), false)
})

console.log('\n前端水量工具镜像测试全部通过')
