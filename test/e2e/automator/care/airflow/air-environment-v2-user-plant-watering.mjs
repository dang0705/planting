#!/usr/bin/env node
'use strict'

/**
 * 用户植物空气环境 v2 端上场景。
 *
 * 运行前由 QA 提供一个不写入真实用户资料的 fixture：
 * - `saved-prefill`：第一株植物有位置匹配的完整已保存资料；
 * - `failure-fallback`：网关令空气环境 GET/PATCH 失败，且该植物已有完整盆型；
 * - `switch-draft`：第一株有资料、第二株无资料，用于确认草稿不串植物。
 *
 * 脚本只连接 catalog supervisor 提供的正式 QA 9421 与现有 LAN 服务，不启动、不重启，也不制造资料。
 */

import path from 'node:path'
import automator from 'miniprogram-automator'
import { handoffFormalLeafScreenshot } from '../../_shared/formal-leaf-harness.mjs'
import {
  resolveEnv,
  resolveGitHead,
  resolveGitBranch,
  timestampForFilename
} from './_shared/lib/env.mjs'
import {
  connectAutomator,
  AutomatorConnectError,
  safeDisconnect,
  reLaunchTo
} from './_shared/lib/automator-client.mjs'
import {
  collectByIdPrefix,
  findByIdPrefix as findStableByIdPrefix,
  findViewById as findStableViewById,
  tapStableElement
} from '../watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import {
  createReport,
  emitLeafReport,
  recordPage,
  recordAssertion,
  recordScreenshot,
  setClassification,
  saveReport,
  hasFailedAssertions
} from './_shared/lib/reporter.mjs'
import { preflightProject } from './_shared/lib/project-check.mjs'

const WATERING_PAGE = '/subpackages/care/watering-advisor/watering-advisor'
const ALMOST_NEVER_PICKER_INDEX = 3
const PICKER_SETTLE_DELAY_MS = 100
const SCENARIOS = new Set(['saved-prefill', 'failure-fallback', 'switch-draft'])

function getScenario(argv = process.argv.slice(2)) {
  const option = argv.find(value => value.startsWith('--scenario='))
  const scenario = option ? option.slice('--scenario='.length) : 'saved-prefill'
  if (!SCENARIOS.has(scenario)) {
    throw new Error(`invalid --scenario=${scenario}; expected ${[...SCENARIOS].join('|')}`)
  }
  return scenario
}

async function sleep(ms) {
  await new Promise(resolve => setTimeout(resolve, ms))
}

async function findById(page, id, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const element = await findStableViewById(page, id)
    if (element) {
      return element
    }
    await sleep(200)
  }
  return null
}

async function findByIdPrefix(page, prefix, timeoutMs = 8000) {
  const end = Date.now() + timeoutMs
  while (Date.now() < end) {
    const match = await findStableByIdPrefix(page, prefix)
    if (match) {
      return match
    }
    await sleep(200)
  }
  return null
}

async function tap(element, report, assertion) {
  if (!element) {
    recordAssertion(report, assertion, false, 'element not found')
    return false
  }
  try {
    await tapStableElement(element)
    recordAssertion(report, assertion, true)
    return true
  } catch (error) {
    recordAssertion(report, assertion, false, String(error?.message || error))
    return false
  }
}

async function selectPicker(page, id, index, report, assertion) {
  const picker = await findById(page, id)
  if (!picker) {
    recordAssertion(report, assertion, false, 'element not found')
    return false
  }
  try {
    await picker.trigger('change', { value: index })
    await sleep(PICKER_SETTLE_DELAY_MS)
    recordAssertion(report, assertion, true)
    return true
  } catch (error) {
    recordAssertion(report, assertion, false, String(error?.message || error))
    return false
  }
}

async function capture(mp, report, env, name) {
  try {
    const file = path.resolve(env.artifactDir, `${name}-${timestampForFilename()}.png`)
    const resumed = await handoffFormalLeafScreenshot({
      mp,
      automator,
      wsEndpoint: env.wsEndpoint,
      outputPath: file
    })
    recordScreenshot(report, file)
    return resumed.mp
  } catch (error) {
    setClassification(
      report,
      'BLOCKED_ENV',
      `screenshot failed: ${String(error?.message || error)}`
    )
    throw error
  }
}

