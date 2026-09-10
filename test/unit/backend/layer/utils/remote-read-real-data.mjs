#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_real_data; test_kind=real_http_contract。
// 这是一期两个高频读入口的只读真实 API 回归。它不能替代真实小程序
// wx.request、页面状态和截图验收；那些证据仍由 automator_live_real_api 提供。

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
    'BLOCKED_ENV: 读链路真实接口回归只允许 cloud1_dev'
  )
  assert.ok(baseUrl, 'BLOCKED_ENV: 缺少 UNIT_REAL_DATA_BASE_URL')
  assert.match(baseUrl, /^https:\/\//u, 'BLOCKED_ENV: UNIT_REAL_DATA_BASE_URL 必须是 HTTPS')
  assert.ok(platformSession.startsWith(`${SESSION_PREFIX}_`), 'BLOCKED_ENV: 缺少隔离 QA 平台会话')
}

async function call(
  path,
  { method = 'GET', body, identity = 'platform-session', extraHeaders = {} } = {}
) {
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    'x-app-env': 'development',
    'x-env': 'development',
    ...extraHeaders
  }
  if (identity === 'platform-session') {
    headers.Authorization = `Bearer ${platformSession}`
    headers['x-planting-platform-session'] = platformSession
  } else if (identity) {
    headers.Authorization = `Bearer ${identity}`
  }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const startedAt = Date.now()
    const response = await fetch(`${baseUrl}/${path}`, {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal
    })
    const raw = await response.text()
    const responseBody = raw ? JSON.parse(raw) : null
    return {
      status: response.status,
      body: responseBody,
      elapsedMs: Date.now() - startedAt,
      requestId: String(
        response.headers.get('x-cloudbase-request-id') || response.headers.get('x-request-id') || ''
      ).trim()
    }
  } finally {
    clearTimeout(timeout)
  }
}

function assertSuccess(result, label) {
  const requestSuffix = result.requestId ? ` request_id=${result.requestId}` : ''
  assert.equal(result.status, 200, `${label}: HTTP ${result.status}${requestSuffix}`)
  assert.equal(result.body?.code, 200, `${label}: business code=${result.body?.code}${requestSuffix}`)
}

function plantIds(result) {
  return (result.body?.data?.list || []).map(item => String(item?.id || ''))
}

