#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// data_mode=e2e_real_api
// 只调用真实 LAN gateway、真实 cloud1_dev API 和真实开发库；不写入 fixture，也不直接写施肥历史。

const PROJECT_ROOT = process.cwd()
const BASE_URL = String(process.env.TERMINAL_E2E_FUNCTION_BASE_URL || '').trim().replace(/\/+$/, '')
const ENV_ID = String(process.env.CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e').trim()
const OPENID = String(
  process.env.FERTILIZATION_E2E_OPENID || 'dev_terminal_mp_local'
).trim()
const COMPLETE_PLANT_ID = Number(process.env.FERTILIZATION_COMPLETE_PLANT_ID || 0)
const SKIP_PLANT_ID = Number(process.env.FERTILIZATION_SKIP_PLANT_ID || 0)
const REPORT_PATH = path.join(
  PROJECT_ROOT,
  '.tmp/e2e-real-data/fertilization-reminder-completion-real-api.json'
)

function buildUrl(functionPath, query = {}) {
  const url = new URL(functionPath.replace(/^\/+/, ''), `${BASE_URL}/`)
  Object.entries({ ...query, webfn: 'true', skipAuth: 'true' }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value))
    }
  })
  return url
}

async function request(functionPath, { method = 'GET', query = {}, body } = {}) {
  const requestBody = body && typeof body === 'object' ? { ...body, skipAuth: true, openid: OPENID } : body
  const response = await fetch(buildUrl(functionPath, query), {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-openid': OPENID,
      'x-wx-openid': OPENID,
      'x-app-env': 'development',
      'x-env': 'development',
      'x-terminal-e2e': 'true'
    },
    ...(method === 'GET' ? {} : { body: JSON.stringify(requestBody || {}) })
  })
  const text = await response.text()
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    payload = { raw: text }
  }
  return { response, payload }
}

function assertSuccess(result, label) {
  assert.ok(
    result.response.ok,
    `${label} HTTP ${result.response.status}: ${JSON.stringify(result.payload)}`
  )
  assert.equal(Number(result.payload?.code), 200, `${label}: ${JSON.stringify(result.payload)}`)
}

function dataOf(result, label) {
  assertSuccess(result, label)
  return result.payload?.data
}

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function dateDaysAgo(days) {
  const [year, month, day] = todayInShanghai().split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - Number(days))
  return date.toISOString().slice(0, 10)
}

function assertFixedLiquidRule(plant, plantId) {
  const row = (plant?.fertilizationMonthly?.rows || []).find(
    item => Number(item?.month) === Number(todayInShanghai().slice(5, 7))
  )
  const cell = row?.liquid
  assert.equal(plant?.id, plantId)
  assert.equal(cell?.schedule?.schemaVersion, 1, `plant ${plantId} 月表 schema 不可用`)
  assert.equal(cell?.schedule?.kind, 'interval', `plant ${plantId} 当前月没有液体肥固定周期`)
  assert.ok(cell?.schedule?.interval?.min && cell?.schedule?.interval?.max)
  assert.ok(Array.isArray(cell?.sourceNames) && cell.sourceNames.length > 0)
  return cell
}

function assertNoRecordedFertilizationEvents(plant, label) {
  assert.ok(Array.isArray(plant?.fertilizationEvents), `${label} 施肥历史结构不可用`)
  assert.equal(
    plant.fertilizationEvents.some(event => event?.fertilized === true),
    false,
    `${label} 已存在真实施肥事件，不能重复执行一次性完成测试`
  )
  assert.ok(
    (plant?.fertilizationHistory || []).every(event => event?.source === 'user_asserted'),
    `${label} 只能存在用户补录安全基线，不能存在真实施肥历史`
  )
}

async function readPlant(plantId) {
  return dataOf(
    await request('plant-user-http/user-plants', { query: { id: plantId } }),
    `读取植物 ${plantId}`
  )
}

function hasActiveFertilizationGuard(plant) {
  const guard = plant?.fertilizationGuard
  return Boolean(
    guard?.status === 'deferred' &&
      (!guard.expiresAt || String(guard.expiresAt) >= todayInShanghai())
  )
}

async function findCleanPlant(excludeId = 0) {
  const list = dataOf(
    await request('plant-user-http/user-plants', { query: { page: 1, pageSize: 50 } }),
    '读取真实开发库候选植物'
  )
  for (const candidate of list?.list || []) {
    if (Number(candidate?.id) === Number(excludeId)) {
      continue
    }
    const plant = await readPlant(candidate.id)
    if (
      plant?.fertilizationReminder ||
      hasActiveFertilizationGuard(plant) ||
      plant?.healthStatus === 'danger' ||
      plant?.fertilizationHistoryStatus !== 'available'
    ) {
      continue
    }
    if ((plant.fertilizationEvents || []).some(event => event?.fertilized === true)) {
      continue
    }
    try {
      assertFixedLiquidRule(plant, plant.id)
      assertNoRecordedFertilizationEvents(plant, '候选测试植物')
      return plant
    } catch {
      continue
    }
  }
  return null
}

async function preview(plantId, extra = {}) {
  return dataOf(
    await request('plant-user-http/user-plants/fertilization-reminders/preview', {
      method: 'POST',
      body: {
        plantId,
        fertilizerType: 'liquid',
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true,
        ...extra
      }
    }),
    `植物 ${plantId} 生成施肥提醒预览`
  )
}

async function confirmDuePlan(plantId, planId) {
  return dataOf(
    await request('plant-user-http/user-plants/fertilization-reminders/confirm', {
      method: 'POST',
      body: { plantId, planId }
    }),
    `植物 ${plantId} 确认到期施肥提醒`
  )
}

