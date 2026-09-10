'use strict'

import { resolveQaBackendTarget } from '../../../../scripts/qa/qa-backend-target.mjs'

const QA_LAN_PORT = 3011
const QA_FUNCTION_PORT_BASE = 9100
const REQUEST_TIMEOUT_MS = 15000
const CLEANUP_MAX_ATTEMPTS = 2
const CLEANUP_RETRY_DELAY_MS = 500
const CLEANUP_VERIFY_ATTEMPTS = 1
const CLEANUP_VERIFY_DELAY_MS = 500
const CLEANUP_DELETE_TIMEOUT_MS = 9000
const CLEANUP_VERIFY_TIMEOUT_MS = 5000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function liveApiBaseUrl() {
  return resolveQaBackendTarget(process.env, {
    port: QA_LAN_PORT,
    functionPortBase: QA_FUNCTION_PORT_BASE
  }).baseUrl
}

function responseSucceeded(response) {
  return Number(response?.statusCode) === 200 && Number(response?.responseCode) === 200
}

/**
 * Test-owned setup/cleanup still goes through the real mini-program runtime
 * and the configured real backend (online HTTP cloud function or LAN gateway).
 * It never writes the database directly or replaces a page request response.
 */
export async function authenticatedLiveRequest(
  mp,
  { method = 'GET', path, body = null, methodOverride = '', timeoutMs = REQUEST_TIMEOUT_MS } = {}
) {
  const slot = `__qaFertilizationFixture_${process.pid}_${Date.now()}`
  const onlineMode =
    resolveQaBackendTarget(process.env, {
      port: QA_LAN_PORT,
      functionPortBase: QA_FUNCTION_PORT_BASE
    }).mode === 'online'
  const apiBaseUrl = liveApiBaseUrl()
  const url = `${apiBaseUrl}/${String(path || '').replace(/^\/+/, '')}`
  const transportMethod = methodOverride ? 'POST' : method
  const deadline = Date.now() + Math.max(1000, Number(timeoutMs) || REQUEST_TIMEOUT_MS)
  try {
    await mp.evaluate(
      function startRequest(
        requestSlot,
        requestUrl,
        requestPath,
        requestMethod,
        requestBody,
        requestOverride,
        useOnline
      ) {
        globalThis[requestSlot] = { state: 'pending' }
        const parseTarget = rawPath => {
          const raw = String(rawPath || '').replace(new RegExp('^/+', 'u'), '')
          const segments = raw.split('/')
          const name = segments.shift() || ''
          if (!name) {
            return null
          }
          const routePath = `/${segments.join('/')}`.replace(new RegExp('/$', 'u'), '') || '/'
          return { name, path: routePath }
        }
        const finish = value => {
          globalThis[requestSlot] = {
            state: 'completed',
            statusCode: value?.statusCode ?? null,
            responseCode: value?.responseCode ?? null,
            data: value?.data ?? null,
            error: value?.error ? String(value.error) : null
          }
        }
        const request = (openid, identityTicket) => {
          const onlineTarget = useOnline ? parseTarget(requestPath) : null
          const options = {
            url: requestUrl,
            method: requestMethod,
            header: {
              'content-type': 'application/json',
              'x-wx-openid': openid,
              'x-openid': openid,
              'x-app-env': 'development',
              'x-env': 'development'
            },
            success: response => {
              const payload = response?.data || null
              finish({
                statusCode: response?.statusCode,
                responseCode: payload?.code,
                data: payload
              })
            },
            fail: error => finish({ error: error?.errMsg || String(error) })
          }
          if (requestOverride) {
            options.header['x-http-method-override'] = requestOverride
          }
          if (requestMethod !== 'GET' && requestMethod !== 'HEAD') {
            options.data = requestBody || {}
          }
          try {
            if (onlineTarget && wx.cloud && typeof wx.cloud.callHTTPFunction === 'function') {
              const header = {
                ...(options.header || {}),
                ...(identityTicket
                  ? {
                      Authorization: 'Bearer ' + identityTicket,
                      'x-planting-http-identity-ticket': identityTicket
                    }
                  : {})
              }
              wx.cloud.callHTTPFunction({
                name: onlineTarget.name,
                path: onlineTarget.path,
                method: requestMethod,
                header,
                ...(options.data !== undefined ? { data: options.data } : {}),
                success: response => {
                  const payload = response?.data || null
                  finish({
                    statusCode: response?.statusCode,
                    responseCode: payload?.code,
                    data: payload
                  })
                },
                fail: error => finish({ error: error?.errMsg || String(error) })
              })
              return
            }
            wx.request(options)
          } catch (error) {
            finish({ error: error?.message || String(error) })
          }
        }
        try {
          wx.cloud.callFunction({
            name: 'wechat-identity',
            data: {},
            success: result => {
              const openid = String(result?.result?.openid || '')
              if (!openid) {
                finish({ error: 'wechat identity unavailable' })
                return
              }
              request(openid, result?.result?.httpIdentityTicket || '')
            },
            fail: error => finish({ error: error?.errMsg || String(error) })
          })
        } catch (error) {
          finish({ error: error?.message || String(error) })
        }
        return { started: true }
      },
      slot,
      url,
      path,
      transportMethod,
      body,
      methodOverride,
      onlineMode
    )
    while (Date.now() < deadline) {
      const value = await mp.evaluate(requestSlot => {
        const current = globalThis[requestSlot]
        return current && typeof current === 'object' ? { ...current } : null
      }, slot)
      if (value?.state === 'completed') {
        return value
      }
      await sleep(200)
    }
    return { state: 'timeout', error: 'live wx.request timeout' }
  } finally {
    await mp
      .evaluate(requestSlot => {
        delete globalThis[requestSlot]
        return true
      }, slot)
      .catch(() => {})
  }
}

