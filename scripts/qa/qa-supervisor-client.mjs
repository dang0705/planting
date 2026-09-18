#!/usr/bin/env node

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import automator from 'miniprogram-automator'

import { recoverVerifiedTargetDevTools } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-runtime-recovery.mjs'
import {
  ownedRuntimeEvidence,
  localRuntimeEvidence,
  localRuntimeOwned
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import {
  QA_RUNTIME_CONTROL_PORT,
  QA_RUNTIME_PROFILE_HOME,
  QA_RUNTIME_DEVTOOLS_RUNTIME_KIND,
  QA_RUNTIME_ROOT,
  QA_RUNTIME_SERVICE_PORT,
  QA_RUNTIME_WS_PORT,
  deriveQaRuntime,
  readQaRuntimeManifest,
  runtimeManifestIsReady,
  processStartIdentity
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'
import {
  QA_RUNTIME_AUTH_PROFILE_ROOT,
  QA_RUNTIME_PROFILE_PRODUCT_HASH,
  processAlive,
  processTable
} from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-qa-support.mjs'
import {
  markQaAuthServerFailure,
  readQaAuthManifest,
  recordQaAuthServerValidation,
  syncQaAuthFromDailyReadOnly
} from './qa-auth-coordinator.mjs'
import { currentShared, requestUnix } from './qa-auth-broker-core.mjs'
import { probeWxRequest } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight-runtime.mjs'
import { qaBackendTargetMatches, resolveQaBackendTarget } from './qa-backend-target.mjs'

const STATE_PATH = path.join(QA_RUNTIME_ROOT, 'supervisor', 'state.json')
const LEASE_PATH = path.join(QA_RUNTIME_ROOT, 'supervisor', 'lease.json')
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SUPERVISOR_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa', 'automator-supervisor.mjs')
const RUNTIME_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa', 'automator-runtime.mjs')
const APP_AUTH_PROOF_PATH = path.join(QA_RUNTIME_ROOT, 'supervisor', 'app-auth-proof.json')
// 新启动的官方 DevTools 可能先接受 WebSocket、后挂接 appservice；3 秒会把
// 健康但尚未完成挂接的首页误判为登录失败。与正式预检保持相同的有界上限。
const APP_AUTH_PAGE_PROBE_TIMEOUT_MS = 15_000

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function profilePath() {
  return path.join(QA_RUNTIME_AUTH_PROFILE_ROOT, QA_RUNTIME_PROFILE_PRODUCT_HASH)
}

function supervisorCommand(pid) {
  return processTable().find(item => Number(item.pid) === Number(pid))?.command || ''
}

function blocked(code, message, details = {}) {
  const error = new Error(message || code)
  error.code = code
  error.details = details
  return error
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isColdPerformanceLane() {
  return String(process.env.QA_PERFORMANCE_COLD_LANE || '').trim() === '1'
}

function readAppAuthProof() {
  try {
    return JSON.parse(fs.readFileSync(APP_AUTH_PROOF_PATH, 'utf8'))
  } catch {
    return null
  }
}

export function hasQaAppAuthEnrollment({ identityHash, profile } = {}) {
  const proof = readAppAuthProof()
  return Boolean(
    proof?.schema_version === 2 &&
    proof?.used_real_home_entry === true &&
    proof?.identity_hash === identityHash &&
    proof?.devtools_identity_hash === identityHash &&
    /^[a-f0-9]{64}$/u.test(String(proof?.app_runtime_identity_hash || '')) &&
    proof?.identity_verification?.identity_hash === proof?.app_runtime_identity_hash &&
    path.resolve(String(proof?.profile_realpath || '')) === path.resolve(String(profile || ''))
  )
}

function writeAppAuthProof({
  session,
  pagePath,
  entryEvidence = 'interactive_home_login_control',
  identityVerification = null
}) {
  fs.mkdirSync(path.dirname(APP_AUTH_PROOF_PATH), { recursive: true, mode: 0o700 })
  const value = {
    schema_version: 2,
    used_real_home_entry: true,
    identity_hash: session.identity_hash || null,
    devtools_identity_hash: session.identity_hash || null,
    app_runtime_identity_hash: identityVerification?.identity_hash || null,
    profile_realpath: path.resolve(String(session.profile || '')),
    page_path: pagePath || 'pages/index/index',
    entry_evidence: entryEvidence,
    identity_verification: identityVerification
      ? {
          method: identityVerification.method,
          identity_hash: identityVerification.identity_hash,
          request_status_code: identityVerification.request_status_code,
          response_code: identityVerification.response_code
        }
      : null,
    verified_at: new Date().toISOString(),
    verified_by_pid: process.pid
  }
  const temporary = `${APP_AUTH_PROOF_PATH}.${process.pid}.${Date.now()}.tmp`
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 })
  fs.renameSync(temporary, APP_AUTH_PROOF_PATH)
  return value
}

async function inspectPersistedAppSession(miniProgram) {
  const summarize = value => {
    let session = value
    if (typeof session === 'string') {
      try {
        session = JSON.parse(session)
      } catch {
        session = null
      }
    }
    return {
      present: Boolean(session && typeof session === 'object'),
      access_token_present: Boolean(String(session?.accessToken || '').trim())
    }
  }

  // MiniProgram.evaluate() runs in the app-function context and cannot see
  // the simulator's native storage on current DevTools versions. The native
  // wx bridge is the authoritative read for this QA gate; keep evaluate as a
  // compatibility fallback for older Automator implementations.
  if (typeof miniProgram?.callWxMethod === 'function') {
    let timer
    try {
      const result = await Promise.race([
        Promise.resolve().then(() =>
          miniProgram.callWxMethod('getStorageSync', 'planting-platform-session')
        ),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('native storage read timeout')), 4_000)
        })
      ])
      return { ...summarize(result), source: 'native_wx_bridge' }
    } catch {
      // Fall through to the compatibility path below.
    } finally {
      clearTimeout(timer)
    }
  }
  const fallback = await miniProgram.evaluate(function () {
    var session = null
    try {
      if (typeof uni !== 'undefined' && uni && typeof uni.getStorageSync === 'function') {
        session = uni.getStorageSync('planting-platform-session')
      }
    } catch {
      session = null
    }
    if (!session && typeof wx !== 'undefined' && wx && typeof wx.getStorageSync === 'function') {
      try {
        session = wx.getStorageSync('planting-platform-session')
      } catch {
        session = null
      }
    }
    return {
      present: Boolean(session && typeof session === 'object'),
      access_token_present: Boolean(String(session?.accessToken || '').trim())
    }
  })
  return { ...fallback, source: 'app_function_compatibility' }
}