async function main() {
  assertEnvironmentReady()

  const currentUser = await call('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} }
  })
  assertSuccess(currentUser, '持久会话 auth/user')
  const userId = String(currentUser.body?.data?._id || '').trim()
  const identityTicket = String(currentUser.body?.data?.httpIdentityTicket || '').trim()
  assert.ok(userId, 'auth/user 必须返回稳定统一用户 ID')
  assert.ok(identityTicket, 'auth/user 必须返回统一用户票据')

  const sessionPlants = await call('plant-user-http/user-plants?page=1&pageSize=50')
  assertSuccess(sessionPlants, '持久会话 user-plants')
  assert.ok(Array.isArray(sessionPlants.body?.data?.list), '持久会话列表必须是数组')
  assert.ok(Number(sessionPlants.body?.data?.total) > 0, '已存在植物的测试账号不得返回空列表')
  const sessionIds = plantIds(sessionPlants)
  assert.ok(sessionIds.length > 0 && sessionIds.every(Boolean), '列表必须返回稳定植物 ID')
  const firstPlantId = sessionIds[0]

  // 详情不是一期短票据优化范围。验证列表优化没有把详情授权悄然扩大，
  // 同时确认现有持久会话详情路径仍可读回同一条植物。
  const sessionPlantDetail = await call(`plant-user-http/user-plants?id=${firstPlantId}`)
  assertSuccess(sessionPlantDetail, '持久会话 user-plants 详情')
  assert.equal(
    String(sessionPlantDetail.body?.data?.id || ''),
    firstPlantId,
    '持久会话详情必须读回列表中的同一植物'
  )

  const ticketUser = await call('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} },
    identity: identityTicket
  })
  assertSuccess(ticketUser, '统一票据 auth/user')
  assert.equal(String(ticketUser.body?.data?._id || ''), userId, '票据用户必须与持久会话用户一致')

  const ticketPlants = await call('plant-user-http/user-plants?page=1&pageSize=50', {
    identity: identityTicket
  })
  assertSuccess(ticketPlants, '统一票据 user-plants')
  assert.equal(
    Number(ticketPlants.body?.data?.total),
    Number(sessionPlants.body?.data?.total),
    '统一票据与持久会话的植物总数必须一致'
  )
  assert.deepEqual(plantIds(ticketPlants), sessionIds, '统一票据与持久会话的植物顺序和 ID 必须一致')
  assert.deepEqual(
    ticketPlants.body?.data?.list,
    sessionPlants.body?.data?.list,
    '统一票据与持久会话的植物字段必须完全一致'
  )

  const ticketPlantDetail = await call(`plant-user-http/user-plants?id=${firstPlantId}`, {
    identity: identityTicket
  })
  assert.equal(ticketPlantDetail.status, 401, '统一票据不得扩展为植物详情授权')
  assert.equal(ticketPlantDetail.body?.code, 401)

  // 业务身份边界：有效短票据不能绕过同时存在但已失效的持久会话。
  // 这条真实接口回归专门防止 auth/user 读取顺序回退到“票据优先”。
  const invalidSessionWithTicket = await call('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} },
    identity: identityTicket,
    extraHeaders: { 'x-planting-platform-session': `${SESSION_PREFIX}_invalid` }
  })
  assert.equal(
    invalidSessionWithTicket.status,
    401,
    '无效持久会话与有效短票据并存时必须拒绝，不能绕过会话吊销/过期校验'
  )
  assert.equal(invalidSessionWithTicket.body?.code, 401)

  const invalidSessionWithTicketPlants = await call(
    'plant-user-http/user-plants?page=1&pageSize=50',
    {
      identity: identityTicket,
      extraHeaders: { 'x-planting-platform-session': `${SESSION_PREFIX}_invalid` }
    }
  )
  assert.equal(
    invalidSessionWithTicketPlants.status,
    401,
    'user-plants 也不得让有效短票据绕过无效持久会话'
  )
  assert.equal(invalidSessionWithTicketPlants.body?.code, 401)

  const unauthenticatedUser = await call('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} },
    identity: ''
  })
  assert.equal(unauthenticatedUser.status, 401, '缺少身份的 auth/user 必须拒绝')
  assert.equal(unauthenticatedUser.body?.code, 401)

  const invalidTicketUser = await call('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} },
    identity: 'planting-http-v1.invalid.invalid'
  })
  assert.equal(invalidTicketUser.status, 401, '错误签名的 auth/user 票据必须拒绝')
  assert.equal(invalidTicketUser.body?.code, 401)

  const unauthenticated = await call('plant-user-http/user-plants?page=1&pageSize=50', {
    identity: ''
  })
  assert.equal(unauthenticated.status, 401, '缺少身份的 user-plants 必须拒绝')
  assert.equal(unauthenticated.body?.code, 401, '缺少身份的 user-plants 必须返回业务 401')

  console.log(
    JSON.stringify({
      data_mode: 'unit_real_data',
      environment: 'cloud1_dev',
      endpoints: [
        {
          name: 'auth-user-http/auth/user (platform-session)',
          status: currentUser.status,
          code: currentUser.body?.code,
          elapsed_ms: currentUser.elapsedMs
        },
        {
          name: 'plant-user-http/user-plants (platform-session)',
          status: sessionPlants.status,
          code: sessionPlants.body?.code,
          total: sessionPlants.body?.data?.total,
          elapsed_ms: sessionPlants.elapsedMs
        },
        {
          name: 'plant-user-http/user-plants detail (platform-session)',
          status: sessionPlantDetail.status,
          code: sessionPlantDetail.body?.code,
          elapsed_ms: sessionPlantDetail.elapsedMs
        },
        {
          name: 'auth-user-http/auth/user (identity-ticket)',
          status: ticketUser.status,
          code: ticketUser.body?.code,
          elapsed_ms: ticketUser.elapsedMs
        },
        {
          name: 'plant-user-http/user-plants (identity-ticket)',
          status: ticketPlants.status,
          code: ticketPlants.body?.code,
          total: ticketPlants.body?.data?.total,
          elapsed_ms: ticketPlants.elapsedMs
        },
        {
          name: 'plant-user-http/user-plants detail (identity-ticket)',
          status: ticketPlantDetail.status,
          code: ticketPlantDetail.body?.code
        },
        {
          name: 'auth-user-http/auth/user (invalid session + valid ticket)',
          status: invalidSessionWithTicket.status,
          code: invalidSessionWithTicket.body?.code
        },
        {
          name: 'plant-user-http/user-plants (invalid session + valid ticket)',
          status: invalidSessionWithTicketPlants.status,
          code: invalidSessionWithTicketPlants.body?.code
        },
        {
          name: 'auth-user-http/auth/user (unauthenticated)',
          status: unauthenticatedUser.status,
          code: unauthenticatedUser.body?.code
        },
        {
          name: 'auth-user-http/auth/user (invalid ticket)',
          status: invalidTicketUser.status,
          code: invalidTicketUser.body?.code
        },
        {
          name: 'plant-user-http/user-plants (unauthenticated)',
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
