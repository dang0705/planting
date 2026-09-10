#!/usr/bin/env node

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_real_data; test_kind=real_http_contract。
// 此用例只调用真实 cloud1_dev 公网函数，使用测试专属的持久平台会话；
// 不伪造 OpenID、不替换响应、不直接写库。覆盖一期的 auth/user 与
// user-plants，并对仍保留旧入口的 question/start 做真实会话回归，避免
// 诊断入口的认证断层被误判为性能问题。

const require = createRequire(import.meta.url)
const { SESSION_PREFIX } = require('../../../../../cloudfunctions/layer/utils/platform-session.js')

const DEVELOPMENT_ENV_ID = 'cloud1-2grufevs395a9d5e'
const REQUEST_TIMEOUT_MS = 15_000
const APP_ENV = 'development'
const baseUrl = String(process.env.UNIT_REAL_DATA_BASE_URL || '')
  .trim()
  .replace(/\/+$/u, '')
const platformSession = String(process.env.UNIT_REAL_DATA_PLATFORM_SESSION || '').trim()
const environmentId = String(process.env.CLOUDBASE_ENV_ID || DEVELOPMENT_ENV_ID).trim()
const allowWrites = /^(?:1|true)$/iu.test(String(process.env.UNIT_REAL_DATA_ALLOW_WRITES || '').trim())

function assertEnvironmentReady() {
  assert.equal(
    environmentId,
    DEVELOPMENT_ENV_ID,
    'BLOCKED_ENV: 本用例只允许 cloud1_dev，避免误调用其他环境'
  )
  assert.ok(baseUrl, 'BLOCKED_ENV: 缺少 UNIT_REAL_DATA_BASE_URL，拒绝猜测或回退到旧部署')
  assert.match(baseUrl, /^https:\/\//u, 'BLOCKED_ENV: UNIT_REAL_DATA_BASE_URL 必须是 HTTPS 地址')
  assert.ok(
    platformSession.startsWith(`${SESSION_PREFIX}_`),
    'BLOCKED_ENV: 缺少有效 UNIT_REAL_DATA_PLATFORM_SESSION 测试会话'
  )
  assert.ok(
    allowWrites,
    'BLOCKED_ENV: 真实写后读需要显式设置 UNIT_REAL_DATA_ALLOW_WRITES=1，避免误写非测试账号'
  )
}

async function callRealHttp(path, { method = 'GET', body, identity = 'platform-session' } = {}) {
  const identityHeaders =
    identity === 'platform-session'
      ? {
          Authorization: `Bearer ${platformSession}`,
          'x-planting-platform-session': platformSession
        }
      : {
          Authorization: `Bearer ${identity}`,
          'x-planting-http-identity-ticket': identity
        }
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(`${baseUrl}/${path.replace(/^\/+/, '')}`, {
      method,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'x-app-env': APP_ENV,
        'x-env': APP_ENV,
        ...identityHeaders
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal
    })
    const raw = await response.text()
    let responseBody = null
    try {
      responseBody = raw ? JSON.parse(raw) : null
    } catch {
      throw new Error(`${path} 返回非 JSON 响应，HTTP ${response.status}`)
    }
    return { status: response.status, body: responseBody }
  } finally {
    clearTimeout(timeout)
  }
}

function assertSuccess(response, label) {
  assert.equal(response.status, 200, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, 200, `${label}: business code=${response.body?.code}`)
}

function assertExpectedError(response, { status, code }, label) {
  assert.equal(response.status, status, `${label}: HTTP ${response.status}`)
  assert.equal(response.body?.code, code, `${label}: business code=${response.body?.code}`)
}

function assertQuestionStart(response, label) {
  assertSuccess(response, label)
  const data = response.body?.data
  assert.match(String(data?.diagnosisSessionId || ''), /\S/u, `${label}: 必须返回诊断会话 ID`)
  assert.ok(Array.isArray(data?.questions), `${label}: 必须返回题目数组`)
  assert.ok(data.questions.length > 0, `${label}: 题目数组不得为空`)
  return data
}