async function probeBusinessAuth({ miniProgram, url, timeoutMs = 10_000 } = {}) {
  if (!url) {
    return { passed: false, code: 'qa_business_auth_probe_url_missing' }
  }
  const slot = `__qaBusinessAuth_${process.pid}_${Date.now()}`
  const deadline = Date.now() + Math.min(10_000, timeoutMs)
  try {
    await miniProgram.evaluate(
      function (probeSlot, requestUrl) {
        globalThis[probeSlot] = { state: 'pending' }
        let appAccessToken = ''
        let persistedSession = null
        try {
          persistedSession =
            typeof uni !== 'undefined' && uni && typeof uni.getStorageSync === 'function'
              ? uni.getStorageSync('planting-platform-session')
              : null
        } catch {
          persistedSession = null
        }
        if (
          !persistedSession &&
          typeof wx !== 'undefined' &&
          wx &&
          typeof wx.getStorageSync === 'function'
        ) {
          try {
            persistedSession = wx.getStorageSync('planting-platform-session')
          } catch {
            persistedSession = null
          }
        }
        appAccessToken =
          persistedSession && typeof persistedSession.accessToken === 'string'
            ? String(persistedSession.accessToken).trim()
            : ''
        if (!appAccessToken) {
          globalThis[probeSlot] = {
            state: 'completed',
            ok: false,
            error: '小程序业务登录会话缺失'
          }
          return { started: false }
        }
        const finish = function (value) {
          globalThis[probeSlot] = {
            state: 'completed',
            ok: value && value.ok === true,
            statusCode: value && value.statusCode !== undefined ? value.statusCode : null,
            responseCode: value && value.responseCode !== undefined ? value.responseCode : null,
            identityResolved: value && value.identityResolved === true,
            identityTicketResolved: value && value.identityTicketResolved === true,
            nativeHttpFunction: value && value.nativeHttpFunction === true,
            identityOpenid: value && value.identityOpenid ? String(value.identityOpenid) : '',
            error: value && value.error ? value.error : null
          }
        }
        const handleResponse = function (response, identityTicketResolved, nativeHttpFunction) {
          const data = response && response.data ? response.data : {}
          const statusCode =
            response && response.statusCode !== undefined ? response.statusCode : null
          const responseCode = data && data.code !== undefined ? data.code : null
          const user = data && data.data && typeof data.data === 'object' ? data.data : null
          const identityOpenid = user
            ? String(user.wechat_openid || user._openid || user.principal_openid || '')
            : ''
          const ok = Number(statusCode) === 200 && Number(responseCode) === 200
          finish({
            ok,
            statusCode,
            responseCode,
            identityResolved: true,
            identityTicketResolved: identityTicketResolved === true,
            nativeHttpFunction: nativeHttpFunction === true,
            identityOpenid,
            error: ok ? null : data && data.message ? String(data.message) : null
          })
        }
        try {
          wx.request({
            url: requestUrl,
            method: 'POST',
            header: {
              'x-planting-platform-session': appAccessToken,
              'x-app-env': 'development',
              'x-env': 'development'
            },
            data: {
              action: 'getUserByOpenid',
              data: {}
            },
            success: function (response) {
              handleResponse(response, false, false)
            },
            fail: function (error) {
              finish({
                ok: false,
                identityResolved: true,
                nativeHttpFunction: false,
                error: error && error.errMsg ? String(error.errMsg) : String(error)
              })
            }
          })
        } catch (error) {
          finish({
            ok: false,
            identityResolved: true,
            error: error && error.message ? String(error.message) : String(error)
          })
        }
        return { started: true }
      },
      slot,
      url
    )
    while (Date.now() < deadline) {
      const observation = await miniProgram.evaluate(function (probeSlot) {
        const value = globalThis[probeSlot]
        if (!value || typeof value !== 'object') {
          return null
        }
        return {
          state: value.state,
          ok: value.ok === true,
          status_code: value.statusCode,
          response_code: value.responseCode,
          identity_resolved: value.identityResolved === true,
          identity_ticket_resolved: value.identityTicketResolved === true,
          native_http_function: value.nativeHttpFunction === true,
          identity_openid: value.identityOpenid ? String(value.identityOpenid) : '',
          error: value.error || null
        }
      }, slot)
      if (observation && observation.state === 'completed') {
        return {
          passed: observation.ok === true,
          code:
            observation.ok === true ? 'qa_business_auth_probe_passed' : 'qa_business_user_missing',
          status_code: observation.status_code ?? null,
          response_code: observation.response_code ?? null,
          identity_resolved: observation.identity_resolved === true,
          identity_ticket_resolved: observation.identity_ticket_resolved === true,
          native_http_function: observation.native_http_function === true,
          identity_openid: observation.identity_openid || '',
          error: observation.error || null
        }
      }
      await wait(200)
    }
    return { passed: false, code: 'qa_business_auth_probe_timeout' }
  } finally {
    try {
      await miniProgram.evaluate(function (probeSlot) {
        delete globalThis[probeSlot]
        return true
      }, slot)
    } catch {
      // The probe slot is disposable and must not affect the owning session.
    }
  }
}

