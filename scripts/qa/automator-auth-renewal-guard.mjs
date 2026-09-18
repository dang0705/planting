#!/usr/bin/env node

import fs from 'node:fs'
import crypto from 'node:crypto'
import path from 'node:path'

import {
  canAcceptDailyPublish,
  currentShared,
  dailyDevToolsState,
  isFreshAuthConsumptionEvidence,
  processStartIdentity,
  readAuthConsumptionEvidence,
  readDailyCapability
} from './qa-auth-broker-core.mjs'
import { qaAuthProfiles } from './qa-auth-coordinator.mjs'
import { profileFromCommand } from './qa-devtools-topology.mjs'

export const AUTH_RENEWAL_MIN_INITIAL_REMAINING_MS = 60_000
export const AUTH_RENEWAL_GRACE_MS = 30_000
export const AUTH_RENEWAL_POLL_INTERVAL_MS = 1_000
export const AUTH_RENEWAL_CONSUMPTION_MAX_AGE_MS = 30_000

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function profileRealpath(profile) {
  const resolved = path.resolve(String(profile || ''))
  try {
    return fs.realpathSync(resolved)
  } catch {
    return resolved
  }
}

function dailyOwner(processState) {
  return (
    processState?.processes?.find(process =>
      /--ide-http-port(?:\s+|=)9423(?:\s|$)/u.test(String(process.command || ''))
    ) ||
    processState?.processes?.[0] ||
    null
  )
}

export function readAuthRenewalState() {
  const shared = currentShared()
  const daily = dailyDevToolsState()
  const capabilityState = readDailyCapability()
  const capabilityVerified = canAcceptDailyPublish({
    role: 'daily',
    dailyProcess: daily,
    capability: capabilityState?.capability,
    capabilityState
  })
  const owner = dailyOwner(daily)
  const qaProfile = profileRealpath(qaAuthProfiles().qa)
  const evidence = readAuthConsumptionEvidence()
  return {
    shared,
    daily: {
      active: daily.active === true,
      managed: daily.managed === true,
      capability_verified: capabilityVerified,
      pids: daily.pids || [],
      owner_pid: Number(owner?.pid) || null,
      owner_start_identity: owner ? processStartIdentity(Number(owner.pid)) : null,
      owner_profile: profileFromCommand(owner?.command) || null
    },
    qa: { profile: qaProfile },
    consumption: evidence
  }
}

export function controlledDailyRenewalAvailable(state) {
  return Boolean(
    state?.daily?.active === true &&
    state.daily.managed === true &&
    state.daily.capability_verified === true &&
    Number.isInteger(state.daily.owner_pid) &&
    state.daily.owner_pid > 0 &&
    state.daily.owner_start_identity
  )
}

function expiry(shared) {
  const ticket = Number(shared?.ticketExpiredTime)
  const signature = Number(shared?.signatureExpiredTime)
  const value = Math.min(ticket, signature)
  return {
    ticket,
    signature,
    value: Number.isFinite(value) ? value : null
  }
}

function identityHash(shared) {
  return shared?.identityHash || null
}

function hasQaConsumedGeneration(state, generation, identity, now) {
  const event = state?.consumption?.latest_by_role?.qa || state?.consumption?.latest || null
  if (!event || path.resolve(String(event.profile_realpath || '')) !== state.qa.profile) {
    return false
  }
  if (processStartIdentity(Number(event.pid)) !== event.process_start_identity) {
    return false
  }
  const ticket = state.shared?.newticket
  return isFreshAuthConsumptionEvidence(state.consumption, {
    role: 'qa',
    pid: Number(event.pid),
    process_start_identity: event.process_start_identity,
    profile: state.qa.profile,
    auth_generation: generation,
    identity_hash: identity,
    ticket_hash: ticket ? sha256(ticket) : null,
    max_age_ms: AUTH_RENEWAL_CONSUMPTION_MAX_AGE_MS,
    now
  })
}

