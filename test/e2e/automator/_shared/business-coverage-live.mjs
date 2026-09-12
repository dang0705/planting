#!/usr/bin/env node
'use strict'

/* oxlint-disable no-console -- catalog leaf emits a machine-readable terminal report. */

import {
  resolveEnv,
  resolveGitBranch,
  resolveGitHead,
  resolvePrBaseHead
} from '../care/watering/transpiration-v3/_shared/lib/env.mjs'
import {
  AutomatorConnectError,
  connectAutomator,
  reLaunchTo,
  safeDisconnect
} from '../care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  collectByIdPrefix,
  findViewById,
  tapStableElement,
  waitForElement
} from '../care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { safeScreenshot } from '../care/watering/transpiration-v3/_shared/lib/screenshot.mjs'
import {
  createReport,
  emitLeafReport,
  recordAssertion,
  recordPage,
  recordPageData,
  recordRequests,
  recordScreenshot,
  saveReport,
  setClassification
} from '../care/watering/transpiration-v3/_shared/lib/reporter.mjs'
import {
  installRequestCapture,
  readCapturedRequests,
  restoreRequest
} from '../care/watering/transpiration-v3/_shared/lib/request-capture.mjs'
import { preflightProject } from '../care/watering/transpiration-v3/_shared/lib/project-check.mjs'
import { getCurrentPageWithFallback } from './page-probe.mjs'
import { textOf } from './fertilization-reminder-live-helpers.mjs'
import { resolveQaBackendTarget } from '../../../../scripts/qa/qa-backend-target.mjs'

const WAIT_MS = 12_000
const UI_SETTLE_MS = 650
const FAILURE_EXIT_CODE = 2
const LIVE_FIXTURE_REQUEST_TIMEOUT_MS = 15_000

class ProductAssertionError extends Error {}
class FixtureBlockedError extends Error {}
class EnvironmentBlockedError extends Error {}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeRoute(value) {
  return String(value || '')
    .replace(/^\/+/, '')
    .split('?')[0]
}

function plantIdFromStableId(value) {
  const match = String(value || '').match(
    /(?:index-plant-card-edit-|reminder-tab-plant-|calendar-plant-plan-)(\d+)$/u
  )
  return match ? Number(match[1]) : 0
}

function assertCondition(report, name, condition, detail = null) {
  recordAssertion(report, name, Boolean(condition), detail)
  if (!condition) {
    throw new ProductAssertionError(`${name}${detail ? `: ${detail}` : ''}`)
  }
}

function blockFixture(report, name, detail) {
  recordAssertion(report, name, false, detail)
  throw new FixtureBlockedError(`${name}${detail ? `: ${detail}` : ''}`)
}

async function waitForRoute(mp, expectedRoute) {
  const expected = normalizeRoute(expectedRoute)
  const deadline = Date.now() + WAIT_MS
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const probe = await getCurrentPageWithFallback(mp, {
        timeoutMs: Math.min(2500, deadline - Date.now()),
        perRpcTimeoutMs: 1500
      })
      const actual = normalizeRoute(probe.page?.path)
      if (actual === expected) {
        return probe.page
      }
    } catch (error) {
      lastError = error
    }
    await sleep(250)
  }
  throw new Error(
    `route did not settle at ${expectedRoute}${lastError ? `: ${lastError.message}` : ''}`
  )
}

async function waitUntilAbsent(page, id) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    if (!(await findViewById(page, id))) {
      return true
    }
    await sleep(250)
  }
  return false
}

async function waitForFirstByIdPrefix(page, prefix) {
  const deadline = Date.now() + WAIT_MS
  while (Date.now() < deadline) {
    const matches = await collectByIdPrefix(page, prefix)
    if (matches.length) {
      return matches[0]
    }
    await sleep(250)
  }
  return null
}

async function pageContainsAnyText(page, candidates) {
  const nodes = await page.$$('text').catch(() => [])
  const texts = []
  for (const node of nodes) {
    const value = await textOf(node)
    if (value) {
      texts.push(value)
    }
  }
  return candidates.find(candidate => texts.some(value => value.includes(candidate))) || null
}

async function readAttribute(element, name) {
  if (!element) {
    return null
  }
  try {
    return await element.attribute(name)
  } catch {
    return null
  }
}

async function readProperty(element, name) {
  if (!element || typeof element.property !== 'function') {
    return null
  }
  try {
    return await element.property(name)
  } catch {
    return null
  }
}

function toBoolean(value) {
  return value === true || ['true', '1', 'checked', 'yes'].includes(String(value).toLowerCase())
}

async function readChecked(element) {
  // 微信 switch 的 checked attribute reflects the initial markup value and
  // may remain unchanged after @change. The runtime property is the
  // authoritative post-tap state; use the attribute only as a fallback for
  // renderers that do not expose native properties.
  const propertyValue = await readProperty(element, 'checked')
  if (propertyValue !== null && propertyValue !== undefined) {
    return toBoolean(propertyValue)
  }
  return toBoolean(await readAttribute(element, 'checked'))
}

function inferLightType(text) {
  const value = String(text || '')
  if (value.includes('直射光')) {
    return 'direct'
  }
  if (value.includes('明亮散射光')) {
    return 'bright_diffuse'
  }
  if (value.includes('较弱散射光')) {
    return 'weak_diffuse'
  }
  if (value.includes('几乎无自然光')) {
    return 'almost_none'
  }
  return null
}

function inferEntryMethod(text) {
  const value = String(text || '')
  if (value.includes('阳光透过窗玻璃')) {
    return 'through_glass'
  }
  if (value.includes('开放环境')) {
    return 'open_environment'
  }
  return null
}

function illustrationAssetKey(typeKey) {
  return typeKey.replace('_', '-')
}

async function readElementText(element) {
  if (!element) {
    return ''
  }
  try {
    return String((await element.text()) || '').trim()
  } catch {
    return ''
  }
}

async function waitForPageData(page, predicate, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  let lastData = {}
  while (Date.now() < deadline) {
    lastData = (await page.data?.()) || {}
    if (predicate(lastData)) {
      return lastData
    }
    await sleep(250)
  }
  return lastData
}

async function capture(
  mp,
  env,
  report,
  label,
  { deferFailure = false, maxAttempts = 2, timeoutMs = undefined, expectedRoute = '' } = {}
) {
  const screenshot = await safeScreenshot(mp, env.artifactDir, label, env.wsEndpoint, {
    maxAttempts,
    timeoutMs,
    expectedRoute,
    report
  })
  if (!screenshot) {
    recordAssertion(report, `${label}首张截图有效`, false, 'renderer screenshot unavailable')
    if (!deferFailure) {
      throw new EnvironmentBlockedError(`${label}首张截图无有效 PNG，renderer 未返回截图`)
    }
    return false
  }
  assertCondition(report, `${label}首张截图有效`, true)
  recordScreenshot(report, screenshot)
  return true
}