async function verifyPersistedAuthenticatedHome({
  miniProgram,
  session,
  timeoutMs,
  expectedRuntimeIdentityHash = '',
  businessAuthUrl = ''
}) {
  const requestUrl = session?.preflight_options?.wxRequestUrl
  if (!requestUrl) {
    return { passed: false, code: 'qa_authenticated_probe_url_missing' }
  }
  let request
  try {
    request = await probeWxRequest({
      miniProgram,
      url: requestUrl,
      requireAuthenticatedIdentity: true,
      requirePersistedAppSession: true,
      timeoutMs: Math.min(10_000, timeoutMs)
    })
  } catch (error) {
    return {
      passed: false,
      code: 'qa_authenticated_probe_failed',
      error: error?.message || String(error)
    }
  }
  if (request?.passed !== true || request.cleanup?.passed !== true) {
    return {
      passed: false,
      code: 'qa_authenticated_probe_rejected',
      status_code: request?.statusCode ?? null,
      response_code: request?.response_code ?? null,
      identity_resolved: request?.identity_resolved === true,
      error: request?.error || null
    }
  }
  const deadline = Date.now() + Math.min(10_000, timeoutMs)
  try {
    // 现有手机号会话已经是三端统一的真实业务身份。用 HTTPS auth
    // 响应中的服务端 wechat_openid 完成身份核对，不再调用会触发旧
    // DevTools access_token 的 wx.cloud.callFunction。
    let businessAuth = null
    while (Date.now() < deadline) {
      businessAuth = await probeBusinessAuth({
        miniProgram,
        url: businessAuthUrl,
        timeoutMs: Math.min(4_000, deadline - Date.now())
      })
      if (businessAuth.passed === true) {
        break
      }
      await wait(500)
    }
    if (businessAuth?.passed !== true) {
      return {
        passed: false,
        code: businessAuth?.code || 'qa_business_user_missing',
        request_status_code: request.statusCode ?? null,
        response_code: request.response_code ?? null,
        business_auth: businessAuth
      }
    }
    const identityOpenid = String(businessAuth.identity_openid || '').trim()
    if (!identityOpenid) {
      return {
        passed: false,
        code: 'qa_authenticated_identity_unavailable',
        error: 'auth-user-http 未返回服务端微信身份'
      }
    }
    const identityHash = crypto.createHash('sha256').update(identityOpenid).digest('hex')
    if (expectedRuntimeIdentityHash && identityHash !== expectedRuntimeIdentityHash) {
      return {
        passed: false,
        code: 'qa_authenticated_identity_mismatch',
        expected_identity_hash: expectedRuntimeIdentityHash,
        observed_identity_hash: identityHash
      }
    }
    recordQaAuthServerValidation({
      status: 'passed',
      authGeneration: session.auth_generation,
      identityHash: session.identity_hash,
      runtimeIdentityHash: identityHash,
      qaPid: session.main_devtools_pid,
      qaProcessStartIdentity: session.main_devtools_pid
        ? processStartIdentity(Number(session.main_devtools_pid))
        : null,
      qaProfile: session.profile
    })
    return {
      passed: true,
      method: 'real_home_persisted_auth_and_https_request',
      identity_hash: identityHash,
      request_status_code: request.statusCode ?? null,
      response_code: request.response_code ?? null,
      business_auth_status_code: businessAuth.status_code ?? null,
      business_auth_response_code: businessAuth.response_code ?? null
    }
  } finally {
    try {
      // The HTTPS probes clean their own disposable runtime slots.
      await miniProgram.currentPage?.()
    } catch {
      // The runtime remains owned by the supervisor; cleanup is best effort.
    }
  }
}