async function enterFirstUserPlantAirStep(page, report) {
  const myPlantsEntry = await findById(page, 'watering-advisor-my-plants-entry')
  if (!(await tap(myPlantsEntry, report, 'open my-plants selector'))) {
    return null
  }
  const firstPlant = await findByIdPrefix(page, 'watering-advisor-my-plant-card-')
  recordAssertion(report, 'fixture has at least one user plant', Boolean(firstPlant))
  if (!firstPlant) {
    setClassification(
      report,
      'BLOCKED_FIXTURE',
      '运行时未找到任何用户植物入口；禁止直接判定 fixture 缺失，必须先完整重跑 npm run dev:mp-weixin:local-functions:lan 并重新执行该叶子场景'
    )
    return null
  }
  if (!(await tap(firstPlant.element, report, 'select first user plant'))) {
    return null
  }
  // 选择我的植物后，页面会异步读取空气环境资料；端上实测该请求在本地
  // LAN flow 下可能需要数秒。先让读取完成，再点击下一步，避免把合法的
  // “资料尚未回填”误判成 saved-prefill fixture 缺失。
  await sleep(8000)
  const next = await findById(page, 'watering-advisor-next-button')
  if (!(await tap(next, report, 'enter air-environment step'))) {
    return null
  }
  // 选择植物后，空气资料 GET 与页面步进是异步的；本地 LAN 端上实测可能在
  // 首次 next 后约 5 秒才完成首屏渲染，2.5 秒会把“尚未加载完”误判为 fixture 缺失。
  const summary = await findById(page, 'watering-advisor-air-environment-summary', 8000)
  const assessment = await findById(page, 'watering-advisor-air-environment-assessment', 8000)
  const loadError = await findById(page, 'watering-advisor-air-environment-load-error', 8000)
  recordAssertion(
    report,
    'air-environment step is actually rendered after next',
    Boolean(summary || assessment || loadError)
  )
  return { firstPlant, summary, assessment, loadError }
}

async function completeFallbackAirEnvironment(page, report) {
  const source = await findById(page, 'watering-advisor-air-environment-single-exchange-window')
  if (!(await tap(source, report, 'fallback selects window exchange'))) {
    return false
  }
  if (
    !(await selectPicker(
      page,
      'watering-advisor-air-environment-single-window-frequency-picker',
      ALMOST_NEVER_PICKER_INDEX,
      report,
      'fallback selects almost-never window frequency'
    ))
  ) {
    return false
  }
  const freshAirSwitch = await findById(
    page,
    'watering-advisor-air-environment-single-fresh-air-switch'
  )
  if (!(await tap(freshAirSwitch, report, 'fallback enables fresh-air exchange'))) {
    return false
  }
  const canopy = await findById(page, 'watering-advisor-air-environment-single-canopy-open')
  if (!(await tap(canopy, report, 'fallback selects open canopy'))) {
    return false
  }
  const next = await findById(page, 'watering-advisor-air-environment-next')
  return tap(next, report, 'fallback continues to pot profile without profile GET')
}

async function selectFallbackWindowFrequency(page, report) {
  return selectPicker(
    page,
    'watering-advisor-air-environment-single-window-frequency-picker',
    ALMOST_NEVER_PICKER_INDEX,
    report,
    'edit almost-never window frequency'
  )
}

async function runSavedPrefill(page, report) {
  const state = await enterFirstUserPlantAirStep(page, report)
  if (!state) {
    return
  }
  if (!state.summary && state.assessment) {
    setClassification(
      report,
      'BLOCKED_FIXTURE',
      'saved-prefill fixture is missing: selected user plant has no complete saved air environment profile'
    )
    return
  }
  recordAssertion(
    report,
    'saved matching profile is rendered as a direct summary',
    Boolean(state.summary)
  )
  recordAssertion(report, 'saved matching profile does not force editor', !state.assessment)
  const next = await findById(page, 'watering-advisor-air-environment-next')
  await tap(next, report, 'saved summary continues immediately to pot profile')
  recordAssertion(
    report,
    'pot-profile step opens without waiting for profile synchronization',
    Boolean(await findById(page, 'watering-advisor-compute-button', 2500))
  )
}

async function runFailureFallback(page, report) {
  const state = await enterFirstUserPlantAirStep(page, report)
  if (!state) {
    return
  }
  recordAssertion(
    report,
    'GET failure keeps the editable air-environment form available',
    Boolean(state.assessment)
  )
  recordAssertion(
    report,
    'GET failure exposes a weak read warning instead of blocking the form',
    Boolean(state.loadError)
  )
  await completeFallbackAirEnvironment(page, report)
  const compute = await findById(page, 'watering-advisor-compute-button', 2500)
  recordAssertion(report, 'profile failure does not block the next main step', Boolean(compute))
  if (!compute || !(await tap(compute, report, 'generate watering advice while PATCH fails'))) {
    return
  }
  recordAssertion(
    report,
    'GET/PATCH failure still reaches a watering recommendation',
    Boolean(await findById(page, 'watering-advisor-result-amount', 12000))
  )
  recordAssertion(
    report,
    'PATCH failure keeps a semantic retry-save action as a weak result state',
    Boolean(await findById(page, 'watering-advisor-air-environment-retry-save', 6000))
  )
}