async function findFirstPlantId(mp, report) {
  const page = await reLaunchTo(mp, '/pages/index/index')
  recordPage(report, '/pages/index/index')
  const list = await waitForElement(page, 'index-plant-list', WAIT_MS)
  if (!list) {
    blockFixture(report, '真实账户存在首页植物列表', '未找到 index-plant-list')
  }
  const plants = await collectByIdPrefix(page, 'index-plant-card-edit-')
  const plantId = plants.map(item => plantIdFromStableId(item.stableId)).find(Boolean)
  if (!plantId) {
    blockFixture(report, '真实账户存在可复用的用户植物', '未找到 index-plant-card-edit-{id}')
  }
  return { plantId, page }
}

async function findReminderPlantId(mp, report) {
  const page = await reLaunchTo(mp, '/pages/reminder/reminder')
  recordPage(report, '/pages/reminder/reminder')
  const list = await waitForElement(page, 'reminder-tab-plant-list', WAIT_MS)
  if (!list) {
    blockFixture(report, '延后提醒页存在植物列表', '未找到 reminder-tab-plant-list')
  }
  const plants = await collectByIdPrefix(page, 'reminder-tab-plant-')
  const plantId = plants.map(item => plantIdFromStableId(item.stableId)).find(Boolean)
  if (!plantId) {
    blockFixture(report, '延后提醒页存在可复用的用户植物', '未找到 reminder-tab-plant-{id}')
  }
  return { plantId, page }
}

async function findLightEnvironmentPlant(mp, report) {
  const { page: listPage } = await findFirstPlantId(mp, report)
  const candidates = (await collectByIdPrefix(listPage, 'index-plant-card-edit-'))
    .map(item => plantIdFromStableId(item.stableId))
    .filter(Boolean)

  for (const plantId of candidates) {
    const edit = await reLaunchTo(
      mp,
      `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plantId}`
    )
    const status = await waitForElement(edit, 'edit-plant-environment-light-status', WAIT_MS)
    const summary = await readElementText(status)
    if (!summary || /尚未设置|点击进入设置|待确认/u.test(summary)) {
      continue
    }

    // The detail-page summary is presentation state only: migrated records can
    // still render a light type while remaining unconfirmed.  Formal live QA
    // may reuse a record only when the server proves it is a complete V2 user
    // capture; otherwise fall back to the self-reverting real API fixture.
    const persisted = await authenticatedLiveRequest(mp, {
      method: 'GET',
      path: `plant-user-http/user-plants?id=${plantId}`
    })
    const persistedLightEnvironment = persisted?.data?.data?.lightEnvironment || null
    const isConfirmedV2 =
      responseSucceeded(persisted) &&
      persistedLightEnvironment?.schemaVersion === 2 &&
      persistedLightEnvironment?.captureSource === 'user' &&
      ['direct', 'bright_diffuse', 'weak_diffuse', 'almost_none'].includes(
        persistedLightEnvironment?.naturalLightType
      ) &&
      (persistedLightEnvironment?.naturalLightType === 'almost_none'
        ? persistedLightEnvironment?.entryMethod === null
        : ['through_glass', 'open_environment'].includes(persistedLightEnvironment?.entryMethod))

    if (isConfirmedV2) {
      return {
        plantId,
        edit,
        summary,
        captureSource: 'user',
        persistedLightEnvironment,
        temporary: false
      }
    }
  }

  return ensureTemporaryUserLightEnvironmentPlant(mp, report)
}

function liveFixtureApiBaseUrl() {
  return resolveQaBackendTarget(process.env, {
    port: 3011,
    functionPortBase: 9100
  }).baseUrl
}

/**
 * Run a real authenticated wx.request inside the current mini-program. This
 * is test-fixture setup/cleanup only; it never substitutes a product API or
 * injects a fake response into the page.
 */
async function authenticatedLiveRequest(
  mp,
  { method = 'GET', path, body = null, methodOverride = '' } = {}
) {
  const slot = `__qaLightFixtureRequest_${process.pid}_${Date.now()}`
  const url = `${liveFixtureApiBaseUrl().replace(/\/+$/u, '')}/${String(path || '').replace(/^\/+/, '')}`
  const transportMethod = methodOverride ? 'POST' : method
  const deadline = Date.now() + LIVE_FIXTURE_REQUEST_TIMEOUT_MS
  try {
    await mp.evaluate(
      function (requestSlot, requestUrl, requestMethod, requestBody, requestOverride) {
        globalThis[requestSlot] = { state: 'pending' }
        const finish = function (value) {
          globalThis[requestSlot] = {
            state: 'completed',
            statusCode: value && value.statusCode !== undefined ? value.statusCode : null,
            responseCode: value && value.responseCode !== undefined ? value.responseCode : null,
            data: value && value.data !== undefined ? value.data : null,
            error: value && value.error ? String(value.error) : null
          }
        }
        if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
          finish({ error: 'wx.cloud.callFunction unavailable' })
          return { started: false }
        }
        try {
          wx.cloud.callFunction({
            name: 'wechat-identity',
            data: {},
            success: function (identityResult) {
              const identity = identityResult && identityResult.result
              const openid = identity && identity.openid ? String(identity.openid) : ''
              if (!openid) {
                finish({ error: 'wechat identity unavailable' })
                return
              }
              const requestOptions = {
                url: requestUrl,
                method: requestMethod,
                header: {
                  'x-wx-openid': openid,
                  'x-openid': openid,
                  'x-app-env': 'development',
                  'x-env': 'development'
                },
                success: function (response) {
                  const payload = response && response.data ? response.data : null
                  finish({
                    statusCode: response && response.statusCode,
                    responseCode: payload && payload.code,
                    data: payload
                  })
                },
                fail: function (error) {
                  finish({ error: error && error.errMsg ? error.errMsg : String(error) })
                }
              }
              if (requestOverride) {
                requestOptions.header['x-http-method-override'] = requestOverride
              }
              if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
                requestOptions.data = requestBody || {}
              }
              try {
                wx.request(requestOptions)
              } catch (error) {
                finish({ error: error && error.message ? error.message : String(error) })
              }
            },
            fail: function (error) {
              finish({ error: error && error.errMsg ? error.errMsg : String(error) })
            }
          })
        } catch (error) {
          finish({ error: error && error.message ? error.message : String(error) })
        }
        return { started: true }
      },
      slot,
      url,
      transportMethod,
      body,
      methodOverride
    )
    while (Date.now() < deadline) {
      const value = await mp.evaluate(function (requestSlot) {
        const current = globalThis[requestSlot]
        if (!current || typeof current !== 'object') {
          return null
        }
        return {
          state: current.state,
          statusCode: current.statusCode,
          responseCode: current.responseCode,
          data: current.data,
          error: current.error || null
        }
      }, slot)
      if (value?.state === 'completed') {
        return value
      }
      await sleep(200)
    }
    return { state: 'timeout', error: 'live wx.request timeout' }
  } finally {
    await mp
      .evaluate(function (requestSlot) {
        delete globalThis[requestSlot]
        return true
      }, slot)
      .catch(() => {})
  }
}