export async function createTemporaryFertilizationPlant(mp, { nickname = 'QA施肥临时植物' } = {}) {
  const listed = await authenticatedLiveRequest(mp, {
    path: 'plant-user-http/user-plants?page=1&pageSize=50'
  })
  const source = listed?.data?.data?.list?.find(item => item?.plantId || item?.sessionPlantId)
  if (!responseSucceeded(listed) || !source) {
    throw new Error('无法从真实开发账户找到临时施肥植物的属级来源')
  }
  const uniqueNickname = `${nickname}-${Date.now()}`
  const created = await authenticatedLiveRequest(mp, {
    method: 'POST',
    path: 'plant-user-http/user-plants',
    body: {
      plantId: source.plantId || source.sessionPlantId || source.plantIdentityId,
      plantIdentityId: source.plantIdentityId || null,
      sessionPlantId: source.sessionPlantId || null,
      nickname: uniqueNickname,
      sourceType: 'catalog',
      identityResolutionStatus: 'matched',
      careLocation: source.careLocation || null,
      notes: 'formal automator fertilization fixture'
    }
  })
  if (!responseSucceeded(created)) {
    throw new Error('真实临时施肥植物创建失败')
  }

  const deadline = Date.now() + REQUEST_TIMEOUT_MS
  while (Date.now() < deadline) {
    const refreshed = await authenticatedLiveRequest(mp, {
      path: 'plant-user-http/user-plants?page=1&pageSize=50'
    })
    const createdPlant = refreshed?.data?.data?.list?.find(
      item => String(item?.nickname || '') === uniqueNickname
    )
    const plantId = Number(createdPlant?.id || 0)
    if (responseSucceeded(refreshed) && plantId) {
      return plantId
    }
    await sleep(300)
  }

  throw new Error('真实临时施肥植物创建后无法通过真实列表回读 id')
}

export async function cleanupTemporaryFertilizationPlant(mp, plantId) {
  let lastDeleted = null
  let lastListed = null
  for (let attempt = 1; attempt <= CLEANUP_MAX_ATTEMPTS; attempt += 1) {
    // DELETE is intentionally retried only within this test-owned cleanup
    // boundary. A transient CloudBase/MySQL connection timeout must not leave
    // a QA plant behind, while a persistent non-2xx response remains visible.
    lastDeleted = await authenticatedLiveRequest(mp, {
      method: 'DELETE',
      methodOverride: 'DELETE',
      path: 'plant-user-http/user-plants',
      body: { id: plantId },
      timeoutMs: CLEANUP_DELETE_TIMEOUT_MS
    })

    for (let verifyAttempt = 1; verifyAttempt <= CLEANUP_VERIFY_ATTEMPTS; verifyAttempt += 1) {
      // wx.cloud.callHTTPFunction routes a native HTTP 404 through its fail
      // callback, so an id-specific GET cannot be used as a stable assertion
      // here. The authenticated list response stays 200 and is authoritative
      // for the parent-row absence check.
      lastListed = await authenticatedLiveRequest(mp, {
        path: 'plant-user-http/user-plants?page=1&pageSize=50',
        timeoutMs: CLEANUP_VERIFY_TIMEOUT_MS
      })
      const listedAbsent =
        responseSucceeded(lastListed) &&
        !lastListed.data?.data?.list?.some(item => Number(item?.id) === Number(plantId))
      const deleteAccepted =
        responseSucceeded(lastDeleted) ||
        Number(lastDeleted?.statusCode) === 404 ||
        Number(lastDeleted?.responseCode) === 404
      // A DELETE response can time out after the transaction committed. A
      // successful list without the QA-owned id is conclusive evidence that
      // the parent row is gone.
      if (listedAbsent && (deleteAccepted || !lastDeleted?.statusCode)) {
        return { deleted: true, absent: true, attempts: attempt, verifyAttempts: verifyAttempt }
      }
      if (verifyAttempt < CLEANUP_VERIFY_ATTEMPTS) {
        await sleep(CLEANUP_VERIFY_DELAY_MS)
      }
    }

    if (attempt < CLEANUP_MAX_ATTEMPTS) {
      await sleep(CLEANUP_RETRY_DELAY_MS)
    }
  }

  throw new Error(
    `临时施肥植物清理失败：id=${plantId}；deleteStatus=${String(
      lastDeleted?.statusCode ?? 'unknown'
    )}/${String(lastDeleted?.responseCode ?? 'unknown')}；listStatus=${String(
      lastListed?.statusCode ?? 'unknown'
    )}/${String(lastListed?.responseCode ?? 'unknown')}`
  )
}