export async function ensureQaAppLoggedIn({
  session,
  timeoutMs = 30_000,
  requireRealHomeEntry = false,
  allowManualEnrollment = false,
  skipBusinessProbe = false
} = {}) {
  const boundedAutomatorCall = (operation, timeoutMs, label) =>
    new Promise((resolve, reject) => {
      let settled = false
      const timer = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        reject(new Error(`${label}: timed out after ${timeoutMs}ms`))
      }, timeoutMs)
      Promise.resolve()
        .then(operation)
        .then(
          value => {
            if (settled) {
              return
            }
            settled = true
            clearTimeout(timer)
            resolve(value)
          },
          error => {
            if (settled) {
              return
            }
            settled = true
            clearTimeout(timer)
            reject(error)
          }
        )
    })
  const automatorRetry = async (operation, label, attempts = 3) => {
    let lastError = null
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await operation()
      } catch (error) {
        lastError = error
        if (attempt < attempts) {
          await wait(350)
        }
      }
    }
    const error = new Error(`${label}: ${lastError?.message || lastError || 'unknown automator error'}`)
    error.cause = lastError
    throw error
  }
  const currentPage = async () => {
    let currentPageError = null
    try {
      return await boundedAutomatorCall(
        () => mp.currentPage(),
        APP_AUTH_PAGE_PROBE_TIMEOUT_MS,
        'currentPage'
      )
    } catch (error) {
      currentPageError = error
    }
    try {
      const stack = await boundedAutomatorCall(
        () => mp.pageStack(),
        APP_AUTH_PAGE_PROBE_TIMEOUT_MS,
        'pageStack'
      )
      const page = Array.isArray(stack) ? stack[stack.length - 1] : null
      if (page) {
        return page
      }
    } catch (error) {
      currentPageError ||= error
    }
    throw currentPageError || new Error('currentPage: no page available')
  }
  const findElement = (page, selector) =>
    automatorRetry(() => page?.$(selector), `find ${selector}`)
  const wsEndpoint = session?.preflight_options?.wsEndpoint || `ws://127.0.0.1:${session?.wsPort}`
  let mp = null
  try {
    mp = await automator.connect({ wsEndpoint })
    let page = await currentPage()
    if (page?.path !== 'pages/index/index' && typeof mp.reLaunch === 'function') {
      await mp.reLaunch('/pages/index/index')
      await wait(500)
      page = await currentPage()
    }
    let sawRealHomeEntryControl = false
    let persistedHomeAuth = null
    const existingProof = readAppAuthProof()
    const initialQuickLogin = await findElement(page, '#index-quick-login-button')
    if (initialQuickLogin) {
      sawRealHomeEntryControl = true
      // A tap can coincide with the app-service route/auth transition. The
      // response may time out even though the tap was accepted; do not tap a
      // second time, just let the authenticated-home polling observe the
      // resulting state.
      try {
        await initialQuickLogin.tap()
      } catch {
        // The post-tap polling below is the recovery path for an uncertain RPC.
      }
    } else if (requireRealHomeEntry && allowManualEnrollment) {
      // Enrollment is the only mode allowed to wait for a human action. It
      // never writes storage or fabricates a logged-in state; the proof is
      // written only after the real login control disappears and the home
      // page is observed again.
      sawRealHomeEntryControl = Boolean(await page?.$('#index-phone-login-button'))
    }
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
      page = await currentPage()
      const quick = await findElement(page, '#index-quick-login-button')
      const phone = await findElement(page, '#index-phone-login-button')
      const home = await findElement(page, '#index-page')
      sawRealHomeEntryControl ||= Boolean(quick || phone)
      if (home && !quick && !phone) {
        if (skipBusinessProbe === true) {
          const persistedSession = await inspectPersistedAppSession(mp)
          if (!persistedSession?.access_token_present) {
            const enrollment = hasQaAppAuthEnrollment({
              identityHash: session.identity_hash,
              profile: session.profile
            })
            const currentPlantList = await findElement(page, '#index-plant-list')
            if (!enrollment || !currentPlantList) {
              throw blocked(
                'qa_performance_cold_lane_session_missing',
                '性能冷启动专用 QA 会话缺少真实业务登录态，不能跳过业务接口预热',
                {
                  page_path: page.path,
                  persisted_session: persistedSession,
                  enrollment_verified: enrollment,
                  authenticated_plant_list_visible: Boolean(currentPlantList)
                }
              )
            }
          }
          if (!hasQaAppAuthEnrollment({ identityHash: session.identity_hash, profile: session.profile })) {
            throw blocked(
              'qa_performance_cold_lane_enrollment_missing',
              '性能冷启动专用 QA 会话必须先完成一次真实首页登录与服务端身份校验',
              { page_path: page.path }
            )
          }
          return {
            status: 'ready',
            code: 'qa_app_login_present_without_business_probe',
            page_path: page.path,
            used_real_home_entry: false,
            identity_hash: session.identity_hash || null,
            runtime_identity_hash: existingProof?.app_runtime_identity_hash || null,
            enrollment_verified: true,
            business_probe: 'skipped_for_cold_performance_lane',
            persisted_session: persistedSession
          }
        }
        persistedHomeAuth = await verifyPersistedAuthenticatedHome({
          miniProgram: mp,
          session,
          timeoutMs: Math.min(timeoutMs, 15_000),
          expectedRuntimeIdentityHash: existingProof?.app_runtime_identity_hash || '',
          businessAuthUrl: session?.preflight_options?.businessAuthUrl || ''
        })
        if (persistedHomeAuth.passed !== true) {
          throw blocked(
            requireRealHomeEntry && !sawRealHomeEntryControl
              ? 'qa_app_real_home_entry_required'
              : 'qa_app_authenticated_runtime_required',
            requireRealHomeEntry && !sawRealHomeEntryControl
              ? '首次 QA 业务身份建立必须通过真实首页入口完成，且必须证明真实运行时身份'
              : 'QA 小程序首页未能证明已登录的真实运行时身份',
            { page_path: page.path, persisted_home_auth: persistedHomeAuth }
          )
        }
        const enrollment =
          sawRealHomeEntryControl || persistedHomeAuth?.passed === true
            ? writeAppAuthProof({
                session,
                pagePath: page.path,
                entryEvidence: sawRealHomeEntryControl
                  ? 'interactive_home_login_control'
                  : 'persisted_authenticated_home',
                identityVerification: persistedHomeAuth?.passed === true ? persistedHomeAuth : null
              })
            : readAppAuthProof()
        return {
          status: 'ready',
          code:
            sawRealHomeEntryControl || persistedHomeAuth?.passed === true
              ? 'qa_app_login_completed'
              : 'qa_app_login_present',
          page_path: page.path,
          used_real_home_entry: sawRealHomeEntryControl || persistedHomeAuth?.passed === true,
          identity_hash: session.identity_hash || null,
          runtime_identity_hash: persistedHomeAuth?.identity_hash || null,
          enrollment_verified: Boolean(
            enrollment?.used_real_home_entry === true &&
            enrollment?.identity_hash === session.identity_hash
          )
        }
      }
      await wait(500)
    }
    throw blocked('qa_app_login_required', '小程序业务登录未在真实首页入口完成', {
      page_path: page?.path || null,
      quick_login_present: Boolean(await findElement(page, '#index-quick-login-button')),
      phone_login_present: Boolean(await findElement(page, '#index-phone-login-button'))
    })
  } catch (error) {
    const details = error?.details || {}
    const probe = details.persisted_home_auth || details
    if (
      /invalid[_ ]?token|invalid credential|not latest|qa_authenticated_probe_rejected/iu.test(
        `${error?.message || ''} ${probe?.error || ''}`
      ) ||
      (Number.isFinite(Number(probe?.response_code)) && Number(probe.response_code) !== 200)
    ) {
      markQaAuthServerFailure({
        authGeneration: session?.auth_generation,
        identityHash: session?.identity_hash,
        reason: 'authenticated_runtime_probe_rejected',
        responseCode: probe?.response_code
      })
    }
    if (error?.code) {
      throw error
    }
    throw blocked('qa_app_login_failed', '通过真实首页快速登录失败', {
      message: error?.message || String(error)
    })
  } finally {
    try {
      await mp?.disconnect?.()
    } catch {
      // The owning supervisor/qa-run still owns the verified runtime.
    }
  }
}