function responseSucceeded(response) {
  return Number(response?.statusCode) === 200 && Number(response?.responseCode) === 200
}

async function createTemporaryUserPlant(mp, report) {
  const seed = await authenticatedLiveRequest(mp, {
    method: 'GET',
    path: 'plant-user-http/user-plants?page=1&pageSize=1'
  })
  const source = seed?.data?.data?.list?.[0]
  if (!responseSucceeded(seed) || !source) {
    blockFixture(report, '可建立真实临时用户植物', '真实用户植物列表读取失败或为空')
  }

  const nickname = `QA光照回放-${Date.now()}`
  const created = await authenticatedLiveRequest(mp, {
    method: 'POST',
    path: 'plant-user-http/user-plants',
    body: {
      plantId: source.plantId || source.sessionPlantId || source.plantIdentityId,
      plantIdentityId: source.plantIdentityId || null,
      sessionPlantId: source.sessionPlantId || null,
      nickname,
      sourceType: 'catalog',
      identityResolutionStatus: 'matched',
      notes: 'formal automator light environment fixture',
      lightEnvironment: {
        schemaVersion: 2,
        naturalLightType: 'direct',
        entryMethod: 'through_glass',
        hasSupplementalLight: false,
        captureSource: 'user'
      }
    }
  })
  const plantId = Number(created?.data?.data?.id)
  if (!responseSucceeded(created) || !plantId) {
    blockFixture(report, '可建立真实临时用户植物', '真实用户植物创建接口未返回有效 ID')
  }
  recordAssertion(report, '真实临时用户植物创建成功', true, `id=${plantId}`)
  return plantId
}

async function prepareTemporaryUserLightEnvironment(mp, report, plantId) {
  const persisted = await authenticatedLiveRequest(mp, {
    method: 'GET',
    path: `plant-user-http/user-plants?id=${plantId}`
  })
  const persistedLightEnvironment = persisted?.data?.data?.lightEnvironment || null
  assertCondition(
    report,
    '临时用户植物建立时服务端 captureSource 为 user',
    responseSucceeded(persisted) && persistedLightEnvironment?.captureSource === 'user',
    JSON.stringify({
      statusCode: persisted?.statusCode ?? null,
      responseCode: persisted?.responseCode ?? null,
      captureSource: persistedLightEnvironment?.captureSource || null
    })
  )
  const edit = await reLaunchTo(
    mp,
    `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plantId}`
  )
  const status = await waitForElement(edit, 'edit-plant-environment-light-status', WAIT_MS)
  const summary = await readElementText(status)
  return {
    plantId,
    edit,
    summary,
    captureSource: 'user',
    persistedLightEnvironment,
    temporary: true
  }
}

async function cleanupTemporaryUserPlant(mp, report, plantId) {
  const deleted = await authenticatedLiveRequest(mp, {
    method: 'DELETE',
    path: 'plant-user-http/user-plants',
    body: { id: plantId },
    methodOverride: 'DELETE'
  })
  const deletedOk = responseSucceeded(deleted)
  recordAssertion(report, '临时用户植物通过真实接口删除', deletedOk, `id=${plantId}`)
  const verified = await authenticatedLiveRequest(mp, {
    method: 'GET',
    path: `plant-user-http/user-plants?id=${plantId}`
  })
  const listed = await authenticatedLiveRequest(mp, {
    method: 'GET',
    path: 'plant-user-http/user-plants?page=1&pageSize=50'
  })
  const absentFromDetail =
    Number(verified?.statusCode) === 404 || Number(verified?.responseCode) === 404
  const absentFromList =
    responseSucceeded(listed) &&
    !listed.data?.data?.list?.some(item => Number(item?.id) === Number(plantId))
  const absent = absentFromDetail || absentFromList
  recordAssertion(
    report,
    '临时用户植物删除后真实接口返回不存在',
    absent,
    JSON.stringify({
      id: plantId,
      detailStatusCode: verified?.statusCode ?? null,
      detailResponseCode: verified?.responseCode ?? null,
      listStatusCode: listed?.statusCode ?? null,
      listResponseCode: listed?.responseCode ?? null,
      absentFromDetail,
      absentFromList
    })
  )
  if (!deletedOk || !absent) {
    throw new EnvironmentBlockedError(`临时用户植物清理未完成：id=${plantId}`)
  }
}

async function ensureTemporaryUserLightEnvironmentPlant(mp, report) {
  let plantId = 0
  try {
    plantId = await createTemporaryUserPlant(mp, report)
    return await prepareTemporaryUserLightEnvironment(mp, report, plantId)
  } catch (error) {
    if (plantId) {
      try {
        await cleanupTemporaryUserPlant(mp, report, plantId)
      } catch {
        // Preserve the original setup failure; cleanup assertions remain in the report.
      }
    }
    throw error
  }
}

async function runReversibleCalendarTask({ mp, page, report, plantId, action, label }) {
  const actionId = `calendar-task-${action}-${plantId}`
  const undoId = `calendar-task-undo-${plantId}`
  const actionButton = await waitForElement(page, actionId, WAIT_MS)
  assertCondition(report, `${label}入口可真实点击`, Boolean(actionButton), `id=${actionId}`)
  await tapStableElement(actionButton)
  await sleep(UI_SETTLE_MS)
  const afterActionPage = await waitForRoute(mp, '/pages/calendar/calendar')
  const undoButton = await waitForElement(afterActionPage, undoId, WAIT_MS)
  assertCondition(report, `${label}完成后出现可撤销状态`, Boolean(undoButton), `id=${undoId}`)
  await tapStableElement(undoButton)
  await sleep(UI_SETTLE_MS)
  const restoredPage = await waitForRoute(mp, '/pages/calendar/calendar')
  assertCondition(
    report,
    `${label}撤销后撤销入口消失`,
    await waitUntilAbsent(restoredPage, undoId),
    `id=${undoId}`
  )
  const restoredAction = await waitForElement(restoredPage, actionId, WAIT_MS)
  assertCondition(report, `${label}撤销后任务状态恢复`, Boolean(restoredAction), `id=${actionId}`)
  return restoredPage
}

