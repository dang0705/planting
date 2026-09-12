#!/usr/bin/env node

import assert from 'node:assert/strict'
import { runWithParsedArgs } from './diagnosis/cloudbase-http-check.mjs'

const ENV_ID = String(process.env.CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e').trim()
const OPENID = String(
  process.env.FERTILIZATION_E2E_OPENID || process.env.VITE_DEV_OPENID || 'dev_terminal_mp_local'
).trim()
const BASE_URL = String(process.env.TERMINAL_E2E_FUNCTION_BASE_URL || '').trim()
const APP_ENV = 'development'
const CURRENT_MONTH = Number(
  new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', month: 'numeric' }).format(
    new Date()
  )
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

function dataOf(response, message = '真实 API 返回失败') {
  assert.equal(response?.status, 200, `${message}: HTTP ${response?.status}`)
  assert.equal(response?.body?.code, 200, `${message}: code=${response?.body?.code}`)
  return response.body.data
}

function currentCell(plant, fertilizerType) {
  const row = (plant?.fertilizationMonthly?.rows || []).find(
    item => Number(item?.month) === CURRENT_MONTH
  )
  return row?.[fertilizerType] || null
}

function isReliableInterval(cell) {
  return (
    cell?.schedule?.schemaVersion === 1 &&
    cell?.schedule?.kind === 'interval' &&
    cell?.schedule?.interval?.min &&
    cell?.schedule?.interval?.max &&
    Array.isArray(cell?.sourceNames) &&
    cell.sourceNames.length > 0
  )
}

function assertDateNotPast(value) {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
  assert.match(String(value || ''), /^\d{4}-\d{2}-\d{2}$/)
  assert.ok(String(value) >= today, `提醒日期 ${value} 不得早于今天 ${today}`)
}

function todayInShanghai() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date())
}

function hasActiveFertilizationGuard(plant) {
  const guard = plant?.fertilizationGuard
  return Boolean(
    guard?.status === 'deferred' &&
      (!guard.expiresAt || String(guard.expiresAt) >= todayInShanghai())
  )
}

function dateDaysAgo(days) {
  const date = new Date()
  date.setDate(date.getDate() - Number(days))
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date)
}