function assertSupervisorState(state) {
  if (!state || state.status !== 'ready') {
    throw blocked('qa_supervisor_not_ready', 'QA supervisor 尚未处于 ready 状态', { state })
  }
  const lease = readJson(LEASE_PATH)
  if (
    !lease ||
    Number(lease.pid) !== Number(state.pid) ||
    !processAlive(state.pid) ||
    typeof state.process_start_identity !== 'string' ||
    processStartIdentity(state.pid) !== state.process_start_identity ||
    lease.process_start_identity !== state.process_start_identity ||
    !supervisorCommand(state.pid).includes(SUPERVISOR_SCRIPT)
  ) {
    throw blocked('qa_supervisor_owner_unverified', '无法证明当前 supervisor 属于 QA-owned 实例', {
      state,
      lease
    })
  }
  if (
    Number(state.automator_port) !== QA_RUNTIME_WS_PORT ||
    Number(state.control_port) !== QA_RUNTIME_CONTROL_PORT
  ) {
    throw blocked('qa_formal_channel_mismatch', '正式 qa-run 必须使用 9421/9422', { state })
  }
  const expectedProfile = path.resolve(profilePath())
  if (path.resolve(state.profile || '') !== expectedProfile) {
    throw blocked('qa_profile_identity_unverified', 'supervisor 使用了非 QA profile', {
      expected: expectedProfile,
      observed: state.profile
    })
  }
  return { state, lease }
}

function supervisorLeaseArgs(state) {
  if (!state?.dispatch_run_id || !state?.run_instance_id || !state?.run_lease_token) {
    return []
  }
  return [
    `--dispatch-run-id=${state.dispatch_run_id}`,
    `--run-instance-id=${state.run_instance_id}`,
    `--run-lease-token=${state.run_lease_token}`
  ]
}

