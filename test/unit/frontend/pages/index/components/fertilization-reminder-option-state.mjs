#!/usr/bin/env node

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake
// test_kind=source_contract
// 本用例只验证前端源码契约，不验证真实小程序渲染、点击结果或 wx.request。

const sheetSource = readFileSync('src/pages/index/components/FertilizationMonthlySheet.vue', 'utf8')
const setupSource = readFileSync(
  'src/pages/index/components/FertilizationReminderSetup.vue',
  'utf8'
)

assert.match(
  sheetSource,
  /serverCurrentMonthOptions\.value\)\s*\?\s*serverCurrentMonthOptions\.value\s*:\s*resolveCurrentMonthOptions/u,
  '前端必须优先使用真实提醒接口返回的当前月肥料选项'
)
assert.match(
  sheetSource,
  /currentMonthOptions\.value\.some\(option\s*=>\s*option\.type\s*===\s*selectedType\.value\)/u,
  '前端只能按用户选择的肥料类型判断当前月是否可设置提醒'
)
assert.match(
  sheetSource,
  /resolveLocalConditionPreflight\(type\s*=\s*selectedType\.value\)/u,
  '切换肥料类型后必须重新计算对应的条件问询'
)
assert.match(
  sheetSource,
  /conditionRequirements\s*\|\|\s*\[\]\)\s*\.filter\([\s\S]*?\)\s*\.every\(/u,
  '存在非生长条件时，提交前必须逐项检查条件回答；生长条件由 Alert 统一确认'
)
assert.match(
  setupSource,
  /option\.type === 'slowRelease' \? 'slow-release' : 'liquid'/u,
  '液体肥和缓释肥必须由稳定的类型映射到独立选择入口'
)
assert.match(
  setupSource,
  /:id="`fertilization-reminder-option-\$\{/u,
  '肥料选择入口必须暴露稳定的自动化 id'
)
assert.match(
  setupSource,
  /fertilizerLabel\(option\.type\)/u,
  '前端显示名称必须来自肥料类型，而不是任意服务端 label'
)

console.log('fertilization reminder option state frontend unit contract passed')