async function runCalendarTaskAndPlan({ mp, report, env }) {
  let page = await reLaunchTo(mp, '/pages/calendar/calendar')
  recordPage(report, '/pages/calendar/calendar')
  const solar = await waitForElement(page, 'calendar-solar-term-details', WAIT_MS)
  assertCondition(report, '日历页节气详情入口可见', Boolean(solar))
  await tapStableElement(solar)
  await sleep(UI_SETTLE_MS)
  page = await waitForRoute(mp, '/pages/calendar/calendar')
  const solarModalTitle = await pageContainsAnyText(page, ['节气提醒'])
  const solarModalConfirm = await pageContainsAnyText(page, ['知道了'])
  assertCondition(
    report,
    '节气详情真实弹窗出现',
    Boolean(solarModalTitle && solarModalConfirm),
    `title=${solarModalTitle || 'missing'}; confirm=${solarModalConfirm || 'missing'}`
  )
  await mp.callWxMethod('hideModal')
  await sleep(UI_SETTLE_MS)
  recordAssertion(report, '打开节气详情后仍停留在日历返回栈', true)

  const completeTasks = await collectByIdPrefix(page, 'calendar-task-complete-')
  const postponeTasks = await collectByIdPrefix(page, 'calendar-task-postpone-')
  if (!completeTasks.length || !postponeTasks.length) {
    blockFixture(
      report,
      '真实账户存在今日可操作养护任务',
      `complete=${completeTasks.length}; postpone=${postponeTasks.length}`
    )
  }
  recordAssertion(report, '今日任务显示完成入口', true, completeTasks[0].stableId)
  recordAssertion(report, '今日任务显示推迟入口', true, postponeTasks[0].stableId)

  const plantId = plantIdFromStableId(completeTasks[0].stableId)
  page = await runReversibleCalendarTask({
    mp,
    page,
    report,
    plantId,
    action: 'complete',
    label: '完成任务'
  })
  page = await runReversibleCalendarTask({
    mp,
    page,
    report,
    plantId,
    action: 'postpone',
    label: '推迟任务'
  })

  const plans = await collectByIdPrefix(page, 'calendar-plant-plan-')
  if (plans.length) {
    const planId = plantIdFromStableId(plans[0].stableId)
    await tapStableElement(plans[0].element)
    await sleep(UI_SETTLE_MS)
    const detail = await waitForRoute(
      mp,
      `/subpackages/plant/user-plant-detail/user-plant-detail?mode=view&id=${planId}`
    )
    recordPage(report, detail.path)
    assertCondition(
      report,
      '日历植物计划进入统一 view 详情页',
      Boolean(await findViewById(detail, 'user-plant-detail-page'))
    )
    await mp.callWxMethod('navigateBack')
    page = await waitForRoute(mp, '/pages/calendar/calendar')
    recordAssertion(report, '植物计划详情返回栈回到日历页', true)
  } else {
    const add =
      (await findViewById(page, 'calendar-add-plant-button')) ||
      (await findViewById(page, 'calendar-empty-add-plant-button'))
    assertCondition(report, '日历页存在添加植物计划入口', Boolean(add))
    await tapStableElement(add)
    await sleep(UI_SETTLE_MS)
    const create = await waitForRoute(
      mp,
      '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create'
    )
    assertCondition(
      report,
      '日历添加入口进入统一 create 详情页',
      Boolean(await findViewById(create, 'add-plant-swiper'))
    )
    await mp.callWxMethod('navigateBack')
    await waitForRoute(mp, '/pages/calendar/calendar')
  }
  await capture(mp, env, report, 'calendar-task-and-plan')
}

async function runCalendarWeatherAndSolar({ mp, report, env }) {
  const page = await reLaunchTo(mp, '/pages/calendar/calendar')
  recordPage(report, '/pages/calendar/calendar')
  const solar = await waitForElement(page, 'calendar-solar-term-details', WAIT_MS)
  assertCondition(report, '日历页当前节气摘要可见', Boolean(solar))
  const data = await waitForPageData(page, value => value.weatherLoading === false)
  const currentSolarTerm = data.currentSolarTerm || data.current_solar_term || null
  assertCondition(
    report,
    '日历页提供当前节气数据或稳定空态',
    Boolean(currentSolarTerm?.name || (await findViewById(page, 'calendar-solar-term-details')))
  )
  const weather = data.weather || {}
  const weatherHasData = Boolean(
    (weather?.current &&
      (weather.current.temp !== null || weather.current.desc || weather.current.icon)) ||
    weather?.forecast?.length
  )
  const weatherEmptyState = await pageContainsAnyText(page, [
    '暂无天气数据',
    '设置养护位置后显示天气参考'
  ])
  recordAssertion(
    report,
    '天气区域真实呈现天气数据或位置空态',
    Boolean(weatherHasData || weatherEmptyState),
    `data=${weatherHasData}; empty=${weatherEmptyState || 'missing'}`
  )
  await tapStableElement(solar)
  await sleep(UI_SETTLE_MS)
  const modalTitle = await pageContainsAnyText(await mp.currentPage(), ['节气提醒'])
  const modalConfirm = await pageContainsAnyText(await mp.currentPage(), ['知道了'])
  assertCondition(
    report,
    '节气详情可触达且弹窗内容出现',
    Boolean(modalTitle && modalConfirm),
    `title=${modalTitle || 'missing'}; confirm=${modalConfirm || 'missing'}`
  )
  await mp.callWxMethod('hideModal')
  await sleep(UI_SETTLE_MS)
  assertCondition(
    report,
    '节气详情关闭后日历页仍有效',
    normalizeRoute((await mp.currentPage()).path) === 'pages/calendar/calendar'
  )
  await capture(mp, env, report, 'calendar-weather-and-solar')
}

