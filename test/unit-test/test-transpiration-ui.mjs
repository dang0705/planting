'use strict'

/**
 * 独立浇水 UI + 共享 Layer 回归测试 —— 浇水算法 v3。
 *
 * 覆盖：
 *   - UI 结果区允许列表断言：只包含毫升数文本和导航按钮
 *   - UI 不导入 formatMlRangeToBottleText
 *   - 回归断言：diagnosis 与 transpiration 共同消费同一 Layer 暴露模块
 *   - diagnose-http light-health-factors 不保留原始 FACTORS 定义（仅 re-export）
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

async function runAll() {
  for (const { name, fn } of tests) {
    try {
      await fn()
      console.log(`✓ ${name}`)
    } catch (error) {
      console.error(`✗ ${name}`)
      throw error
    }
  }
  console.log('transpiration UI + shared layer regression tests passed')
}

/* ============================================================
 * 1. UI 结果区允许列表断言
 * ============================================================ */

test('watering-advisor.vue 结果区只包含毫升数文本和导航按钮', () => {
  const vue = fs.readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
  // 只检查 plannerResult 条件块内的内容（v-else-if="plannerResult"）
  const resultStart = vue.indexOf('v-else-if="plannerResult"')
  const resultEnd = vue.indexOf('</view>', vue.indexOf('watering-advisor-done', resultStart))
  const resultSection = vue.slice(resultStart, resultEnd)

  // 允许的内容：amountText、重新输入/完成按钮
  assert.ok(resultSection.includes('amountText'), '结果区应包含建议毫升数 amountText')
  assert.ok(resultSection.includes('watering-advisor-back-2'), '结果区应包含重新输入按钮')
  assert.ok(resultSection.includes('watering-advisor-done'), '结果区应包含完成按钮')

  // 禁止的内容（允许列表之外的结果说明）
  const forbidden = [
    '盆型概要',
    'formatMlRangeToBottleText',
    'nextWaterDate',
    'nextWaterWindow',
    'wateringContext',
    '光照',
    '蒸腾',
    '建议浇水',
    'selectedCatalogPlantName',
    '💧',
    'stopCondition',
    'confidenceLevel',
    '浇水建议'
  ]
  for (const word of forbidden) {
    assert.ok(!resultSection.includes(word), `结果区不应包含 "${word}"`)
  }
})

test('watering-advisor.vue 不导入 formatMlRangeToBottleText', () => {
  const vue = fs.readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
  assert.ok(!vue.includes('formatMlRangeToBottleText'), '不应导入 formatMlRangeToBottleText')
})

/* ============================================================
 * 2. 回归断言：diagnosis 与 transpiration 共同消费同一 Layer 暴露模块
 * ============================================================ */

test('diagnose-http light-health-estimator 和 transpiration 都 import 同一 layer/utils/light-exposure', () => {
  const transpirationSrc = fs.readFileSync('cloudfunctions/layer/utils/transpiration.js', 'utf8')
  const estimatorSrc = fs.readFileSync(
    'cloudfunctions/diagnose-http/utils/light-health-estimator.js',
    'utf8'
  )
  const factorsSrc = fs.readFileSync(
    'cloudfunctions/diagnose-http/utils/light-health-factors.js',
    'utf8'
  )
  const normalizeSrc = fs.readFileSync(
    'cloudfunctions/diagnose-http/utils/light-health-normalize.js',
    'utf8'
  )

  // transpiration 直接 require 共享层
  assert.ok(
    transpirationSrc.includes("require('./light-exposure')"),
    'transpiration.js 应 require light-exposure'
  )
  // diagnose-http estimator 通过 /opt/utils 或 ../../layer 代理 require 共享层
  assert.ok(
    estimatorSrc.includes('light-exposure'),
    'light-health-estimator.js 应引用 light-exposure 共享层'
  )
  // diagnose-http factors 和 normalize 是 re-export 代理，不保留原始常量定义
  assert.ok(
    factorsSrc.includes('light-exposure-factors'),
    'light-health-factors.js 应 re-export 自 light-exposure-factors'
  )
  assert.ok(
    normalizeSrc.includes('light-exposure-normalize'),
    'light-health-normalize.js 应 re-export 自 light-exposure-normalize'
  )
  // 验证 transpiration 不保留重复常量
  assert.ok(
    !transpirationSrc.includes('MEANINGFUL_FACING_KEYS'),
    'transpiration.js 不应保留重复的 facing keys 常量'
  )
})

test('diagnose-http light-health-factors 不保留原始 FACTORS 定义（仅 re-export）', () => {
  const factorsSrc = fs.readFileSync(
    'cloudfunctions/diagnose-http/utils/light-health-factors.js',
    'utf8'
  )
  // re-export 代理文件不应包含 const FACTORS = { ... } 定义
  assert.ok(
    !factorsSrc.includes('const FACTORS ='),
    'light-health-factors.js 不应保留原始 FACTORS 定义，应仅 re-export'
  )
})

await runAll()