async function main() {
  assertEnvironmentReady()

  const currentUser = await callRealHttp('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} }
  })
  assertSuccess(currentUser, '当前用户读取')
  assert.match(String(currentUser.body?.data?._id || ''), /\S/u, '当前用户必须有稳定用户 ID')
  const currentUserId = String(currentUser.body.data._id)
  const identityTicket = String(currentUser.body?.data?.httpIdentityTicket || '').trim()
  assert.ok(identityTicket, '当前用户读取必须签发统一用户短票据')

  const userPlants = await callRealHttp('plant-user-http/user-plants?page=1&pageSize=50')
  assertSuccess(userPlants, '用户植物列表读取')
  assert.ok(Array.isArray(userPlants.body?.data?.list), '用户植物列表必须是数组')
  assert.ok(Number(userPlants.body?.data?.total) > 0, '已存在植物的测试账号不得返回空列表')
  assert.ok(userPlants.body.data.list.length > 0, '已存在植物的测试账号必须返回至少一条植物')
  const sessionPlantIds = userPlants.body.data.list.map(item => String(item?.id || ''))
  assert.ok(sessionPlantIds.every(Boolean), '持久会话列表必须返回稳定植物 ID')
  const firstPlant = userPlants.body.data.list[0]
  const plantDetail = await callRealHttp(
    `plant-user-http/user-plants?id=${encodeURIComponent(String(firstPlant.id))}`
  )
  assertSuccess(plantDetail, '用户植物详情读取')
  assert.equal(
    String(plantDetail.body?.data?.id || ''),
    String(firstPlant.id),
    '详情读取必须返回列表中的同一植物 ID'
  )
  for (const field of ['displayName', 'canonicalName', 'location', 'createdAt']) {
    assert.deepEqual(
      plantDetail.body?.data?.[field] ?? null,
      firstPlant?.[field] ?? null,
      `详情与列表的 ${field} 字段必须一致`
    )
  }

  const ticketUser = await callRealHttp('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'getUserByOpenid', data: {} },
    identity: identityTicket
  })
  assertSuccess(ticketUser, '短票据当前用户读取')
  assert.equal(
    String(ticketUser.body?.data?._id || ''),
    currentUserId,
    '短票据读取的统一用户必须与持久会话一致'
  )

  // 该 action 不执行登录写入，只验证 auth-user-http 的完整路由仍能加载
  // 现有 Shared Layer；缺层时这里会从预期的 403 退化为 500。
  const fullAuthRoute = await callRealHttp('auth-user-http/auth/user', {
    method: 'POST',
    body: { action: 'wechatLogin', data: {} }
  })
  assertExpectedError(
    fullAuthRoute,
    { status: 403, code: 'PHONE_AUTH_REQUIRED' },
    'auth-user-http 完整路由回归'
  )

  const ticketPlants = await callRealHttp('plant-user-http/user-plants?page=1&pageSize=50', {
    identity: identityTicket
  })
  assertSuccess(ticketPlants, '短票据用户植物列表读取')
  assert.ok(Array.isArray(ticketPlants.body?.data?.list), '短票据用户植物列表必须是数组')
  assert.equal(
    Number(ticketPlants.body?.data?.total),
    Number(userPlants.body?.data?.total),
    '短票据与持久会话读取的植物数量必须一致'
  )
  const ticketPlantIds = ticketPlants.body.data.list.map(item => String(item?.id || ''))
  assert.deepEqual(ticketPlantIds, sessionPlantIds, '短票据与持久会话的植物 ID 和排序必须一致')
  assert.deepEqual(
    ticketPlants.body.data.list,
    userPlants.body.data.list,
    '短票据与持久会话的植物字段内容必须完全一致'
  )

  // 真实 API 写后读闭环：创建一个不带图片和提醒的临时目录植物，
  // 通过详情与列表读回业务字段，再经现有 HTTP method override 删除，
  // 最后确认详情和列表都不再返回它。失败时 finally 仍尝试清理，避免
  // 测试账号遗留数据污染后续页面验收。
  const catalogPlantId = [
    firstPlant?.plantIdentityId,
    firstPlant?.sessionPlantId,
    firstPlant?.plantId
  ]
    .map(value => String(value || '').trim())
    .find(Boolean)
  assert.ok(catalogPlantId, '写后读测试需要现有植物提供可复用的目录身份')
  const temporaryNickname = `QA响应优化-${Date.now()}`
  const temporaryNotes = 'unit real data transient roundtrip'
  let createdPlantId = ''
  let deletedTemporaryPlant = false
  let createdPlant = null
  let createdPlantDetail = null
  let createdPlantList = null
  let deleteTemporaryPlant = null
  let deletedPlantDetail = null
  let deletedPlantList = null
  try {
    const createTemporaryPlant = await callRealHttp('plant-user-http/user-plants', {
      method: 'POST',
      body: {
        plantId: firstPlant?.plantId || catalogPlantId,
        plantIdentityId: firstPlant?.plantIdentityId || null,
        sessionPlantId: firstPlant?.sessionPlantId || null,
        sourceType: 'catalog',
        identityResolutionStatus: 'matched',
        nickname: temporaryNickname,
        notes: temporaryNotes
      }
    })
    assertSuccess(createTemporaryPlant, '临时植物创建')
    createdPlant = createTemporaryPlant.body?.data
    createdPlantId = String(createdPlant?.id || '').trim()
    assert.ok(createdPlantId, '临时植物创建必须返回稳定植物 ID')
    assert.equal(createdPlant?.nickname, temporaryNickname, '创建响应必须返回临时植物昵称')
    assert.equal(createdPlant?.notes, temporaryNotes, '创建响应必须返回临时植物备注')

    const temporaryDetailResponse = await callRealHttp(
      `plant-user-http/user-plants?id=${encodeURIComponent(createdPlantId)}`
    )
    assertSuccess(temporaryDetailResponse, '临时植物详情读回')
    createdPlantDetail = temporaryDetailResponse.body?.data
    assert.equal(String(createdPlantDetail?.id || ''), createdPlantId)
    assert.equal(createdPlantDetail?.nickname, temporaryNickname)
    assert.equal(createdPlantDetail?.notes, temporaryNotes)

    const listAfterCreateResponse = await callRealHttp(
      'plant-user-http/user-plants?page=1&pageSize=50'
    )
    assertSuccess(listAfterCreateResponse, '临时植物列表读回')
    createdPlantList = listAfterCreateResponse.body?.data?.list?.find(
      item => String(item?.id || '') === createdPlantId
    )
    assert.ok(createdPlantList, '创建后列表必须包含临时植物')
    assert.equal(createdPlantList.nickname, temporaryNickname)
    assert.equal(createdPlantList.notes, temporaryNotes)

    deleteTemporaryPlant = await callRealHttp('plant-user-http/user-plants?_method=DELETE', {
      method: 'POST',
      body: { id: createdPlantId }
    })
    assertSuccess(deleteTemporaryPlant, '临时植物删除')
    deletedTemporaryPlant = true

    const deletedDetailResponse = await callRealHttp(
      `plant-user-http/user-plants?id=${encodeURIComponent(createdPlantId)}`
    )
    assertExpectedError(
      deletedDetailResponse,
      { status: 404, code: 404 },
      '删除后详情必须不可读'
    )
    deletedPlantDetail = deletedDetailResponse.body?.data
    assert.equal(deletedPlantDetail, null, '删除后详情不得返回数据')

    const listAfterDeleteResponse = await callRealHttp(
      'plant-user-http/user-plants?page=1&pageSize=50'
    )
    assertSuccess(listAfterDeleteResponse, '删除后植物列表读回')
    deletedPlantList = listAfterDeleteResponse.body?.data?.list?.find(
      item => String(item?.id || '') === createdPlantId
    )
    assert.equal(deletedPlantList, undefined, '删除后列表不得返回临时植物')
  } finally {
    if (createdPlantId && !deletedTemporaryPlant) {
      const cleanupResponse = await callRealHttp('plant-user-http/user-plants?_method=DELETE', {
        method: 'POST',
        body: { id: createdPlantId }
      }).catch(error => ({ error }))
      if (cleanupResponse?.error) {
        throw new Error(`临时植物清理失败：${cleanupResponse.error.message}`)
      }
      assertSuccess(cleanupResponse, '临时植物兜底清理')
    }
  }

  const diagnosisPayload = {
    symptomClassKey: 'yellowing_mode',
    symptomKey: 'uniform_yellowing',
    diagnosisProfile: 'full',
    entrySource: 'diagnose_tab',
    clientContext: {
      source: 'unit_real_data',
      platform: 'wechat-mini-program'
    }
  }
  const dedicatedQuestionStart = await callRealHttp(
    'diagnosis-question-start-http/diagnosis/question/start',
    { method: 'POST', body: diagnosisPayload }
  )
  const dedicatedQuestionData = assertQuestionStart(
    dedicatedQuestionStart,
    '专用 question/start 真实会话回归'
  )

  const legacyQuestionStart = await callRealHttp('diagnose-http/diagnosis/question/start', {
    method: 'POST',
    body: diagnosisPayload
  })
  const legacyQuestionData = assertQuestionStart(
    legacyQuestionStart,
    '旧 diagnose question/start 真实会话回归'
  )

  console.log(
    JSON.stringify({
      data_mode: 'unit_real_data',
      environment: 'cloud1_dev',
      endpoints: [
        {
          name: 'auth-user-http/auth/user',
          status: currentUser.status,
          code: currentUser.body?.code
        },
        {
          name: 'plant-user-http/user-plants',
          status: userPlants.status,
          code: userPlants.body?.code
        },
        {
          name: 'plant-user-http/user-plants (detail)',
          status: plantDetail.status,
          code: plantDetail.body?.code,
          plant_id: plantDetail.body?.data?.id
        },
        {
          name: 'auth-user-http/auth/user (identity ticket)',
          status: ticketUser.status,
          code: ticketUser.body?.code
        },
        {
          name: 'auth-user-http/auth/user (full route)',
          status: fullAuthRoute.status,
          code: fullAuthRoute.body?.code
        },
        {
          name: 'plant-user-http/user-plants (identity ticket)',
          status: ticketPlants.status,
          code: ticketPlants.body?.code
        },
        {
          name: 'plant-user-http/user-plants (temporary write-read-delete)',
          status: deleteTemporaryPlant?.status,
          code: deleteTemporaryPlant?.body?.code,
          created_id: createdPlantId,
          detail_readback: Boolean(createdPlantDetail),
          list_readback: Boolean(createdPlantList),
          deleted_detail: deletedPlantDetail === null,
          deleted_list: deletedPlantList === undefined
        },
        {
          name: 'diagnosis-question-start-http/diagnosis/question/start',
          status: dedicatedQuestionStart.status,
          code: dedicatedQuestionStart.body?.code,
          question_count: dedicatedQuestionData.questions.length
        },
        {
          name: 'diagnose-http/diagnosis/question/start',
          status: legacyQuestionStart.status,
          code: legacyQuestionStart.body?.code,
          question_count: legacyQuestionData.questions.length
        }
      ]
    })
  )
}

main().catch(error => {
  console.error(`[unit_real_data] ${error.stack || error.message}`)
  process.exitCode = 1
})