async function cancelPlan(planId) {
  const result = await request('plant-user-http/user-plants/fertilization-reminders/cancel', {
    method: 'POST',
    body: { planId }
  })
  assertSuccess(result, `取消 pending 计划 ${planId}`)
  return result.payload?.data
}

async function establishDuePlan(plantId) {
  const assertedDate = dateDaysAgo(30)
  const assertedPreview = await preview(plantId, {
    userAssertedLastAppliedDate: assertedDate
  })
  assert.equal(assertedPreview.lastDateSource, 'user_asserted')
  assert.equal(assertedPreview.lastAppliedDate, assertedDate)
  await cancelPlan(assertedPreview.planId)

  const duePreview = await preview(plantId)
  assert.equal(duePreview.reminderKind, 'normal')
  assert.equal(duePreview.lastDateSource, 'user_asserted')
  assert.equal(duePreview.dueNow, true)
  assert.ok(String(duePreview.nextCheckDate) >= todayInShanghai())
  return duePreview
}

async function main() {
  assert.ok(BASE_URL, '必须设置 TERMINAL_E2E_FUNCTION_BASE_URL')
  assert.equal(ENV_ID, 'cloud1-2grufevs395a9d5e', '本测试只允许 cloud1_dev')

  const report = {
    dataMode: 'e2e_real_api',
    environment: 'cloud1_dev',
    environmentId: ENV_ID,
    baseUrl: BASE_URL,
    openidFingerprint: `${OPENID.slice(0, 4)}...${OPENID.slice(-4)}`,
    completion: null,
    skip: null
  }

  const completeBefore = COMPLETE_PLANT_ID
    ? await readPlant(COMPLETE_PLANT_ID)
    : await findCleanPlant()
  const skipBefore = SKIP_PLANT_ID
    ? await readPlant(SKIP_PLANT_ID)
    : await findCleanPlant(completeBefore?.id)
  assert.ok(completeBefore?.id, '开发库没有可用于真实完成路径的干净植物')
  assert.ok(skipBefore?.id, '开发库没有可用于真实跳过路径的干净植物')
  const completePlantId = Number(completeBefore.id)
  const skipPlantId = Number(skipBefore.id)
  assert.equal(completeBefore.fertilizationHistoryStatus, 'available')
  assert.equal(skipBefore.fertilizationHistoryStatus, 'available')
  assertNoRecordedFertilizationEvents(completeBefore, '完成测试植物')
  assertNoRecordedFertilizationEvents(skipBefore, '跳过测试植物')
  assert.equal(completeBefore.fertilizationGuard, null)
  assert.equal(skipBefore.fertilizationGuard, null)
  assertFixedLiquidRule(completeBefore, completePlantId)
  assertFixedLiquidRule(skipBefore, skipPlantId)

  const completePreview = await establishDuePlan(completePlantId)
  const activeComplete = await confirmDuePlan(completePlantId, completePreview.planId)
  assert.equal(activeComplete.status, 'active')

  const completeResult = dataOf(
    await request('plant-user-http/user-plants/fertilization-reminders/complete', {
      method: 'POST',
      body: {
        plantId: completePlantId,
        planId: completePreview.planId,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '真实 API 今天已施肥'
  )
  assert.equal(completeResult.completedDate, todayInShanghai())
  assert.ok(completeResult.nextPreview?.planId, '完成后应生成下一次 pending 预览')

  const completeAfter = await readPlant(completePlantId)
  const completedEvent = (completeAfter.fertilizationEvents || []).find(
    event => event.planId === completePreview.planId
  )
  assert.ok(completedEvent, '完成操作必须读回真实 user_fertilization_events 记录')
  assert.equal(completedEvent.date, todayInShanghai())
  assert.equal(completedEvent.fertilized, true)
  assert.equal(completedEvent.fertilizerType, 'liquid')
  assert.equal(completedEvent.source, 'reminder_complete')
  await cancelPlan(completeResult.nextPreview.planId)
  report.completion = {
    plantId: completePlantId,
    planId: completePreview.planId,
    completedDate: completedEvent.date,
    eventSource: completedEvent.source,
    historyCount: completeAfter.fertilizationHistory.length,
    nextPendingCancelled: true
  }

  const skipPreview = await establishDuePlan(skipPlantId)
  const activeSkip = await confirmDuePlan(skipPlantId, skipPreview.planId)
  assert.equal(activeSkip.status, 'active')
  const skipBeforeDismiss = await readPlant(skipPlantId)
  const skipResult = dataOf(
    await request('plant-user-http/user-plants/fertilization-reminders/dismiss', {
      method: 'POST',
      body: { plantId: skipPlantId, planId: skipPreview.planId }
    }),
    '真实 API 本次跳过'
  )
  assert.equal(skipResult.status, 'dismissed')
  const skipAfter = await readPlant(skipPlantId)
  assert.equal(
    skipAfter.fertilizationEvents.length,
    skipBeforeDismiss.fertilizationEvents.length,
    '本次跳过不得新增真实施肥事件'
  )
  assert.equal(
    skipAfter.fertilizationEvents.some(event => event.planId === skipPreview.planId),
    false
  )
  report.skip = {
    plantId: skipPlantId,
    planId: skipPreview.planId,
    status: skipResult.status,
    eventCountBefore: skipBeforeDismiss.fertilizationEvents.length,
    eventCountAfter: skipAfter.fertilizationEvents.length
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify({ ...report, reportPath: REPORT_PATH }, null, 2))
}

main().catch(error => {
  console.error(`[e2e_real_api] failed: ${error.stack || error.message}`)
  process.exitCode = 1
})