function refreshSupervisorRuntime(reason, state = null) {
  const result = spawnSync(
    process.execPath,
    [RUNTIME_SCRIPT, 'bootstrap', '--json', '--refresh', ...supervisorLeaseArgs(state)],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 180_000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        QA_SUPERVISOR_REFRESH_REASON: String(reason || 'formal qa leaf requested a fresh LAN build')
      }
    }
  )
  if (result.error || result.status !== 0) {
    throw blocked('qa_supervisor_refresh_failed', 'QA supervisor 刷新构建失败', {
      reason,
      status: result.status,
      signal: result.signal,
      error: result.error?.message || null,
      stdout: String(result.stdout || '').slice(-4000),
      stderr: String(result.stderr || '').slice(-4000)
    })
  }
  let report
  try {
    report = JSON.parse(String(result.stdout || '').trim())
  } catch {
    throw blocked('qa_supervisor_refresh_invalid_result', 'QA supervisor 刷新返回了不可解析结果', {
      stdout: String(result.stdout || '').slice(-4000),
      stderr: String(result.stderr || '').slice(-4000)
    })
  }
  if (report.status !== 'ready') {
    throw blocked(
      report.code || 'qa_supervisor_refresh_blocked',
      'QA supervisor 刷新未达到 ready',
      {
        report
      }
    )
  }
  return report
}

function stopSupervisorRuntime(state) {
  assertSupervisorState(state)
  const result = spawnSync(
    process.execPath,
    [RUNTIME_SCRIPT, 'stop', '--json', ...supervisorLeaseArgs(state)],
    {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      timeout: 60_000,
      maxBuffer: 2 * 1024 * 1024
    }
  )
  let report = null
  try {
    report = JSON.parse(String(result.stdout || '').trim())
  } catch {
    // The structured failure below retains the raw tail for diagnosis.
  }
  if (result.error || result.status !== 0 || report?.code !== 'qa_runtime_stopped') {
    throw blocked('qa_auth_native_rebind_stop_failed', 'QA 原生运行时安全停止失败', {
      status: result.status,
      signal: result.signal,
      error: result.error?.message || null,
      report,
      stdout: String(result.stdout || '').slice(-4000),
      stderr: String(result.stderr || '').slice(-4000)
    })
  }
  return report
}

async function recordNativeQaAuthConsumption(session) {
  // The native bridge explicitly writes the broker's current shared snapshot
  // into the running DevTools process.  Chromium may subsequently rewrite the
  // profile JSON/LevelDB with an older token, so that file is not evidence of
  // what the native runtime actually consumed.  Use the same authoritative
  // snapshot for the broker receipt and fail closed on any generation drift.
  const shared = currentShared()
  const expectedGeneration = Number(session.auth_generation) || null
  if (
    !shared ||
    shared.identityHash !== session.identity_hash ||
    Number(shared.authGeneration) !== expectedGeneration
  ) {
    throw blocked(
      'qa_auth_native_shared_material_not_current',
      'QA 原生运行时与 broker 当前认证世代不一致，已阻止登记旧 profile 凭据',
      {
        expected_generation: expectedGeneration,
        observed_generation: Number(shared?.authGeneration) || null,
        expected_identity_hash: session.identity_hash || null,
        observed_identity_hash: shared?.identityHash || null
      }
    )
  }
  const value = shared
  const eventId = `native-reopen-${session.main_devtools_pid}-${Date.now()}`
  let response
  try {
    response = await requestUnix(
      'POST',
      '/consume',
      {
        event_id: eventId,
        role: 'qa',
        pid: session.main_devtools_pid,
        process_start_identity: processStartIdentity(session.main_devtools_pid),
        profile: session.profile,
        // Official Electron receives the parent Chromium user-data root and
        // appends the product-hash profile directory itself. The broker uses
        // this field to verify that exact command-line ownership.
        user_data_dir: path.dirname(session.profile),
        control_port: session.controlPort,
        service_port: QA_RUNTIME_SERVICE_PORT,
        source: 'native_profile_reopen',
        auth: value
      },
      5000
    )
  } catch (error) {
    throw blocked('qa_auth_native_consumption_broker_unavailable', '认证消费凭据 broker 不可用', {
      message: error?.message || String(error)
    })
  }
  if (response.statusCode !== 200 || response.value?.status !== 'ready') {
    throw blocked(
      'qa_auth_native_consumption_record_failed',
      '原生 QA 真实请求后的消费凭据未被 broker 接受',
      {
        response
      }
    )
  }
  return response.value.event
}

/**
 * Rebind only the QA-owned native runtime after the single writer publishes
 * a newer ticket. The profile is synchronized while no QA DevTools process
 * exists, then the fixed QA runtime is reopened and its real authenticated
 * request records the consumption. Daily DevTools is never stopped or
 * written by this path.
 */