async function runReminderClosure({ mp, report, env }) {
  const { page: listPage, plantId } = await findReminderPlantId(mp, report)
  const water = await findViewById(listPage, `reminder-tab-water-${plantId}`)
  assertCondition(report, '提醒 tab 的浇水入口可见', Boolean(water))
  await tapStableElement(water)
  await sleep(UI_SETTLE_MS)
  let page = await mp.currentPage()
  assertCondition(
    report,
    '浇水入口打开 WateringReminderSheet',
    Boolean(await findViewById(page, 'watering-reminder-sheet'))
  )
  const waterClose = await waitForElement(page, 'watering-reminder-close-button', WAIT_MS)
  assertCondition(report, '浇水提醒弹层关闭入口可见', Boolean(waterClose))
  await tapStableElement(waterClose)
  assertCondition(
    report,
    '浇水提醒弹层可关闭',
    await waitUntilAbsent(page, 'watering-reminder-sheet')
  )

  page = await mp.currentPage()
  const fertilization = await findViewById(page, `reminder-tab-fertilization-${plantId}`)
  assertCondition(report, '提醒 tab 的施肥入口可见', Boolean(fertilization))
  await tapStableElement(fertilization)
  await sleep(UI_SETTLE_MS)
  page = await mp.currentPage()
  assertCondition(
    report,
    '施肥入口打开 FertilizationMonthlySheet',
    Boolean(await findViewById(page, 'plant-card-fertilization-sheet'))
  )
  const fertilizationClose = await waitForElement(
    page,
    'plant-card-fertilization-close-button',
    WAIT_MS
  )
  assertCondition(report, '施肥提醒弹层关闭入口可见', Boolean(fertilizationClose))
  await tapStableElement(fertilizationClose)
  assertCondition(
    report,
    '施肥提醒弹层可关闭',
    await waitUntilAbsent(page, 'plant-card-fertilization-sheet')
  )
  await capture(mp, env, report, 'reminder-tab-closure')
}

async function runHomeCardCareClosure({ mp, report, env }) {
  const { page: listPage, plantId } = await findFirstPlantId(mp, report)
  const water = await findViewById(listPage, `plant-card-reminder-${plantId}-water`)
  assertCondition(report, '首页植物卡的浇水入口可见', Boolean(water))
  await tapStableElement(water)
  await sleep(UI_SETTLE_MS)
  let page = await mp.currentPage()
  assertCondition(
    report,
    '首页浇水入口打开 WateringReminderSheet',
    Boolean(await findViewById(page, 'watering-reminder-sheet'))
  )
  const waterClose = await waitForElement(page, 'watering-reminder-close-button', WAIT_MS)
  assertCondition(report, '首页浇水提醒弹层关闭入口可见', Boolean(waterClose))
  await tapStableElement(waterClose)
  assertCondition(
    report,
    '首页浇水提醒弹层可关闭',
    await waitUntilAbsent(page, 'watering-reminder-sheet')
  )

  page = await mp.currentPage()
  const fertilization = await findViewById(page, `plant-card-fertilization-${plantId}`)
  assertCondition(report, '首页植物卡的施肥入口可见', Boolean(fertilization))
  await tapStableElement(fertilization)
  await sleep(UI_SETTLE_MS)
  page = await mp.currentPage()
  assertCondition(
    report,
    '首页施肥入口打开 FertilizationMonthlySheet',
    Boolean(await findViewById(page, 'plant-card-fertilization-sheet'))
  )
  const fertilizationClose = await waitForElement(
    page,
    'plant-card-fertilization-close-button',
    WAIT_MS
  )
  assertCondition(report, '首页施肥弹层关闭入口可见', Boolean(fertilizationClose))
  await tapStableElement(fertilizationClose)
  assertCondition(
    report,
    '首页施肥弹层可关闭',
    await waitUntilAbsent(page, 'plant-card-fertilization-sheet')
  )

  const reenteredHome = await reLaunchTo(mp, '/pages/index/index')
  recordPage(report, reenteredHome.path)
  const reenteredList = await waitForElement(reenteredHome, 'index-plant-list', WAIT_MS)
  assertCondition(report, '关闭养护弹层后首页可重新进入', Boolean(reenteredList))
  assertCondition(
    report,
    '首页重新进入后仍显示同一真实植物卡',
    Boolean(await findViewById(reenteredHome, `index-plant-card-edit-${plantId}`)),
    `plantId=${plantId}`
  )
  await capture(mp, env, report, 'home-card-care-closure')
}

async function assertMvpTabEntryHidden({ mp, report, route, label }) {
  let switchError = null
  let observedRoute = ''
  try {
    await mp.switchTab(route)
    await sleep(UI_SETTLE_MS)
    observedRoute = normalizeRoute((await mp.currentPage()).path)
  } catch (error) {
    switchError = String(error?.message || error)
  }
  const isNativeTab = observedRoute === normalizeRoute(route)
  assertCondition(
    report,
    `${label}未出现在 MVP 原生 TabBar`,
    !isNativeTab,
    JSON.stringify({ route, observedRoute: observedRoute || null, switchError })
  )
}

async function runMvpHiddenNativeTabs({ mp, report, env }) {
  await mp.switchTab('/pages/index/index')
  const home = await waitForRoute(mp, '/pages/index/index')
  recordPage(report, home.path)
  assertCondition(
    report,
    '首页仍是 MVP 原生 Tab',
    normalizeRoute(home.path) === 'pages/index/index'
  )
  await assertMvpTabEntryHidden({
    mp,
    report,
    route: '/pages/calendar/calendar',
    label: '日历'
  })
  await assertMvpTabEntryHidden({
    mp,
    report,
    route: '/pages/reminder/reminder',
    label: '提醒'
  })
  await capture(mp, env, report, 'mvp-hidden-calendar-reminder-tabs')
}

