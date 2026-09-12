#!/usr/bin/env node
'use strict'

/**
 * 通过真实小程序界面为已有用户植物补录光照和空气环境。
 *
 * 这是 QA fixture setup，不是验收叶子：所有写入都经过端上表单的保存按钮，
 * 不直接调用 API、不伪造请求。脚本使用 test-owned DevTools 会话，避免接管用户调试会话。
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cleanupTestOwnedQaSession,
  createTestOwnedQaSession
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-session.mjs'
import {
  connectAutomator,
  safeDisconnect
} from '../../test/e2e/automator/care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
import {
  collectByIdPrefix,
  findViewById,
  readTextById,
  tapStableElement
} from '../../test/e2e/automator/care/watering/transpiration-v3/_shared/lib/element-helpers.mjs'
import { resolveQaBackendTarget } from './qa-backend-target.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const projectPath = path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const artifactDir = path.resolve(
  process.env.E2E_ARTIFACT_DIR ||
    process.env.QA_ARTIFACT_DIR ||
    path.join(
      os.tmpdir(),
      'planting-automator-diagnostic',
      'plant-environment-setup',
      String(process.pid)
    )
)
const wxRequestUrl = resolveQaBackendTarget(process.env, {
  port: 3011,
  functionPortBase: 9100
}).wxRequestUrl
const plantId = String(process.env.PLANT_ID || '12')
const dispatchRunId = `mvp-completion-20260809-record-environment-${plantId}`
const WAIT_MS = 20_000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForElement(page, id, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const element = await findViewById(page, id)
    if (element) {
      return element
    }
    await sleep(250)
  }
  throw new Error(`端上元素未出现: #${id}`)
}

async function waitForOptionalElement(page, id, timeoutMs = 8_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const element = await findViewById(page, id)
    if (element) {
      return element
    }
    await sleep(250)
  }
  return null
}

async function waitForPath(mp, expectedPath, timeoutMs = WAIT_MS) {
  const deadline = Date.now() + timeoutMs
  const normalizedExpected = String(expectedPath).replace(/^\//, '')
  while (Date.now() < deadline) {
    const page = await mp.currentPage()
    if (String(page?.path || '').replace(/^\//, '') === normalizedExpected) {
      return page
    }
    await sleep(250)
  }
  const page = await mp.currentPage().catch(() => null)
  throw new Error(`端上页面未到达 ${expectedPath}，当前为 ${page?.path || 'unknown'}`)
}

async function tapById(page, id) {
  const element = await waitForElement(page, id)
  await tapStableElement(element)
  await sleep(500)
}

async function changePicker(page, id, value) {
  const picker = await waitForElement(page, id)
  await picker.trigger('change', { value })
  await sleep(400)
}

async function changeSlider(page, id, value) {
  const slider = await waitForElement(page, id)
  await slider.trigger('change', { value })
  await sleep(400)
}

async function main() {
  fs.mkdirSync(artifactDir, { recursive: true })
  const session = await createTestOwnedQaSession({
    dispatchRunId,
    projectPath,
    screenshotPath: artifactDir,
    wxRequestUrl,
    forceFullLanRebuild: true,
    fullLanRebuildReason: 'user plant environment fixture setup through real UI'
  })
  if (session.status !== 'ready') {
    throw new Error(`测试专属端上会话启动失败: ${session.code || session.reason || session.status}`)
  }

  let mp = null
  const evidence = {
    status: 'started',
    plantId: Number(plantId),
    source: 'real_ui_form_submission',
    no_direct_api_write: true,
    selections: {},
    routes: []
  }
  try {
    mp = await connectAutomator(session.preflight_options.wsEndpoint)

    let page = await mp.reLaunch('/pages/index/index')
    await waitForElement(page, `index-plant-card-edit-${plantId}`)
    evidence.routes.push((await mp.currentPage()).path)

    page = await mp.reLaunch('/subpackages/care/watering-advisor/watering-advisor')
    await waitForElement(page, 'watering-advisor-my-plants-entry')
    await tapById(page, 'watering-advisor-my-plants-entry')
    await waitForElement(page, 'watering-advisor-my-plants-list')
    evidence.advisorPlantOrder = (
      await collectByIdPrefix(page, 'watering-advisor-my-plant-card-')
    ).map(item => item.stableId)

    page = await mp.reLaunch('/pages/index/index')
    await waitForElement(page, `index-plant-card-edit-${plantId}`)
    await tapById(page, `index-plant-card-edit-${plantId}`)
    page = await waitForPath(mp, '/subpackages/plant/user-plant-detail/user-plant-detail')
    await waitForElement(page, 'edit-plant-environment-light-entry')
    evidence.routes.push(page.path)

    await tapById(page, 'edit-plant-environment-light-entry')
    page = await waitForPath(mp, '/subpackages/care/plant-environment/light-environment')
    await waitForElement(page, 'plant-light-environment-complete-button')
    await tapById(page, 'plant-light-environment-window-window')
    await tapById(page, 'plant-light-environment-facing-south')
    await changeSlider(page, 'plant-light-environment-distance-slider-profile', 2)
    evidence.selections.light = {
      windowType: 'standard',
      facing: 'south',
      distance: 2,
      position: 'middle',
      hasDirectSun: false
    }
    await tapById(page, 'plant-light-environment-complete-button')
    page = await waitForPath(mp, '/subpackages/plant/user-plant-detail/user-plant-detail')
    await waitForElement(page, 'edit-plant-environment-air-entry')

    await tapById(page, 'edit-plant-environment-air-entry')
    page = await waitForPath(mp, '/subpackages/care/airflow/index')
    await waitForElement(page, 'plant-air-environment-single-page')
    await tapById(page, 'plant-air-environment-single-window-direction-one')
    await changePicker(page, 'plant-air-environment-single-window-frequency-picker', 0)
    await tapById(page, 'plant-air-environment-single-canopy-open')
    await tapById(page, 'plant-air-environment-single-device-mode-none')
    evidence.selections.air = {
      source: 'window',
      windowDirectionCount: 'one',
      windowOpenFrequency: 'daily',
      canopyOpenness: 'open',
      deviceAirflow: 'none'
    }
    await tapById(page, 'plant-air-environment-complete-button')
    page = await waitForPath(mp, '/subpackages/plant/user-plant-detail/user-plant-detail')
    await waitForElement(page, 'edit-plant-environment-light-status')
    evidence.routes.push(
      '/subpackages/care/plant-environment/light-environment',
      '/subpackages/care/airflow/index',
      page.path
    )
    evidence.statusText = {
      light: await readTextById(page, 'edit-plant-environment-light-status'),
      air: await readTextById(page, 'edit-plant-environment-air-status')
    }

    await tapById(page, 'edit-plant-environment-air-entry')
    page = await waitForPath(mp, '/subpackages/care/airflow/index')
    await waitForElement(page, 'plant-air-environment-single-summary')
    evidence.savedAirSummary = await readTextById(page, 'plant-air-environment-single-summary')

    // 再走一次浇水建议的真实用户入口，确认保存资料与当前养护地点绑定；
    // 若地点发生过变化，使用端上“确认当前位置未变”完成匹配保存。
    page = await mp.reLaunch('/subpackages/care/watering-advisor/watering-advisor')
    await waitForElement(page, 'watering-advisor-my-plants-entry')
    await tapById(page, 'watering-advisor-my-plants-entry')
    await waitForElement(page, `watering-advisor-my-plant-card-${plantId}`)
    await tapById(page, `watering-advisor-my-plant-card-${plantId}`)
    // 选中植物后等待空气资料读取完成，再进入下一步，避免把异步回填
    // 误判为没有保存资料。
    await sleep(8000)
    await tapById(page, 'watering-advisor-next-button')
    const confirmation = await waitForOptionalElement(
      page,
      'watering-advisor-air-environment-confirm-location'
    )
    if (confirmation) {
      await tapStableElement(confirmation)
      await sleep(800)
    }
    const next = await waitForElement(page, 'watering-advisor-air-environment-next')
    await tapStableElement(next)
    await waitForElement(page, 'watering-advisor-compute-button')
    await sleep(5000)

    // 在新的页面实例中再次读取，确认不是当前页面草稿或内存状态造成的假回填。
    page = await mp.reLaunch('/subpackages/care/watering-advisor/watering-advisor')
    await waitForElement(page, 'watering-advisor-my-plants-entry')
    await tapById(page, 'watering-advisor-my-plants-entry')
    await waitForElement(page, `watering-advisor-my-plant-card-${plantId}`)
    await tapById(page, `watering-advisor-my-plant-card-${plantId}`)
    await sleep(8000)
    await tapById(page, 'watering-advisor-next-button')
    await waitForElement(page, 'watering-advisor-air-environment-summary')
    await waitForElement(page, 'watering-advisor-air-environment-next')
    evidence.savedPrefillVerifiedInFreshPage = true
    evidence.locationBindingConfirmed = true
    evidence.status = 'completed'
  } finally {
    await safeDisconnect(mp)
    evidence.cleanup = await cleanupTestOwnedQaSession({ session })
    const outputPath = path.join(artifactDir, `record-${plantId}.json`)
    fs.writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`)
    process.stdout.write(`${JSON.stringify({ ...evidence, outputPath })}\n`)
  }
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exitCode = 1
})