export async function rebindNativeQaAuthRuntime({
  expectedGeneration = null,
  reason = 'auth_generation_rebind'
} = {}) {
  const before = readJson(STATE_PATH)
  assertSupervisorState(before)
  const previousGeneration = Number(before.auth_generation) || null
  const previousPid = Number(before.devtools_pid) || null
  const stop = stopSupervisorRuntime(before)
  let bridge
  try {
    bridge = syncQaAuthFromDailyReadOnly({ qaProfile: before.profile })
  } catch (error) {
    throw blocked('qa_auth_native_rebind_profile_sync_failed', '日常到 QA 的只读认证同步失败', {
      previous_generation: previousGeneration,
      expected_generation: expectedGeneration,
      code: error?.code || null,
      message: error?.message || String(error)
    })
  }
  const auth = readQaAuthManifest()
  const observedGeneration = Number(auth.value?.auth_generation || 0) || null
  if (
    !observedGeneration ||
    (expectedGeneration !== null && observedGeneration < Number(expectedGeneration))
  ) {
    throw blocked(
      'qa_auth_native_rebind_generation_not_ready',
      'QA profile 未同步到要求的新认证世代',
      {
        previous_generation: previousGeneration,
        expected_generation: expectedGeneration,
        observed_generation: observedGeneration,
        bridge
      }
    )
  }
  const refresh = refreshSupervisorRuntime(reason, before)
  const session = await createSupervisorQaSession({ screenshotPath: null })
  const nativeConsumption = session.auth_consumption || null
  if (!nativeConsumption) {
    throw blocked('qa_auth_native_rebind_consumption_missing', '原生 QA 重开后缺少真实消费凭据')
  }
  return {
    status: 'renewed',
    code: 'qa_auth_native_generation_rebound',
    reason,
    previous_generation: previousGeneration,
    observed_generation: Number(session.auth_generation) || observedGeneration,
    previous_devtools_pid: previousPid,
    devtools_pid: Number(session.main_devtools_pid) || null,
    stop,
    bridge,
    refresh,
    session,
    auth_consumption: nativeConsumption
  }
}

