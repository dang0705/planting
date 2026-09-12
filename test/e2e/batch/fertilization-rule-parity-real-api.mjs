#!/usr/bin/env node

import assert from 'node:assert/strict'
import { runWithParsedArgs } from './diagnosis/cloudbase-http-check.mjs'

// data_mode=e2e_real_api
// 只读取真实 LAN gateway、真实 cloud1_dev API 和真实开发库，不写入 fixture 或直接写库。

const ENV_ID = String(process.env.CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e').trim()
const OPENID = String(process.env.FERTILIZATION_E2E_OPENID || '').trim()
const BASE_URL = String(process.env.TERMINAL_E2E_FUNCTION_BASE_URL || '').trim()
const APP_ENV = 'development'
const CURRENT_MONTH = Number(
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Shanghai',
    month: 'numeric'
  }).format(new Date())
)

function json(value) {
  return JSON.stringify(value || {})
}

async function call(path, method = 'GET', { query = {}, body = null } = {}) {
  const result = await runWithParsedArgs({
    env: ENV_ID,
    'app-env': APP_ENV,
    'skip-auth': 'true',
    openid: OPENID,
    'terminal-e2e': 'true',
    path,
    method,
    query: json(query),
    body: body === null ? '' : json(body)
  })
  return result.response
}

function dataOf(response, label) {
  assert.equal(response?.status, 200, `${label}: HTTP ${response?.status}`)
  assert.equal(response?.body?.code, 200, `${label}: code=${response?.body?.code}`)
  return response.body.data
}

function currentCell(plant, type) {
  const row = (plant?.fertilizationMonthly?.rows || []).find(
    item => Number(item?.month) === CURRENT_MONTH
  )
  return row?.[type] || null
}

function isInterval(cell) {
  return (
    cell?.schedule?.schemaVersion === 1 &&
    cell?.schedule?.kind === 'interval' &&
    cell?.schedule?.interval?.min &&
    cell?.schedule?.interval?.max &&
    Array.isArray(cell?.sourceNames) &&
    cell.sourceNames.length > 0
  )
}

function isPauseOrAvoid(cell) {
  return ['pause', 'avoid'].includes(String(cell?.schedule?.kind || ''))
}

function findFixedPlant(plants) {
  return plants.find(plant => {
    const liquid = currentCell(plant, 'liquid')
    const slowRelease = currentCell(plant, 'slowRelease')
    return !plant?.fertilizationReminder && isInterval(liquid) && isInterval(slowRelease)
  })
}

function findPausePlant(plants) {
  return plants.find(plant => {
    const liquid = currentCell(plant, 'liquid')
    const slowRelease = currentCell(plant, 'slowRelease')
    return !plant?.fertilizationReminder && isPauseOrAvoid(liquid) && isPauseOrAvoid(slowRelease)
  })
}

async function readReminder(plantId) {
  return dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders', 'GET', {
      query: { plantId }
    }),
    `读取植物 ${plantId} 的真实施肥提醒状态`
  )
}

async function main() {
  assert.ok(BASE_URL, '必须设置 TERMINAL_E2E_FUNCTION_BASE_URL，禁止回退到旧云端部署')
  assert.ok(OPENID, '必须设置 FERTILIZATION_E2E_OPENID，禁止使用默认匿名用户')
  assert.equal(ENV_ID, 'cloud1-2grufevs395a9d5e', '本用例只允许开发环境 cloud1_dev')

  const list = dataOf(
    await call('plant-user-http/user-plants', 'GET', { query: { page: 1, pageSize: 50 } }),
    '读取真实开发库植物列表'
  )
  const plants = Array.isArray(list?.list) ? list.list : []
  const fixedPlant = findFixedPlant(plants)
  const pausePlant = findPausePlant(plants)
  assert.ok(fixedPlant?.id, '真实开发库必须存在液体肥和缓释肥均为固定周期的植物')
  assert.ok(pausePlant?.id, '真实开发库必须存在两种肥料均暂停或不建议追加的植物')

  const fixedReminder = await readReminder(fixedPlant.id)
  assert.equal(fixedReminder.active, false)
  assert.equal(fixedReminder.currentMonthConclusion?.status, 'monthly_fixed_interval')
  const fixedLiquid = fixedReminder.currentMonthOptions?.find(item => item.type === 'liquid')
  const fixedSlowRelease = fixedReminder.currentMonthOptions?.find(
    item => item.type === 'slowRelease'
  )
  assert.ok(fixedLiquid, '固定周期植物必须返回液体肥选项')
  assert.ok(fixedSlowRelease, '固定周期植物必须返回缓释肥选项')
  assert.deepEqual(fixedLiquid.conditionRequirements, [], '液体肥不应额外要求生长条件')
  assert.deepEqual(
    fixedSlowRelease.conditionRequirements?.map(item => item.code),
    ['active_growth'],
    '缓释肥只应要求近期有新叶或新芽，不应询问容器条件'
  )
  assert.ok(fixedLiquid.sourceNames.length > 0)
  assert.ok(fixedSlowRelease.sourceNames.length > 0)

  const pauseReminder = await readReminder(pausePlant.id)
  assert.equal(pauseReminder.active, false)
  assert.ok(
    ['monthly_pause', 'monthly_avoid'].includes(pauseReminder.currentMonthConclusion?.status),
    `暂停或不建议追加时必须返回阻断结论，实际为 ${pauseReminder.currentMonthConclusion?.status}`
  )
  assert.deepEqual(
    pauseReminder.currentMonthOptions,
    [],
    '两种肥料均暂停或不建议追加时不得返回提醒选项'
  )

  console.log(
    JSON.stringify(
      {
        dataMode: 'e2e_real_api',
        environment: 'cloud1_dev',
        fixedPlantId: fixedPlant.id,
        pausePlantId: pausePlant.id,
        fixedLiquid: fixedLiquid.displayText,
        fixedSlowRelease: fixedSlowRelease.displayText,
        fixedSlowReleaseConditions: fixedSlowRelease.conditionRequirements.map(item => item.code),
        pauseConclusion: pauseReminder.currentMonthConclusion.status
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(`[e2e_real_api] failed: ${error.stack || error.message}`)
  process.exitCode = 1
})