async function main() {
  assert(BASE_URL, '必须设置 TERMINAL_E2E_FUNCTION_BASE_URL，真实 API E2E 不允许默认访问云端旧部署')
  const list = dataOf(
    await call('plant-user-http/user-plants', 'GET', { query: { page: 1, pageSize: 50 } }),
    '读取开发库用户植物列表'
  )
  const plants = Array.isArray(list?.list) ? list.list : []
  const guardedPlant = plants.find(item => {
    const liquid = currentCell(item, 'liquid')
    const slowRelease = currentCell(item, 'slowRelease')
    return (
      hasActiveFertilizationGuard(item) &&
      (isReliableInterval(liquid) || isReliableInterval(slowRelease))
    )
  })
  let plant = null
  for (const candidate of plants) {
    const liquid = currentCell(candidate, 'liquid')
    const slowRelease = currentCell(candidate, 'slowRelease')
    if (
      candidate?.fertilizationReminder ||
      hasActiveFertilizationGuard(candidate) ||
      candidate?.healthStatus === 'danger' ||
      (!isReliableInterval(liquid) && !isReliableInterval(slowRelease))
    ) {
      continue
    }
    const detail = dataOf(
      await call('plant-user-http/user-plants', 'GET', {
        query: { id: candidate.id }
      }),
      `读取候选植物 ${candidate.id} 施肥历史`
    )
    const hasRecordedHistory = (detail?.fertilizationEvents || []).some(
      event => event?.fertilized === true
    )
    if (
      !hasRecordedHistory &&
      !hasActiveFertilizationGuard(detail) &&
      detail?.healthStatus !== 'danger'
    ) {
      plant = detail
      break
    }
  }
  assert.ok(plant?.id, '开发库当前用户没有可用于真实施肥 API E2E 的固定周期植物')

  let guardScenario = 'not_available'
  if (guardedPlant?.id) {
    const guardedType = isReliableInterval(currentCell(guardedPlant, 'liquid'))
      ? 'liquid'
      : 'slowRelease'
    const blocked = await call(
      'plant-user-http/user-plants/fertilization-reminders/preview',
      'POST',
      {
        body: {
          plantId: guardedPlant.id,
          fertilizerType: guardedType,
          conditionAnswers: {},
          acknowledgeFertilizerTypeChange: true
        }
      }
    )
    assert.equal(blocked.status, 422, '有效暂缓施肥状态必须阻断真实提醒预览')
    assert.equal(
      blocked.body?.data?.blockingReason,
      'fertilization_guard',
      '暂缓施肥阻断必须返回明确原因'
    )
    guardScenario = 'blocked'
  }

  const currentLiquid = currentCell(plant, 'liquid')
  const currentSlowRelease = currentCell(plant, 'slowRelease')
  const fertilizerType = isReliableInterval(currentLiquid) ? 'liquid' : 'slowRelease'
  const selectedCell = fertilizerType === 'liquid' ? currentLiquid : currentSlowRelease

  const initial = await call('plant-user-http/user-plants/fertilization-reminders', 'GET', {
    query: { plantId: plant.id }
  })
  assert.equal(initial.status, 200, '读取真实施肥提醒状态')
  assert.equal(initial.body?.data?.active, false, '测试植物开始时不应有 active 施肥提醒')
  assert.equal(initial.body?.data?.plantId, plant.id, '无 active 状态仍需返回植物 id')
  assert.ok(initial.body?.data?.currentMonthConclusion?.status, '无 active 状态仍需返回当前月结论')

  const preview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '真实开发库首次确认预览'
  )
  assert.ok(['first_confirmation', 'normal'].includes(preview.reminderKind))
  if (preview.reminderKind === 'first_confirmation') {
    assert.equal(preview.lastAppliedDate, null)
    assert.equal(preview.lastDateSource, 'estimated')
  } else {
    assert.equal(preview.lastDateSource, 'user_asserted')
    assert.match(String(preview.lastAppliedDate || ''), /^\d{4}-\d{2}-\d{2}$/)
  }
  assert.ok(Array.isArray(preview.ruleSnapshot?.sourceNames))
  assert.ok(preview.ruleSnapshot.sourceNames.length > 0)
  assert.deepEqual(preview.ruleSnapshot.schedule, selectedCell.schedule)
  assertDateNotPast(preview.nextCheckDate)

  const cancel = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/cancel', 'POST', {
      body: { planId: preview.planId }
    }),
    '清理真实 pending 计划'
  )
  assert.equal(cancel.status, 'cancelled')

  const assertedDate = dateDaysAgo(30)
  const assertedPreview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        userAssertedLastAppliedDate: assertedDate,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '真实开发库补录上次施肥日期'
  )
  assert.equal(assertedPreview.reminderKind, 'normal')
  assert.equal(assertedPreview.lastDateSource, 'user_asserted')
  assert.equal(assertedPreview.lastAppliedDate, assertedDate)
  assertDateNotPast(assertedPreview.nextCheckDate)
  const assertedCancel = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/cancel', 'POST', {
      body: { planId: assertedPreview.planId }
    }),
    '清理补录日期计划'
  )
  assert.equal(assertedCancel.status, 'cancelled')

  const persistedBaselinePreview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '读取取消提醒后的补录日期基线'
  )
  assert.equal(persistedBaselinePreview.reminderKind, 'normal')
  assert.equal(persistedBaselinePreview.lastDateSource, 'user_asserted')
  assert.equal(persistedBaselinePreview.lastAppliedDate, assertedDate)
  assertDateNotPast(persistedBaselinePreview.nextCheckDate)
  const persistedBaselineCancel = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/cancel', 'POST', {
      body: { planId: persistedBaselinePreview.planId }
    }),
    '清理基线复读计划'
  )
  assert.equal(persistedBaselineCancel.status, 'cancelled')

  const skippedPreview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '生成真实跳过路径计划'
  )
  const skippedConfirm = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/confirm', 'POST', {
      body: {
        plantId: plant.id,
        planId: skippedPreview.planId,
        calendarPayload: {
          title: '施肥检查',
          startTime: skippedPreview.nextTime,
          endTime: skippedPreview.nextTime,
          description: '真实 API 回归'
        }
      }
    }),
    '确认真实跳过路径计划'
  )
  assert.equal(skippedConfirm.status, 'active')
  const skipped = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/dismiss', 'POST', {
      body: { plantId: plant.id, planId: skippedPreview.planId }
    }),
    '跳过真实施肥提醒'
  )
  assert.equal(skipped.status, 'dismissed')
  const skippedBaselinePreview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '读取跳过提醒后的补录日期基线'
  )
  assert.equal(skippedBaselinePreview.lastDateSource, 'user_asserted')
  assert.equal(skippedBaselinePreview.lastAppliedDate, assertedDate)
  assertDateNotPast(skippedBaselinePreview.nextCheckDate)
  await call('plant-user-http/user-plants/fertilization-reminders/cancel', 'POST', {
    body: { planId: skippedBaselinePreview.planId }
  })

  const reconfigurePreview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '生成真实重设路径计划'
  )
  const reconfigureConfirm = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/confirm', 'POST', {
      body: {
        plantId: plant.id,
        planId: reconfigurePreview.planId,
        calendarPayload: {
          title: '施肥检查',
          startTime: reconfigurePreview.nextTime,
          endTime: reconfigurePreview.nextTime,
          description: '真实 API 回归'
        }
      }
    }),
    '确认真实重设路径计划'
  )
  assert.equal(reconfigureConfirm.status, 'active')
  const reconfigured = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/dismiss', 'POST', {
      body: { plantId: plant.id, planId: reconfigurePreview.planId, reason: 'reconfigure' }
    }),
    '重设真实施肥提醒'
  )
  assert.equal(reconfigured.status, 'superseded')
  const reconfiguredBaselinePreview = dataOf(
    await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
      body: {
        plantId: plant.id,
        fertilizerType,
        conditionAnswers: {},
        acknowledgeFertilizerTypeChange: true
      }
    }),
    '读取重设提醒后的补录日期基线'
  )
  assert.equal(reconfiguredBaselinePreview.lastDateSource, 'user_asserted')
  assert.equal(reconfiguredBaselinePreview.lastAppliedDate, assertedDate)
  assertDateNotPast(reconfiguredBaselinePreview.nextCheckDate)
  await call('plant-user-http/user-plants/fertilization-reminders/cancel', 'POST', {
    body: { planId: reconfiguredBaselinePreview.planId }
  })

  const conditionalType = isReliableInterval(currentSlowRelease) ? 'slowRelease' : ''
  let conditionScenario = 'not_available'
  if (
    conditionalType &&
    currentSlowRelease.schedule.conditionCodes?.some(code => code !== 'none')
  ) {
    const blocked = await call(
      'plant-user-http/user-plants/fertilization-reminders/preview',
      'POST',
      {
        body: {
          plantId: plant.id,
          fertilizerType: conditionalType,
          conditionAnswers: {},
          acknowledgeFertilizerTypeChange: true
        }
      }
    )
    assert.equal(blocked.status, 422, '未回答条件时服务端必须拦截')
    assert.ok(blocked.body?.data?.conditionRequirements?.length)

    const conditionAnswers = Object.fromEntries(
      blocked.body.data.conditionRequirements.map(requirement => [requirement.code, true])
    )
    const allowed = dataOf(
      await call('plant-user-http/user-plants/fertilization-reminders/preview', 'POST', {
        body: {
          plantId: plant.id,
          fertilizerType: conditionalType,
          conditionAnswers,
          acknowledgeFertilizerTypeChange: true
        }
      }),
      '回答真实条件后的预览'
    )
    assertDateNotPast(allowed.nextCheckDate)
    await call('plant-user-http/user-plants/fertilization-reminders/cancel', 'POST', {
      body: { planId: allowed.planId }
    })
    conditionScenario = 'blocked_and_allowed'
  }

  console.log(
    JSON.stringify(
      {
        dataMode: 'e2e_real_api',
        env: 'cloud1_dev',
        openidFingerprint: `${OPENID.slice(0, 3)}…${OPENID.slice(-3)}`,
        plantId: plant.id,
        plantName: plant.displayName || plant.canonicalName,
        currentMonth: CURRENT_MONTH,
        fertilizerType,
        sourceNames: selectedCell.sourceNames,
        firstConfirmation: 'passed',
        userAssertedBaselinePersistence: 'passed',
        dateNotPast: 'passed',
        conditionScenario,
        guardScenario
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(`[fertilization-p0-real-api] ${error?.message || error}`)
  process.exitCode = 1
})
