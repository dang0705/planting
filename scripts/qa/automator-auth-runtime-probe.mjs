#!/usr/bin/env node

import crypto from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import automator from 'miniprogram-automator'

import { probeWxRequest } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight-runtime.mjs'
import { connectAutomatorTransport } from '../../test/e2e/automator/_shared/formal-leaf-harness.mjs'
import { resolveLocalApiBaseUrl } from '../dev/local-api-env-config.mjs'
import {
  currentShared,
  dailyDevToolsState,
  isAcceptedAuthConsumptionSource,
  processStartIdentity,
  readAuthConsumptionEvidence
} from './qa-auth-broker-core.mjs'
import { readQaAuthManifest, recordQaAuthServerValidation } from './qa-auth-coordinator.mjs'
import { CONTROL_PORTS, SERVICE_PORTS } from './qa-devtools-topology.mjs'
import { createSupervisorQaSession, rebindNativeQaAuthRuntime } from './qa-supervisor-client.mjs'
import { resolveQaRunLease } from './qa-run-lease.mjs'

function parseArgs(argv = process.argv.slice(2)) {
  const result = {
    dispatchRunId: null,
    runInstanceId: null,
    runLeaseToken: null
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = String(argv[index])
    if (!argument.startsWith('--')) {
      continue
    }
    const [key, inlineValue] = argument.slice(2).split('=', 2)
    const value = inlineValue ?? argv[index + 1]
    if (inlineValue === undefined) {
      index += 1
    }
    if (key === 'dispatch-run-id') {
      result.dispatchRunId = String(value || '')
    }
    if (key === 'run-instance-id') {
      result.runInstanceId = String(value || '')
    }
    if (key === 'run-lease-token') {
      result.runLeaseToken = String(value || '')
    }
  }
  if (!result.dispatchRunId || !result.runInstanceId || !result.runLeaseToken) {
    throw new Error('认证 runtime probe 必须绑定当前 dispatch run lease')
  }
  return result
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export const AUTH_RUNTIME_PROBE_CONNECT_TIMEOUT_MS = 45_000
export const AUTH_RUNTIME_PROBE_RPC_TIMEOUT_MS = 8_000
export const AUTH_RUNTIME_PROBE_CONSUMPTION_ACK_TIMEOUT_MS = 8_000

function timeoutError(code, timeoutMs) {
  const error = new Error(`${code} after ${timeoutMs}ms`)
  error.code = code
  error.timeoutMs = timeoutMs
  return error
}

async function evaluateWithTimeout(miniProgram, step, callback, args = []) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      reject(
        timeoutError(`qa_auth_runtime_probe_${step}_timeout`, AUTH_RUNTIME_PROBE_RPC_TIMEOUT_MS)
      )
    }, AUTH_RUNTIME_PROBE_RPC_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      Promise.resolve().then(() => miniProgram.evaluate(callback, ...args)),
      timeout
    ])
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function connectWithTimeout(connect, client, endpoint, options, timeoutMs, code) {
  let timedOut = false
  let timer = null
  const pending = Promise.resolve().then(() => connect(client, endpoint, options))
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true
      reject(timeoutError(code, timeoutMs))
    }, timeoutMs)
  })
  try {
    return await Promise.race([pending, timeout])
  } catch (error) {
    if (timedOut) {
      // A late Automator connection must not keep a timed-out probe alive or
      // leave a second client attached to the QA runtime.
      pending.then(clientInstance => clientInstance?.disconnect?.()).catch(() => {})
    }
    throw error
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

function matchesConsumption(
  evidence,
  {
    role,
    pid,
    processStartIdentity,
    profile,
    generation,
    identityHash,
    ticketHash,
    minimumTimestamp
  }
) {
  const event = evidence?.latest_by_role?.[role] || evidence?.latest || null
  return Boolean(
    event &&
    event.role === role &&
    isAcceptedAuthConsumptionSource(event.source, role) &&
    typeof event.event_id === 'string' &&
    event.event_id.length > 0 &&
    Number(event.pid) === Number(pid) &&
    event.process_start_identity === processStartIdentity &&
    path.resolve(String(event.profile_realpath || '')) === path.resolve(String(profile || '')) &&
    Number(event.auth_generation) === Number(generation) &&
    event.identity_hash === identityHash &&
    event.ticket_hash === ticketHash &&
    Number(event.consumed_at_ms) >= Number(minimumTimestamp)
  )
}

async function waitForConsumptionAck({
  role,
  pid,
  processStartIdentity,
  profile,
  shared,
  timeoutMs = 2500
}) {
  const generation = Number(shared?.authGeneration || 0) || null
  const identityHash = shared?.identityHash || null
  const ticketHash = shared?.newticket ? hash(shared.newticket) : null
  const minimumTimestamp = Number(shared?.updatedAt || 0) || 0
  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  let evidence = readAuthConsumptionEvidence()
  while (Date.now() < deadline) {
    if (
      matchesConsumption(evidence, {
        role,
        pid,
        processStartIdentity,
        profile,
        generation,
        identityHash,
        ticketHash,
        minimumTimestamp
      })
    ) {
      return {
        status: 'passed',
        code: 'qa_auth_consumption_ack_received',
        wait_ms: Date.now() - startedAt,
        event: evidence.latest_by_role?.[role] || evidence.latest
      }
    }
    await sleep(100)
    evidence = readAuthConsumptionEvidence()
  }
  return {
    status: 'blocked',
    code: 'qa_auth_consumption_ack_missing',
    wait_ms: Date.now() - startedAt,
    event: evidence?.latest_by_role?.[role] || evidence?.latest || null
  }
}

export async function createAuthRuntimeProbe({
  dispatchRunId,
  runInstanceId,
  runLeaseToken,
  includeDaily = false,
  connect = connectAutomatorTransport,
  miniProgramClient = automator
} = {}) {
  resolveQaRunLease({
    dispatchRunId,
    kind: 'auth-runtime-probe',
    runInstanceId,
    runLeaseToken
  })
  let session = await createSupervisorQaSession({ screenshotPath: null })
  let miniProgram = await connectWithTimeout(
    connect,
    miniProgramClient,
    session.preflight_options.wsEndpoint,
    { runtimeProof: session.preflight_options.runtime },
    AUTH_RUNTIME_PROBE_CONNECT_TIMEOUT_MS,
    'qa_auth_runtime_probe_qa_connect_timeout'
  )
  let dailyMiniProgram = null
  let dailyConnectionError = null
  const dailyRequestUrl = includeDaily
    ? resolveLocalApiBaseUrl(
        { mode: 'lan', port: 3010, functionPortBase: 9000 },
        process.env
      ).replace(/\/+$/u, '') + '/plant-user-http/user-plants?page=1&pageSize=1'
    : null
  if (includeDaily) {
    try {
      dailyMiniProgram = await connectWithTimeout(
        connect,
        miniProgramClient,
        `ws://127.0.0.1:${SERVICE_PORTS.daily}`,
        undefined,
        AUTH_RUNTIME_PROBE_CONNECT_TIMEOUT_MS,
        'qa_auth_runtime_probe_daily_connect_timeout'
      )
    } catch (error) {
      dailyConnectionError = {
        code: error?.code || 'qa_auth_daily_runtime_connect_failed',
        message: error?.message || String(error)
      }
    }
  }
  let processIdentity = processStartIdentity(session.main_devtools_pid)

  return {
    session,
    async probe({ expectedGeneration = null, expectedIdentityHash = null } = {}) {
      const probeStartedAt = Date.now()
      const before = currentShared()
      let request = await probeWxRequest({
        miniProgram,
        url: session.preflight_options.wxRequestUrl,
        requireAuthenticatedIdentity: true,
        timeoutMs: 10_000,
        evaluateStep: (step, callback, args) =>
          evaluateWithTimeout(miniProgram, step, callback, args)
      })
      let dailyRuntime = null
      let dailyProcess = null
      if (includeDaily) {
        if (!dailyMiniProgram) {
          dailyRuntime = {
            status: 'blocked',
            code: dailyConnectionError?.code || 'qa_auth_daily_runtime_unavailable',
            error: dailyConnectionError?.message || null
          }
        } else {
          try {
            const dailyRequest = await probeWxRequest({
              miniProgram: dailyMiniProgram,
              url: dailyRequestUrl,
              requireAuthenticatedIdentity: true,
              timeoutMs: 10_000,
              evaluateStep: (step, callback, args) =>
                evaluateWithTimeout(dailyMiniProgram, step, callback, args)
            })
            const dailyState = dailyDevToolsState()
            dailyProcess = dailyState.processes.find(item =>
              new RegExp(`--ide-http-port(?:\\s+|=)${CONTROL_PORTS.daily}(?:\\s|$)`, 'u').test(
                String(item.command)
              )
            )
            const dailyPassed =
              dailyRequest?.passed === true &&
              dailyRequest?.cleanup?.passed === true &&
              dailyRequest?.identity_required === true &&
              dailyRequest?.identity_resolved === true &&
              dailyState.active === true &&
              dailyState.managed === true &&
              Boolean(dailyProcess)
            dailyRuntime = {
              status: dailyPassed ? 'pending' : 'blocked',
              code: dailyPassed
                ? 'qa_auth_daily_runtime_probe_passed'
                : 'qa_auth_daily_runtime_probe_failed',
              identity_required: dailyRequest?.identity_required === true,
              identity_resolved: dailyRequest?.identity_resolved === true,
              response_code: dailyRequest?.response_code ?? null,
              status_code: dailyRequest?.statusCode ?? null,
              cleanup_passed: dailyRequest?.cleanup?.passed === true,
              managed: dailyState.managed === true,
              main_pid: Number(dailyProcess?.pid) || null,
              process_start_identity: dailyProcess
                ? processStartIdentity(Number(dailyProcess.pid))
                : null
            }
          } catch (error) {
            dailyRuntime = {
              status: 'blocked',
              code: error?.code || 'qa_auth_daily_runtime_probe_failed',
              error: error?.message || String(error)
            }
          }
        }
      }
      const after = currentShared()
      let effectiveShared = after
      let qaConsumptionAck = await waitForConsumptionAck({
        role: 'qa',
        pid: session.main_devtools_pid,
        processStartIdentity: processIdentity,
        profile: session.profile,
        shared: effectiveShared,
        timeoutMs: AUTH_RUNTIME_PROBE_CONSUMPTION_ACK_TIMEOUT_MS
      })
      // The native daily owner may legitimately publish a newer generation
      // while this probe is running. Rebind once to the newest shared record
      // and wait for QA to consume that exact generation instead of treating
      // the normal rotation as an account takeover.
      if (qaConsumptionAck.status !== 'passed') {
        const newerShared = currentShared()
        if (
          newerShared &&
          Number(newerShared.authGeneration || 0) > Number(effectiveShared?.authGeneration || 0)
        ) {
          effectiveShared = newerShared
          try {
            await miniProgram?.disconnect?.()
          } catch {
            // The old QA client is intentionally discarded before the
            // owner-verified native profile rebind.
          }
          const rebound = await rebindNativeQaAuthRuntime({
            expectedGeneration: Number(effectiveShared.authGeneration),
            reason: 'auth_generation_rebind_runtime_probe'
          })
          session = rebound.session
          processIdentity = processStartIdentity(session.main_devtools_pid)
          miniProgram = await connectWithTimeout(
            connect,
            miniProgramClient,
            session.preflight_options.wsEndpoint,
            { runtimeProof: session.preflight_options.runtime },
            AUTH_RUNTIME_PROBE_CONNECT_TIMEOUT_MS,
            'qa_auth_runtime_probe_rebind_connect_timeout'
          )
          request = await probeWxRequest({
            miniProgram,
            url: session.preflight_options.wxRequestUrl,
            requireAuthenticatedIdentity: true,
            timeoutMs: 10_000,
            evaluateStep: (step, callback, args) =>
              evaluateWithTimeout(miniProgram, step, callback, args)
          })
          qaConsumptionAck = await waitForConsumptionAck({
            role: 'qa',
            pid: session.main_devtools_pid,
            processStartIdentity: processIdentity,
            profile: session.profile,
            shared: effectiveShared,
            timeoutMs: AUTH_RUNTIME_PROBE_CONSUMPTION_ACK_TIMEOUT_MS
          })
        }
      }
      const qaConsumption = qaConsumptionAck.event
      if (includeDaily && dailyRuntime && dailyProcess) {
        const dailyProfile = dailyProcess.command
          .match(/--user-data-dir=(?:"([^"]+)"|'([^']+)'|(\S+))/u)
          ?.slice(1)
          .find(Boolean)
        const dailyConsumptionAck = await waitForConsumptionAck({
          role: 'daily',
          pid: Number(dailyProcess.pid),
          processStartIdentity: processStartIdentity(Number(dailyProcess.pid)),
          profile: dailyProfile,
          shared: effectiveShared
        })
        dailyRuntime.auth_consumption = dailyConsumptionAck.event || null
        if (dailyRuntime.status === 'pending' && dailyConsumptionAck.status === 'passed') {
          dailyRuntime.auth_consumption_ack = dailyConsumptionAck
          dailyRuntime.status = 'passed'
        } else if (dailyRuntime.status === 'pending') {
          // A persistent daily DevTools process must not be restarted or
          // forced to consume a new broker ticket when QA starts. Its real
          // wx.request, resolved identity, matched shared material, and
          // exact profile/port ownership are the proof that the retained
          // daily session remains usable without taking over the account.
          dailyRuntime.auth_consumption_ack = {
            status: 'not_required',
            code: 'qa_auth_daily_consumption_ack_not_required',
            reason: 'persistent_daily_runtime_retained_valid_identity',
            observed: dailyConsumptionAck.event || null
          }
          dailyRuntime.status = 'passed'
          dailyRuntime.code = 'qa_auth_daily_retained_runtime_verified'
        }
      }
      const generation = Number(effectiveShared?.authGeneration || 0) || null
      const identityHash = effectiveShared?.identityHash || null
      let serverAuthValidation = null
      let serverAuthValidationError = null
      if (
        request?.passed === true &&
        request?.identity_required === true &&
        request?.identity_resolved === true &&
        Number(request?.response_code) === 200 &&
        Number.isInteger(generation) &&
        qaConsumptionAck.status === 'passed'
      ) {
        // This probe's request proves that the persisted platform session can
        // be consumed by the current QA runtime. It does not return the
        // unified business user identity. `identityHash` is the native WeChat
        // identity hash, while server validation's runtime identity hash is
        // established by the authenticated `/auth/user` business probe.
        // Never overwrite that business identity with the native hash: doing
        // so makes the next cold-performance bootstrap reject a valid session
        // before the measured requests are issued.
        const validated = readQaAuthManifest().server_validation
        const validationMatches = Boolean(
          validated?.status === 'passed' &&
          Number(validated.auth_generation) === generation &&
          validated.identity_hash === identityHash &&
          /^[a-f0-9]{64}$/u.test(String(validated.runtime_identity_hash || ''))
        )
        if (validationMatches) {
          try {
            serverAuthValidation = recordQaAuthServerValidation({
              status: 'passed',
              authGeneration: generation,
              identityHash,
              runtimeIdentityHash: validated.runtime_identity_hash,
              qaPid: session.main_devtools_pid,
              qaProcessStartIdentity: processIdentity,
              qaProfile: session.profile,
              reason: 'qa_auth_runtime_probe_real_wx_request'
            })
          } catch (error) {
            serverAuthValidationError = {
              code: error?.code || 'qa_auth_server_validation_write_failed',
              message: error?.message || String(error)
            }
          }
        }
      }
      const passed =
        request?.passed === true &&
        request?.cleanup?.passed === true &&
        request?.identity_required === true &&
        request?.identity_resolved === true &&
        Number(request?.response_code) === 200 &&
        Number.isInteger(generation) &&
        qaConsumptionAck.status === 'passed' &&
        !serverAuthValidationError &&
        (!expectedGeneration || generation >= Number(expectedGeneration)) &&
        (!expectedIdentityHash || identityHash === expectedIdentityHash)
      const result = {
        status: passed ? 'passed' : 'blocked',
        code: passed ? 'qa_auth_runtime_probe_passed' : 'qa_auth_runtime_probe_failed',
        generation,
        expected_generation: expectedGeneration,
        identity_hash: identityHash,
        expected_identity_hash: expectedIdentityHash,
        profile: session.profile || null,
        session_id: session.session_id || null,
        devtools_pid: Number(session.main_devtools_pid) || null,
        process_start_identity: processIdentity,
        shared_before_generation: Number(before?.authGeneration || 0) || null,
        shared_after_generation: generation,
        auth_consumption: qaConsumption,
        auth_consumption_ack: qaConsumptionAck,
        server_auth_validation: serverAuthValidation,
        server_auth_validation_error: serverAuthValidationError,
        probe_started_at_ms: probeStartedAt,
        request: {
          passed: request?.passed === true,
          status_code: request?.statusCode ?? null,
          response_code: request?.response_code ?? null,
          identity_required: request?.identity_required === true,
          identity_resolved: request?.identity_resolved === true,
          cleanup_passed: request?.cleanup?.passed === true
        },
        daily_runtime: dailyRuntime,
        identity_fingerprint: request?.identity_resolved ? hash(identityHash) : null
      }
      if (includeDaily && result.daily_runtime?.status !== 'passed') {
        result.status = 'blocked'
        result.code = result.daily_runtime?.code || 'qa_auth_daily_runtime_probe_failed'
      }
      return result
    },
    async close() {
      try {
        await miniProgram?.disconnect?.()
      } catch {
        // The owning supervisor/qa-run still owns the verified runtime.
      }
      try {
        await dailyMiniProgram?.disconnect?.()
      } catch {
        // Daily runtime is never stopped or reconfigured by the probe.
      }
    }
  }
}

async function runProbe(args) {
  const runtimeProbe = await createAuthRuntimeProbe({
    dispatchRunId: args.dispatchRunId,
    runInstanceId: args.runInstanceId,
    runLeaseToken: args.runLeaseToken,
    includeDaily: true
  })
  try {
    return await runtimeProbe.probe({
      expectedGeneration: runtimeProbe.session.auth_generation,
      expectedIdentityHash: runtimeProbe.session.identity_hash
    })
  } finally {
    await runtimeProbe.close()
  }
}

const isMain =
  process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
if (isMain) {
  try {
    const result = await runProbe(parseArgs())
    process.stdout.write(`${JSON.stringify(result)}\n`)
    process.exitCode = result.status === 'passed' ? 0 : 1
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify({
        status: 'blocked',
        code: error?.code || 'qa_auth_runtime_probe_failed',
        message: error?.message || String(error)
      })}\n`
    )
    process.exitCode = 1
  }
}