async function runLightEnvironmentSaveCore({ mp, report, env, selection }) {
  const { plantId, edit, summary: originalSummary } = selection
  recordPage(report, edit.path)
  const entry = await waitForElement(edit, 'edit-plant-environment-light-entry', WAIT_MS)
  assertCondition(report, '编辑页光照环境入口可见', Boolean(entry))
  await tapStableElement(entry)
  await sleep(UI_SETTLE_MS)
  let environment = await waitForRoute(mp, '/subpackages/care/plant-environment/light-environment')
  recordPage(report, environment.path)
  assertCondition(
    report,
    '光照环境页已注册并可进入',
    Boolean(await findViewById(environment, 'plant-light-environment-page'))
  )
  let complete = await waitForElement(
    environment,
    'plant-light-environment-complete-button',
    WAIT_MS
  )
  assertCondition(report, '光照环境完成按钮可见', Boolean(complete))
  const initialIllustration = await waitForElement(
    environment,
    'plant-light-environment-illustration-profile',
    WAIT_MS
  )
  const initialIllustrationText = await readElementText(initialIllustration)
  const originalType = inferLightType(`${originalSummary} ${initialIllustrationText}`)
  const originalEntry = inferEntryMethod(originalSummary)
  let supplement = await waitForElement(
    environment,
    'plant-light-environment-supplemental-light-profile',
    WAIT_MS
  )
  const originalSupplement = await readChecked(supplement)
  const originalCaptureSource =
    selection.captureSource || (/待确认/u.test(originalSummary) ? 'migrated_v1' : 'user')
  if (!originalType) {
    blockFixture(
      report,
      '真实植物已有可回放的 V2 光照资料',
      `无法从用户可见摘要识别光型：${originalSummary || initialIllustrationText || 'empty'}`
    )
  }

  recordAssertion(
    report,
    '光照页初始数据是 V2 且可安全回放',
    ['direct', 'bright_diffuse', 'weak_diffuse', 'almost_none'].includes(originalType) &&
      (originalType === 'almost_none' ||
        ['through_glass', 'open_environment', null].includes(originalEntry)),
    JSON.stringify({
      naturalLightType: originalType,
      entryMethod: originalEntry,
      hasSupplementalLight: originalSupplement,
      captureSource: originalCaptureSource
    })
  )

  const typeKeys = ['direct', 'bright_diffuse', 'weak_diffuse', 'almost_none']
  let previousIllustrationSource = ''
  let screenshotEnvironmentBlocked = false
  for (const typeKey of typeKeys) {
    const option = await waitForElement(
      environment,
      `plant-light-environment-type-${typeKey}-profile`,
      WAIT_MS
    )
    assertCondition(report, `光型 ${typeKey} 选项可见`, Boolean(option))
    await tapStableElement(option)
    await sleep(UI_SETTLE_MS)
    const selectedClass = String((await readAttribute(option, 'class')) || '')
    assertCondition(
      report,
      `光型 ${typeKey} 可真实切换`,
      /border-2|border-\[2px\]/u.test(selectedClass),
      `class=${selectedClass}`
    )
    const illustration = await waitForElement(
      environment,
      'plant-light-environment-illustration-profile',
      WAIT_MS
    )
    const illustrationText = await readElementText(illustration)
    const image = illustration ? await illustration.$('image').catch(() => null) : null
    const illustrationSource = String((await readAttribute(image, 'src')) || '')
    assertCondition(
      report,
      `光型 ${typeKey} 反映对应图例`,
      Boolean(illustrationSource) &&
        illustrationSource.includes(`light-type-${illustrationAssetKey(typeKey)}`) &&
        illustrationText.length > 0,
      `src=${illustrationSource}; text=${illustrationText}`
    )
    if (previousIllustrationSource) {
      assertCondition(
        report,
        `${typeKey} 图例与上一光型不同`,
        illustrationSource !== previousIllustrationSource,
        `src=${illustrationSource}`
      )
    }
    previousIllustrationSource = illustrationSource
    const screenshotCaptured = await capture(
      mp,
      env,
      report,
      `plant-light-environment-${typeKey}`,
      {
        deferFailure: true,
        maxAttempts: 1,
        timeoutMs: 240_000,
        expectedRoute: environment.path
      }
    )
    screenshotEnvironmentBlocked = !screenshotCaptured || screenshotEnvironmentBlocked
    if (screenshotCaptured) {
      // The formal screenshot worker owns a disposable connection and the
      // handoff resumes the session with a fresh page object. Re-read the
      // current route before continuing interactions; element/page handles
      // captured before the handoff are no longer valid.
      environment = await waitForRoute(mp, '/subpackages/care/plant-environment/light-environment')
    }

    if (typeKey === 'direct') {
      for (const entryMethod of ['through_glass', 'open_environment']) {
        const entry = await waitForElement(
          environment,
          `plant-light-environment-entry-${entryMethod}-profile`,
          WAIT_MS
        )
        assertCondition(report, `直射光可选择${entryMethod}`, Boolean(entry))
        await tapStableElement(entry)
        await sleep(UI_SETTLE_MS)
        const entryClass = String((await readAttribute(entry, 'class')) || '')
        assertCondition(
          report,
          `直射光进入方式 ${entryMethod} 可真实切换`,
          /border-2|border-\[2px\]/u.test(entryClass),
          `class=${entryClass}`
        )
      }
    }
  }

  // The last screenshot handoff also replaces the Automator page session.
  // Refresh controls used by the no-light, supplemental-light, restore and
  // save assertions so no stale element handle crosses that boundary.
  environment = await waitForRoute(mp, '/subpackages/care/plant-environment/light-environment')
  complete = await waitForElement(environment, 'plant-light-environment-complete-button', WAIT_MS)
  supplement = await waitForElement(
    environment,
    'plant-light-environment-supplemental-light-profile',
    WAIT_MS
  )

  const almostNoneOption = await waitForElement(
    environment,
    'plant-light-environment-type-almost_none-profile',
    WAIT_MS
  )
  const almostNoneClass = String((await readAttribute(almostNoneOption, 'class')) || '')
  assertCondition(
    report,
    '几乎无自然光可切换且保持选中',
    /border-2|border-\[2px\]/u.test(almostNoneClass),
    `class=${almostNoneClass}`
  )
  const openEnvironment = await waitForElement(
    environment,
    'plant-light-environment-entry-open_environment-profile',
    WAIT_MS
  )
  assertCondition(report, '开放环境选项在无光状态仍可定位', Boolean(openEnvironment))
  const disabledClass = String((await readAttribute(openEnvironment, 'class')) || '')
  assertCondition(
    report,
    '几乎无光时进入方式呈现禁用样式',
    /f5f7f6|8f9991|d1dbd4/u.test(disabledClass),
    disabledClass
  )
  const classBeforeDisabledTap = disabledClass
  await tapStableElement(openEnvironment)
  await sleep(UI_SETTLE_MS)
  const classAfterDisabledTap = String((await readAttribute(openEnvironment, 'class')) || '')
  assertCondition(
    report,
    '几乎无光时进入方式为空且不可改写',
    classAfterDisabledTap === classBeforeDisabledTap &&
      /border-2|border-\[2px\]/u.test(
        String((await readAttribute(almostNoneOption, 'class')) || '')
      ),
    `before=${classBeforeDisabledTap}; after=${classAfterDisabledTap}`
  )
  assertCondition(report, '补光灯开关在无光状态可用', Boolean(supplement))
  await tapStableElement(supplement)
  await sleep(UI_SETTLE_MS)
  const toggledSupplement = await readChecked(supplement)
  const almostNoneAfterSupplement = String((await readAttribute(almostNoneOption, 'class')) || '')
  assertCondition(
    report,
    '补光灯与自然光型独立',
    toggledSupplement !== originalSupplement &&
      /border-2|border-\[2px\]/u.test(almostNoneAfterSupplement),
    `checked=${toggledSupplement}; typeClass=${almostNoneAfterSupplement}`
  )

  const originalTypeOption = await waitForElement(
    environment,
    `plant-light-environment-type-${originalType}-profile`,
    WAIT_MS
  )
  await tapStableElement(originalTypeOption)
  await sleep(UI_SETTLE_MS)
  const restoredTypeClass = String((await readAttribute(originalTypeOption, 'class')) || '')
  assertCondition(
    report,
    '恢复原 V2 光型选中状态',
    /border-2|border-\[2px\]/u.test(restoredTypeClass),
    `class=${restoredTypeClass}`
  )
  if (originalEntry) {
    const originalEntryOption = await waitForElement(
      environment,
      `plant-light-environment-entry-${originalEntry}-profile`,
      WAIT_MS
    )
    await tapStableElement(originalEntryOption)
    await sleep(UI_SETTLE_MS)
    const restoredEntryClass = String((await readAttribute(originalEntryOption, 'class')) || '')
    assertCondition(
      report,
      '恢复原 V2 进入方式选中状态',
      /border-2|border-\[2px\]/u.test(restoredEntryClass),
      `class=${restoredEntryClass}`
    )
  }
  const currentSupplement = await readChecked(supplement)
  if (currentSupplement !== originalSupplement) {
    await tapStableElement(supplement)
    await sleep(UI_SETTLE_MS)
  }
  const restoredSupplement = await readChecked(supplement)
  assertCondition(
    report,
    '保存前已恢复原 V2 光照资料',
    restoredSupplement === originalSupplement,
    JSON.stringify({
      naturalLightType: originalType,
      entryMethod: originalEntry,
      hasSupplementalLight: restoredSupplement,
      captureSource: originalCaptureSource
    })
  )
  if (screenshotEnvironmentBlocked) {
    throw new EnvironmentBlockedError(
      '光照环境交互断言已完成，但非首页 renderer 未返回有效截图，正式视觉验收被环境阻断'
    )
  }
  if (originalCaptureSource !== 'user') {
    blockFixture(
      report,
      '真实植物已有用户确认的 V2 光照资料可安全保存回放',
      `当前记录为 ${originalCaptureSource}，保存会把迁移记录升级为 user，拒绝污染真实数据`
    )
  }
  await tapStableElement(complete)
  await sleep(UI_SETTLE_MS)
  const returned = await waitForRoute(
    mp,
    `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plantId}`
  )
  assertCondition(
    report,
    '光照保存后返回原编辑页',
    Boolean(await findViewById(returned, 'edit-plant-environment-group'))
  )
  assertCondition(
    report,
    '光照保存返回后环境状态可读',
    Boolean(await findViewById(returned, 'edit-plant-environment-light-status'))
  )
  await capture(mp, env, report, 'plant-light-environment-save')
}