export function createAuthRenewalGuard({
  readState = readAuthRenewalState,
  now = () => Date.now(),
  graceMs = AUTH_RENEWAL_GRACE_MS,
  minimumInitialRemainingMs = AUTH_RENEWAL_MIN_INITIAL_REMAINING_MS,
  onGenerationTransition = null
} = {}) {
  let baseline = null
  let expiredSince = null
  const renewals = []
  let checks = 0
  let transitionGeneration = null
  let transitionPromise = null

  const check = async ({ phase = null } = {}) => {
    checks += 1
    const timestamp = now()
    let state
    try {
      state = readState()
    } catch (error) {
      return {
        status: 'blocked',
        code: error?.code || 'qa_auth_renewal_state_unreadable',
        phase,
        message: error?.message || String(error)
      }
    }
    const shared = state?.shared
    const generation = Number(shared?.authGeneration) || null
    const identity = identityHash(shared)
    const expiration = expiry(shared)
    const remainingMs = expiration.value === null ? null : expiration.value - timestamp

    if (!controlledDailyRenewalAvailable(state)) {
      return {
        status: 'blocked',
        code: 'qa_auth_renewal_daily_owner_unavailable',
        phase,
        generation,
        identity_hash: identity,
        remaining_ms: remainingMs,
        daily: state?.daily || null
      }
    }
    if (!generation || !/^[a-f0-9]{64}$/u.test(String(identity || ''))) {
      return {
        status: 'blocked',
        code: 'qa_auth_renewal_shared_material_invalid',
        phase,
        generation,
        identity_hash: identity,
        remaining_ms: remainingMs
      }
    }
    if (baseline === null) {
      baseline = {
        generation,
        identity_hash: identity,
        daily_owner_pid: state.daily.owner_pid,
        daily_owner_start_identity: state.daily.owner_start_identity
      }
      if (
        identity === null ||
        remainingMs === null ||
        remainingMs <= Math.max(5_000, minimumInitialRemainingMs)
      ) {
        return {
          status: 'blocked',
          code: 'qa_auth_renewal_initial_material_not_fresh',
          phase,
          generation,
          identity_hash: identity,
          remaining_ms: remainingMs
        }
      }
      return {
        status: 'healthy',
        code: 'qa_auth_renewal_watchdog_started',
        phase,
        generation,
        identity_hash: identity,
        remaining_ms: remainingMs,
        checks
      }
    }
    if (identity !== baseline.identity_hash) {
      return {
        status: 'blocked',
        code: 'qa_auth_renewal_identity_changed',
        phase,
        expected_identity_hash: baseline.identity_hash,
        observed_identity_hash: identity,
        generation
      }
    }
    if (
      state.daily.owner_pid !== baseline.daily_owner_pid ||
      state.daily.owner_start_identity !== baseline.daily_owner_start_identity
    ) {
      return {
        status: 'blocked',
        code: 'qa_auth_renewal_daily_process_changed',
        phase,
        expected_pid: baseline.daily_owner_pid,
        observed_pid: state.daily.owner_pid,
        expected_start_identity: baseline.daily_owner_start_identity,
        observed_start_identity: state.daily.owner_start_identity
      }
    }
    if (generation < baseline.generation) {
      return {
        status: 'blocked',
        code: 'qa_auth_renewal_generation_regressed',
        phase,
        expected_generation: baseline.generation,
        observed_generation: generation
      }
    }

    if (generation > baseline.generation) {
      if (remainingMs === null || remainingMs <= 5_000) {
        return {
          status: 'blocked',
          code: 'qa_auth_renewal_rotated_material_not_fresh',
          phase,
          generation,
          identity_hash: identity,
          remaining_ms: remainingMs
        }
      }
      if (!hasQaConsumedGeneration(state, generation, identity, timestamp)) {
        if (typeof onGenerationTransition === 'function') {
          if (transitionGeneration !== generation) {
            transitionGeneration = generation
            transitionPromise = Promise.resolve().then(() =>
              onGenerationTransition({ phase, generation, state })
            )
          }
          let transition
          try {
            transition = await transitionPromise
          } catch (error) {
            transitionPromise = null
            return {
              status: 'blocked',
              code: error?.code || 'qa_auth_renewal_native_rebind_failed',
              phase,
              generation,
              identity_hash: identity,
              message: error?.message || String(error),
              details: error?.details || null
            }
          }
          if (transition?.status !== 'renewed') {
            transitionPromise = null
            return {
              status: 'blocked',
              code: transition?.code || 'qa_auth_renewal_native_rebind_failed',
              phase,
              generation,
              identity_hash: identity,
              transition
            }
          }
          // The callback has replaced only the QA-owned native runtime and
          // recorded its post-request consumption. Re-read the broker state
          // so the guard never promotes a stale pre-rebind sample.
          try {
            state = readState()
          } catch (error) {
            transitionPromise = null
            return {
              status: 'blocked',
              code: error?.code || 'qa_auth_renewal_state_unreadable',
              phase,
              message: error?.message || String(error)
            }
          }
          const reboundGeneration = Number(state?.shared?.authGeneration) || null
          const reboundIdentity = identityHash(state?.shared)
          if (
            reboundGeneration !== generation ||
            reboundIdentity !== identity ||
            !hasQaConsumedGeneration(state, reboundGeneration, reboundIdentity, now())
          ) {
            transitionPromise = null
            return {
              status: 'blocked',
              code: 'qa_auth_renewal_native_rebind_unproven',
              phase,
              expected_generation: generation,
              observed_generation: reboundGeneration,
              expected_identity_hash: identity,
              observed_identity_hash: reboundIdentity
            }
          }
          const renewal = {
            generation: reboundGeneration,
            identity_hash: reboundIdentity,
            observed_at: new Date(now()).toISOString(),
            remaining_ms: expiry(state.shared).value - now(),
            rebind: transition
          }
          renewals.push(renewal)
          baseline = {
            ...baseline,
            generation: reboundGeneration,
            identity_hash: reboundIdentity
          }
          expiredSince = null
          transitionPromise = null
          return {
            status: 'renewed',
            code: 'qa_auth_renewal_native_runtime_rebound',
            phase,
            ...renewal,
            checks
          }
        }
        if (expiredSince === null) {
          expiredSince = timestamp
        }
        if (timestamp - expiredSince <= graceMs) {
          return {
            status: 'waiting',
            code: 'qa_auth_renewal_waiting_for_qa_consumption',
            phase,
            generation,
            identity_hash: identity,
            remaining_ms: remainingMs,
            grace_remaining_ms: Math.max(0, graceMs - (timestamp - expiredSince))
          }
        }
        return {
          status: 'blocked',
          code: 'qa_auth_renewal_qa_consumption_not_observed',
          phase,
          generation,
          identity_hash: identity,
          remaining_ms: remainingMs,
          grace_ms: graceMs
        }
      }
      const renewal = {
        generation,
        identity_hash: identity,
        observed_at: new Date(timestamp).toISOString(),
        remaining_ms: remainingMs
      }
      renewals.push(renewal)
      baseline = {
        ...baseline,
        generation,
        identity_hash: identity
      }
      expiredSince = null
      return {
        status: 'renewed',
        code: 'qa_auth_renewal_observed_and_consumed',
        phase,
        ...renewal,
        checks
      }
    }

    if (remainingMs !== null && remainingMs > 5_000) {
      expiredSince = null
      return {
        status: 'healthy',
        code: 'qa_auth_renewal_current_generation_healthy',
        phase,
        generation,
        identity_hash: identity,
        remaining_ms: remainingMs,
        checks
      }
    }
    if (expiredSince === null) {
      expiredSince = timestamp
    }
    if (timestamp - expiredSince <= graceMs) {
      return {
        status: 'waiting',
        code: 'qa_auth_renewal_waiting_for_daily_rotation',
        phase,
        generation,
        identity_hash: identity,
        remaining_ms: remainingMs,
        grace_remaining_ms: Math.max(0, graceMs - (timestamp - expiredSince))
      }
    }
    return {
      status: 'blocked',
      code: 'qa_auth_renewal_not_observed_before_deadline',
      phase,
      generation,
      identity_hash: identity,
      remaining_ms: remainingMs,
      grace_ms: graceMs
    }
  }

  return {
    check,
    report() {
      return {
        status: 'passed',
        renewal_mode: 'native_daily_official_tool_refresh_observed',
        grace_ms: graceMs,
        minimum_initial_remaining_ms: minimumInitialRemainingMs,
        checks,
        renewals: [...renewals]
      }
    }
  }
}

