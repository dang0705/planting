#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_real_data; test_kind=real_http_contract。
// 这是服务链路回归，不是小程序端上验收：请求直接命中 cloud1_dev 的真实
// HTTPS 函数，并使用隔离 QA 已持久化的平台会话。页面、wx.request、响应式
// 状态和截图仍由 automator_live_real_api 负责，不能用本用例替代。

const require = createRequire(import.meta.url)
const { SESSION_PREFIX } = require('../../../../../cloudfunctions/layer/utils/platform-session.js')

const DEVELOPMENT_ENV_ID = 'cloud1-2grufevs395a9d5e'
const REQUEST_TIMEOUT_MS = 20_000
const baseUrl = String(process.env.UNIT_REAL_DATA_BASE_URL || '')
  .trim()
  .replace(/\/+$/u, '')
const platformSession = String(process.env.UNIT_REAL_DATA_PLATFORM_SESSION || '').trim()
const environmentId = String(process.env.CLOUDBASE_ENV_ID || DEVELOPMENT_ENV_ID).trim()

function assertEnvironmentReady() {
  assert.equal(
    environmentId,
    DEVELOPMENT_ENV_ID,
    'BLOCKED_ENV: 诊断真实接口回归只允许 cloud1_dev'
  )
  assert.ok(baseUrl, 'BLOCKED_ENV: 缺少 UNIT_REAL_DATA_BASE_URL')
  assert.match(baseUrl, /^https:\/\//u, 'BLOCKED_ENV: UNIT_REAL_DATA_BASE_URL 必须是 HTTPS')
  assert.ok(
    platformSession.startsWith(`${SESSION_PREFIX}_`),
    'BLOCKED_ENV: 缺少隔离 QA 平台会话'
  )
}

const payload = {
  symptomClassKey: 'yellowing_mode',
  symptomKey: 'uniform_yellowing',
  diagnosisProfile: 'full',
  entrySource: 'diagnose_tab',
  clientContext: {
    source: 'unit_real_data',
    platform: 'wechat-mini-program'
  }
}

async function call(path, { authenticated = true } = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const headers = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-app-env': 'development',
      'x-env': 'development'
    }
    if (authenticated) {
      headers.Authorization = `Bearer ${platformSession}`
      headers['x-planting-platform-session'] = platformSession
    }
    const startedAt = Date.now()
    const response = await fetch(`${baseUrl}/${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    })
    const raw = await response.text()
    let body
    try {
      body = raw ? JSON.parse(raw) : null
    } catch {
      throw new Error(`${path} 返回非 JSON 响应，HTTP ${response.status}`)
    }
    return { status: response.status, body, elapsedMs: Date.now() - startedAt }
  } finally {
    clearTimeout(timeout)
  }
}

function assertQuestionStartSuccess(result, label) {
  assert.equal(result.status, 200, `${label}: HTTP ${result.status}`)
  assert.equal(result.body?.code, 200, `${label}: business code=${result.body?.code}`)
  assert.match(
    String(result.body?.data?.diagnosisSessionId || ''),
    /^\S+$/u,
    `${label}: 必须返回诊断会话 ID`
  )
  assert.ok(
    Array.isArray(result.body?.data?.questions) && result.body.data.questions.length > 0,
    `${label}: 必须返回非空题目数组`
  )
}

async function main() {
  assertEnvironmentReady()

  const unauthenticated = await call('diagnosis-question-start-http/diagnosis/question/start', {
    authenticated: false
  })
  assert.equal(unauthenticated.status, 401, '缺少持久会话必须拒绝 question/start')
  assert.equal(unauthenticated.body?.code, 401, '缺少持久会话必须返回业务 401')

  const dedicated = await call('diagnosis-question-start-http/diagnosis/question/start')
  assertQuestionStartSuccess(dedicated, '专用 question/start')

  const legacy = await call('diagnose-http/diagnosis/question/start')
  assertQuestionStartSuccess(legacy, '旧 question/start')

  console.log(
    JSON.stringify({
      data_mode: 'unit_real_data',
      environment: 'cloud1_dev',
      endpoints: [
        {
          name: 'diagnosis-question-start-http/diagnosis/question/start',
          status: dedicated.status,
          code: dedicated.body?.code,
          question_count: dedicated.body?.data?.questions?.length,
          elapsed_ms: dedicated.elapsedMs
        },
        {
          name: 'diagnose-http/diagnosis/question/start',
          status: legacy.status,
          code: legacy.body?.code,
          question_count: legacy.body?.data?.questions?.length,
          elapsed_ms: legacy.elapsedMs
        },
        {
          name: 'unauthenticated question/start',
          status: unauthenticated.status,
          code: unauthenticated.body?.code
        }
      ]
    })
  )
}

main().catch(error => {
  console.error(`[unit_real_data] ${error.stack || error.message}`)
  process.exitCode = 1
})