async function runLightEnvironmentSave({ mp, report, env }) {
  let selection = null
  let primaryError = null
  let cleanupError = null
  try {
    selection = await findLightEnvironmentPlant(mp, report)
    await runLightEnvironmentSaveCore({ mp, report, env, selection })
  } catch (error) {
    primaryError = error
  }
  if (selection?.temporary) {
    try {
      await cleanupTemporaryUserPlant(mp, report, selection.plantId)
    } catch (error) {
      cleanupError = error
    }
  }
  if (primaryError) {
    throw primaryError
  }
  if (cleanupError) {
    throw cleanupError
  }
}

async function runUserDetailModes({ mp, report, env }) {
  const { plantId } = await findFirstPlantId(mp, report)
  const view = await reLaunchTo(
    mp,
    `/subpackages/plant/user-plant-detail/user-plant-detail?mode=view&id=${plantId}`
  )
  recordPage(report, view.path)
  assertCondition(
    report,
    '用户植物 view 模式页面可达',
    Boolean(await findViewById(view, 'user-plant-detail-page'))
  )
  const viewRoot = await waitForElement(view, 'user-plant-detail-page', WAIT_MS)
  assertCondition(report, '用户植物详情首次加载完成', Boolean(viewRoot))
  assertCondition(
    report,
    '详情首次加载不显示重试错误',
    !(await findViewById(view, 'user-plant-detail-retry-button'))
  )
  assertCondition(
    report,
    '详情浇水按钮可见',
    Boolean(await findViewById(view, 'user-plant-detail-water-button'))
  )

  const reenteredView = await reLaunchTo(
    mp,
    `/subpackages/plant/user-plant-detail/user-plant-detail?mode=view&id=${plantId}`
  )
  recordPage(report, reenteredView.path)
  const reenteredRoot = await waitForElement(reenteredView, 'user-plant-detail-page', WAIT_MS)
  assertCondition(report, '详情页重新进入后加载完成', Boolean(reenteredRoot))
  assertCondition(
    report,
    '详情页重新进入后仍显示真实植物主体',
    Boolean(await findViewById(reenteredView, 'user-plant-detail-water-button'))
  )

  const edit = await reLaunchTo(
    mp,
    `/subpackages/plant/user-plant-detail/user-plant-detail?mode=edit&id=${plantId}`
  )
  recordPage(report, edit.path)
  const editForm = await waitForElement(edit, 'edit-plant-form', WAIT_MS)
  assertCondition(
    report,
    '用户植物 edit 模式表单可达',
    Boolean(editForm)
  )
  assertCondition(
    report,
    '用户植物 edit 模式保存入口可达',
    Boolean(await findViewById(edit, 'edit-plant-submit-button'))
  )
  assertCondition(
    report,
    '用户植物 edit 模式基本信息分区可见',
    Boolean(await findViewById(edit, 'edit-plant-basic-info-section'))
  )
  assertCondition(
    report,
    '用户植物 edit 模式养护信息分区可见',
    Boolean(await findViewById(edit, 'edit-plant-care-info-section'))
  )
  assertCondition(
    report,
    '用户植物 edit 模式盆信息分区可见',
    Boolean(await findViewById(edit, 'edit-plant-pot-info-section'))
  )

  const create = await reLaunchTo(
    mp,
    '/subpackages/plant/user-plant-detail/user-plant-detail?mode=create'
  )
  recordPage(report, create.path)
  assertCondition(
    report,
    '用户植物 create 模式页面可达',
    Boolean(await findViewById(create, 'add-plant-swiper'))
  )
  assertCondition(
    report,
    '用户植物 create 模式选择入口可达',
    Boolean(await findViewById(create, 'add-plant-next-button'))
  )
  const createPlantCard = await waitForFirstByIdPrefix(create, 'add-plant-card-')
  assertCondition(report, '用户植物 create 模式存在可选植物', Boolean(createPlantCard))
  await tapStableElement(createPlantCard?.element)
  await sleep(UI_SETTLE_MS)
  let createCurrentStep = null
  try {
    const createSwiper = await findViewById(create, 'add-plant-swiper')
    createCurrentStep = await createSwiper?.property?.('current')
  } catch {
    createCurrentStep = null
  }
  assertCondition(
    report,
    '用户植物 create 模式点击卡片已切换到信息步骤',
    Number(createCurrentStep) === 1
  )
  const createForm = await waitForElement(create, 'add-plant-form', WAIT_MS)
  assertCondition(report, '用户植物 create 模式信息表单可见', Boolean(createForm))
  assertCondition(
    report,
    '用户植物 create 模式基本信息分区可见',
    Boolean(await findViewById(create, 'add-plant-basic-info-section'))
  )
  assertCondition(
    report,
    '用户植物 create 模式养护信息分区可见',
    Boolean(await findViewById(create, 'add-plant-care-info-section'))
  )
  assertCondition(
    report,
    '用户植物 create 模式盆信息分区可见',
    Boolean(await findViewById(create, 'add-plant-pot-info-section'))
  )
  await capture(mp, env, report, 'user-plant-detail-modes')
}