async function runSwitchDraft(page, report) {
  const state = await enterFirstUserPlantAirStep(page, report)
  if (!state) {
    return
  }
  const edit = await findById(page, 'watering-advisor-air-environment-edit')
  if (edit) {
    await tap(edit, report, 'open first plant editor')
  }
  const source = await findById(page, 'watering-advisor-air-environment-single-exchange-window')
  await tap(source, report, 'edit first plant exchange draft')
  await selectFallbackWindowFrequency(page, report)
  const freshAirSwitch = await findById(
    page,
    'watering-advisor-air-environment-single-fresh-air-switch'
  )
  await tap(freshAirSwitch, report, 'edit fresh-air exchange draft')
  const back = await findById(page, 'watering-advisor-air-environment-back')
  if (!(await tap(back, report, 'return to user plant selection'))) {
    return
  }
  const firstId = String(state.firstPlant.id || '')
  const candidates = await collectByIdPrefix(page, 'watering-advisor-my-plant-card-')
  const second = candidates.find(candidate => candidate.id !== firstId)?.element || null
  recordAssertion(report, 'fixture has a second user plant for draft isolation', Boolean(second))
  if (!second || !(await tap(second, report, 'switch to second user plant'))) {
    return
  }
  const next = await findById(page, 'watering-advisor-next-button')
  if (!(await tap(next, report, 'enter second plant air step'))) {
    return
  }
  recordAssertion(
    report,
    'switching plants does not retain first-plant saved summary or draft',
    Boolean(await findById(page, 'watering-advisor-air-environment-assessment', 2500))
  )
}

export async function runAirEnvironmentV2UserPlantWatering() {
  const env = resolveEnv()
  const scenario = getScenario()
  const report = createReport({
    gitHead: resolveGitHead(),
    branch: resolveGitBranch(),
    projectPath: env.projectPath,
    wsEndpoint: env.wsEndpoint
  })
  report.task = `air-environment-v2-user-plant-watering:${scenario}`
  const preflight = preflightProject(env.projectPath)
  if (!preflight.ok) {
    setClassification(report, 'BLOCKED_ENV', preflight.reason)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `air-environment-v2-user-plant-${scenario}-${timestampForFilename()}`
    )
    console.log(`[e2e] classification: ${report.classification}`)
    console.log(`[e2e] report: ${reportPath}`)
    emitLeafReport(report)
    process.exitCode = 2
    return
  }
  let mp = null
  try {
    mp = await connectAutomator(env.wsEndpoint)
    let page = await reLaunchTo(mp, WATERING_PAGE)
    recordPage(report, WATERING_PAGE)
    mp = await capture(mp, report, env, `air-environment-v2-${scenario}-initial`)
    page = await mp.currentPage()
    if (scenario === 'saved-prefill') {
      await runSavedPrefill(page, report)
    }
    if (scenario === 'failure-fallback') {
      await runFailureFallback(page, report)
    }
    if (scenario === 'switch-draft') {
      await runSwitchDraft(page, report)
    }
    mp = await capture(mp, report, env, `air-environment-v2-${scenario}-final`)
    if (!['BLOCKED_ENV', 'BLOCKED_FIXTURE'].includes(report.classification)) {
      setClassification(
        report,
        hasFailedAssertions(report) ? 'FAIL_PRODUCT' : 'PASS',
        hasFailedAssertions(report) ? 'one or more assertions failed' : undefined
      )
    }
  } catch (error) {
    if (!['BLOCKED_ENV', 'BLOCKED_FIXTURE'].includes(report.classification)) {
      setClassification(
        report,
        error instanceof AutomatorConnectError ? 'BLOCKED_ENV' : 'FAIL_PRODUCT',
        String(error?.message || error)
      )
    }
  } finally {
    await safeDisconnect(mp)
    const reportPath = saveReport(
      report,
      env.artifactDir,
      `air-environment-v2-user-plant-${scenario}-${timestampForFilename()}`
    )
    console.log(`[e2e] classification: ${report.classification}`)
    console.log(`[e2e] report: ${reportPath}`)
    emitLeafReport(report)
  }
  process.exitCode =
    report.classification === 'PASS'
      ? 0
      : ['BLOCKED_ENV', 'BLOCKED_FIXTURE'].includes(report.classification)
        ? 2
        : 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAirEnvironmentV2UserPlantWatering().catch(error => {
    console.error('[e2e] fatal error:', error?.message || error)
    process.exit(1)
  })
}
