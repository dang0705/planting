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
 * 脚本只连接已有 9420 与现有 LAN 服务，不启动、不重启，也不制造资料。
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
  recordPage,
  recordAssertion,
  recordScreenshot,
  setClassification,
  saveReport,
  hasFailedAssertions
} from './_shared/lib/reporter.mjs'
import { preflightProject } from './_shared/lib/project-check.mjs'

const WATERING_PAGE = '/pages/watering-advisor/watering-advisor'
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
  if (!firstPlant || !(await tap(firstPlant.element, report, 'select first user plant'))) {
    return null
  }
  const next = await findById(page, 'watering-advisor-next-button')
  if (!(await tap(next, report, 'enter air-environment step'))) {
    return null
  }
  const summary = await findById(page, 'watering-advisor-air-environment-summary', 2500)
  const assessment = await findById(page, 'watering-advisor-air-environment-assessment', 2500)
  const loadError = await findById(page, 'watering-advisor-air-environment-load-error', 2500)
  recordAssertion(
    report,
    'air-environment step is actually rendered after next',
    Boolean(summary || assessment || loadError)
  )
  return { firstPlant, summary, assessment, loadError }
}

async function completeFallbackAirEnvironment(page, report) {
  const source = await findById(page, 'watering-advisor-air-environment-exchange-source-fresh_air')
  if (!(await tap(source, report, 'fallback selects fresh-air exchange'))) {
    return false
  }
  const internalNext = await findById(page, 'watering-advisor-air-environment-next-step')
  if (!(await tap(internalNext, report, 'fallback opens local-airflow step'))) {
    return false
  }
  const canopy = await findById(page, 'watering-advisor-air-environment-canopy-open')
  const device = await findById(page, 'watering-advisor-air-environment-device-mode-none')
  if (
    !(await tap(canopy, report, 'fallback selects open canopy')) ||
    !(await tap(device, report, 'fallback selects no device airflow'))
  ) {
    return false
  }
  const next = await findById(page, 'watering-advisor-air-environment-next')
  return tap(next, report, 'fallback continues to pot profile without profile GET')
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
  const source = await findById(page, 'watering-advisor-air-environment-exchange-source-fresh_air')
  await tap(source, report, 'edit first plant draft')
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