export async function runCommandWithAuthHealthGuard({
  commandRunner,
  command,
  args = [],
  timeoutMs,
  authHealthCheck = null,
  pollIntervalMs = AUTH_RENEWAL_POLL_INTERVAL_MS,
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
} = {}) {
  if (typeof authHealthCheck !== 'function') {
    return commandRunner(command, args, { timeoutMs })
  }
  const controller = new AbortController()
  let done = false
  let failure = null
  const commandPromise = Promise.resolve().then(() =>
    commandRunner(command, args, { timeoutMs, abortSignal: controller.signal })
  )
  const monitor = (async () => {
    while (!done && !failure) {
      let result
      try {
        result = await authHealthCheck()
      } catch (error) {
        result = {
          status: 'blocked',
          code: error?.code || 'qa_auth_renewal_watchdog_exception',
          message: error?.message || String(error)
        }
      }
      if (result?.status === 'blocked') {
        failure = result
        controller.abort()
        return
      }
      if (!done) {
        await sleep(Math.max(100, Number(pollIntervalMs) || AUTH_RENEWAL_POLL_INTERVAL_MS))
      }
    }
  })()
  let result
  try {
    result = await commandPromise
  } catch (error) {
    done = true
    await monitor
    throw error
  }
  done = true
  await monitor
  if (!failure) {
    return result
  }
  return {
    ...(result || {}),
    auth_watchdog_failure: failure,
    aborted_by_auth_watchdog: true
  }
}