export async function createSupervisorQaSession({
  screenshotPath,
  wxRequestUrl,
  forceFullLanRebuild = false,
  fullLanRebuildReason = null
} = {}) {
  const backendTarget = resolveQaBackendTarget(process.env)
  let refresh = null
  if (forceFullLanRebuild) {
    const current = readJson(STATE_PATH)
    assertSupervisorState(current)
    refresh = refreshSupervisorRuntime(fullLanRebuildReason, current)
  }
  const state = readJson(STATE_PATH)
  assertSupervisorState(state)
  const observedBackendTarget = state.backend_target || null
  if (!qaBackendTargetMatches(observedBackendTarget, backendTarget)) {
    throw blocked(
      'qa_supervisor_backend_target_mismatch',
      'supervisor 状态中的 backend target 不是本次 canonical target',
      {
        expected: {
          mode: backendTarget.mode,
          environment_id: backendTarget.environmentId
        },
        observed: observedBackendTarget
      }
    )
  }
  if (wxRequestUrl) {
    throw blocked(
      'qa_supervisor_request_url_override_forbidden',
      '正式 QA 的请求地址只能由 supervisor generation 固定派生'
    )
  }
  const runtime = deriveQaRuntime({ sourceProjectPath: state.source_project_path })
  if (
    runtime.runtimeKey !== state.runtime_key ||
    path.resolve(runtime.runtimePath) !== path.resolve(state.project_path)
  ) {
    throw blocked('qa_runtime_identity_mismatch', 'supervisor runtime key 或 project path 不一致', {
      state,
      runtime
    })
  }
  const manifest = readQaRuntimeManifest(runtime.runtimePath)
  if (!runtimeManifestIsReady(runtime, manifest)) {
    throw blocked('qa_runtime_manifest_not_ready', 'supervisor manifest 尚未达到 runtime-ready', {
      manifest
    })
  }
  const auth = readQaAuthManifest()
  if (!auth.material_ready || auth.value?.identity_hash !== state.identity_hash) {
    throw blocked('qa_auth_material_unavailable', '共享认证材料不存在或与 supervisor 身份不一致', {
      auth: auth.value,
      supervisor_identity_hash: state.identity_hash
    })
  }
  const shared = currentShared()
  const authGeneration = Number(auth.value.auth_generation) || null
  const stateAuthGeneration = Number(state.auth_generation) || null
  const sharedAuthGeneration = Number(shared?.authGeneration) || null
  if (
    !shared ||
    shared.identityHash !== state.identity_hash ||
    authGeneration !== stateAuthGeneration ||
    sharedAuthGeneration !== authGeneration
  ) {
    throw blocked(
      'qa_supervisor_auth_generation_drift',
      'supervisor、认证 manifest 和 broker 共享快照不属于同一认证世代，已在启动入口阻断',
      {
        state_generation: stateAuthGeneration,
        manifest_generation: authGeneration,
        shared_generation: sharedAuthGeneration,
        supervisor_identity_hash: state.identity_hash || null,
        shared_identity_hash: shared?.identityHash || null
      }
    )
  }
  if (Number(manifest.auth_generation) !== authGeneration) {
    throw blocked(
      'qa_runtime_auth_generation_drift',
      'runtime manifest 与当前认证世代不一致，已阻止复用旧运行时',
      {
        runtime_generation: Number(manifest.generation) || null,
        runtime_auth_generation: Number(manifest.auth_generation) || null,
        current_auth_generation: authGeneration
      }
    )
  }
  const base = {
    status: 'ready',
    sessionId: state.session_id,
    session_id: state.session_id,
    sourceProjectPath: state.source_project_path,
    projectPath: state.project_path,
    runtimeTargetPath: state.project_path,
    runtime_key: state.runtime_key,
    profile: state.profile,
    devtools_user_data_dir:
      QA_RUNTIME_DEVTOOLS_RUNTIME_KIND === 'official_electron'
        ? path.dirname(state.profile)
        : state.profile,
    home: QA_RUNTIME_PROFILE_HOME,
    wsPort: QA_RUNTIME_WS_PORT,
    controlPort: QA_RUNTIME_CONTROL_PORT,
    localRuntimePid: state.local_runtime_pid,
    main_devtools_pid: state.devtools_pid,
    identity_hash: state.identity_hash,
    auth_generation: authGeneration,
    runtime_manifest: manifest,
    bootstrap_preflight: state.bootstrap_preflight || null,
    runtime_evidence: null,
    full_lan_rebuild_requested: Boolean(forceFullLanRebuild),
    full_lan_rebuild_reason: fullLanRebuildReason,
    supervisor_refresh: refresh
  }
  const inspect = () => ownedRuntimeEvidence(base)
  const runtimeEvidence = inspect()
  if (runtimeEvidence.status !== 'verified') {
    throw blocked(
      'qa_runtime_owner_unverified',
      'supervisor 的 Automator project identity 尚未验证',
      {
        runtime: runtimeEvidence
      }
    )
  }
  // The official Electron CLI may replace its main window process while the
  // fixed control/Automator listeners remain owned by the same QA session.
  // Use the process that just passed owner evidence for all authenticated
  // runtime receipts; the supervisor's launch PID is only an initial hint.
  if (Number(runtimeEvidence.main_devtools_pid) > 0) {
    base.main_devtools_pid = Number(runtimeEvidence.main_devtools_pid)
  }
  const enrollmentVerified = hasQaAppAuthEnrollment({
    identityHash: state.identity_hash,
    profile: state.profile
  })
  const protectedWxRequestUrl = backendTarget.wxRequestUrl
  const protectedBusinessAuthUrl = backendTarget.businessAuthUrl
  // The first run must be allowed to establish server validation through the
  // real mini-program home. Requiring runtime_ready before this call creates
  // a deadlock: the only code that can write server-validation.json is the
  // authenticated wx.request probe below. On later runs, the same branch
  // revalidates the persisted home instead of asking for a new QR login.
  const appAuth = await ensureQaAppLoggedIn({
    session: {
      ...base,
      preflight_options: {
        wsEndpoint: `ws://127.0.0.1:${QA_RUNTIME_WS_PORT}`,
        wxRequestUrl: protectedWxRequestUrl,
        businessAuthUrl: protectedBusinessAuthUrl
      }
    },
    requireRealHomeEntry: !enrollmentVerified,
    skipBusinessProbe: isColdPerformanceLane()
  })
  const authConsumption = await recordNativeQaAuthConsumption({
    ...base,
    controlPort: base.controlPort
  })
  const validatedAuth = readQaAuthManifest()
  const validatedRuntimeIdentityHash =
    validatedAuth.server_validation?.runtime_identity_hash || null
  const appRuntimeIdentityHash = appAuth?.runtime_identity_hash || null
  if (
    !validatedAuth.runtime_ready ||
    validatedAuth.value?.identity_hash !== state.identity_hash ||
    !validatedRuntimeIdentityHash ||
    !appRuntimeIdentityHash ||
    validatedRuntimeIdentityHash !== appRuntimeIdentityHash
  ) {
    throw blocked(
      'qa_auth_server_validation_required',
      '真实小程序登录和 wx.request 尚未完成服务端身份校验',
      {
        auth: validatedAuth.value,
        server_validation: validatedAuth.server_validation || null,
        app_runtime_identity_hash: appRuntimeIdentityHash,
        app_auth: appAuth,
        supervisor_identity_hash: state.identity_hash
      }
    )
  }
  base.runtime_evidence = {
    ...runtimeEvidence,
    bootstrap_preflight: state.bootstrap_preflight || null
  }
  base.app_auth = appAuth
  base.auth_consumption = authConsumption
  base.auth_consumption_ack = {
    status: 'passed',
    code: 'qa_auth_consumption_ack_received',
    event: authConsumption
  }
  base.auth_server_validated = true
  base.app_runtime_identity_hash = appRuntimeIdentityHash
  return {
    ...base,
    preflight_options: {
      projectPath: base.projectPath,
      wsPort: base.wsPort,
      wsEndpoint: `ws://127.0.0.1:${base.wsPort}`,
      runtimeChannel: 'formal_qa_v3',
      initialRoute: '/pages/index/index',
      screenshotPath,
      wxRequestUrl: protectedWxRequestUrl,
      requireAuthenticatedWxRequest: true,
      allowTargetedRestart: true,
      requireIsolatedProject: true,
      runtime: runtimeEvidence,
      preverifiedRuntime: runtimeEvidence,
      runtimeInspector: inspect,
      recoveryExecutor: recoverVerifiedTargetDevTools,
      lanFlowProbe: () =>
        localRuntimeOwned(
          localRuntimeEvidence(base.projectPath),
          base.localRuntimePid,
          base.projectPath
        )
    }
  }
}

export function cleanupSupervisorQaSession({ session } = {}) {
  return {
    status: 'not_needed',
    code: 'qa_supervisor_runtime_preserved',
    session_id: session?.sessionId || null,
    generation: session?.runtime_manifest?.generation || null,
    reason: 'formal qa-run reuses the already verified supervisor generation'
  }
}