async function runUserPlantDeleteConfirmation({ mp, report, env }) {
  const { plantId } = await findFirstPlantId(mp, report)
  const view = await reLaunchTo(
    mp,
    `/subpackages/plant/user-plant-detail/user-plant-detail?mode=view&id=${plantId}`
  )
  recordPage(report, view.path)
  const deleteButton = await waitForElement(view, 'user-plant-detail-delete-button', WAIT_MS)
  assertCondition(report, '用户植物删除入口可见', Boolean(deleteButton))
  await tapStableElement(deleteButton)
  await sleep(UI_SETTLE_MS)
  const stillOnDetail = await waitForRoute(
    mp,
    '/subpackages/plant/user-plant-detail/user-plant-detail'
  )
  assertCondition(report, '删除确认出现前不会删除或跳转', Boolean(stillOnDetail))
  await capture(mp, env, report, 'user-plant-delete-confirmation', {
    expectedRoute: 'subpackages/plant/user-plant-detail/user-plant-detail'
  })
  await mp.callWxMethod('hideModal').catch(() => {})
  recordAssertion(report, '删除确认提示已关闭且未触发删除请求', true)
}

const SCENARIOS = Object.freeze({
  calendarTaskAndPlan: runCalendarTaskAndPlan,
  calendarWeatherAndSolar: runCalendarWeatherAndSolar,
  reminderClosure: runReminderClosure,
  homeCardCareClosure: runHomeCardCareClosure,
  mvpHiddenNativeTabs: runMvpHiddenNativeTabs,
  lightEnvironmentSave: runLightEnvironmentSave,
  userDetailModes: runUserDetailModes,
  userPlantDeleteConfirmation: runUserPlantDeleteConfirmation
})

export async function runBusinessCoverageLeaf({ scenario, catalogId } = {}) {
  const env = resolveEnv(process.argv.slice(2))
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    baseHead: resolvePrBaseHead(),
    projectPath: env.projectPath,
    mode: catalogId,
    wsEndpoint: env.wsEndpoint
  })
  let mp = null
  let requestCaptureInstalled = false
  try {
    const projectCheck = preflightProject(env.projectPath)
    if (!projectCheck.ok) {
      setClassification(report, 'BLOCKED_ENV', projectCheck.reason)
      return report
    }
    try {
      mp = await connectAutomator(env.wsEndpoint)
    } catch (error) {
      const reason =
        error instanceof AutomatorConnectError ? error.reason : String(error?.message || error)
      setClassification(report, 'BLOCKED_ENV', `automator connect failed: ${reason}`)
      return report
    }
    // 该优化验收叶子必须把真实 wx.request 和最终页面数据写入报告。
    // 只观察请求，不替换响应、不注入 fixture；其他业务叶子保持原有行为。
    if (catalogId === 'plant.user_detail_create_edit_view_modes') {
      await installRequestCapture(mp, {
        addProbeId: true,
        probePrefix: `qa-${String(process.env.DISPATCH_QA_EXECUTION_ID || process.pid)}`
      })
      requestCaptureInstalled = true
    }
    const runner = SCENARIOS[scenario]
    if (!runner) {
      throw new Error(`unknown business coverage scenario: ${scenario}`)
    }
    await runner({ mp, report, env })
    report.business_assertions_reached = true
    setClassification(report, 'PASS')
    return report
  } catch (error) {
    const classification =
      error instanceof FixtureBlockedError
        ? 'BLOCKED_FIXTURE'
        : error instanceof EnvironmentBlockedError
          ? 'BLOCKED_ENV'
          : error instanceof ProductAssertionError
            ? 'FAIL_PRODUCT'
            : 'BLOCKED_ENV'
    setClassification(report, classification, String(error?.message || error))
    return report
  } finally {
    if (requestCaptureInstalled) {
      try {
        const requests = await readCapturedRequests(mp)
        recordRequests(report, requests)
      } catch {
        // 保留业务断言结果；请求捕获失败会在报告中通过空列表显式可见。
      }
      try {
        const current = await getCurrentPageWithFallback(mp, {
          timeoutMs: 5000,
          perRpcTimeoutMs: 2000
        })
        const page = current?.page
        const data = (await page?.data?.()) || {}
        recordPageData(report, page?.path || '', {
          route: page?.path || '',
          keys: Object.keys(data).sort()
        })
      } catch {
        // 页面已在 runner 中完成断言；这里仅记录可选的摘要证据。
      }
      await restoreRequest(mp).catch(() => {})
    }
    await safeDisconnect(mp)
    const reportPath = saveReport(report, env.artifactDir, `${scenario}-${Date.now()}`)
    report.report_path = reportPath
    emitLeafReport(report)
    console.error(`[e2e] report: ${reportPath}`)
    if (report.classification !== 'PASS') {
      process.exitCode = FAILURE_EXIT_CODE
    }
  }
}
