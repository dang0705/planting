import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canAcceptDailyPublish,
  authOperatingMode,
  DAILY_PROFILE_PATH,
  SYSTEM_NW_BINARY,
  SYSTEM_PACKAGE_DIR,
  validateAuthConsumptionRequest,
  shouldReplaceSharedAuth
} from '../../../../../scripts/qa/qa-auth-broker-core.mjs'
import { install } from '../../../../../scripts/qa/patch-wechat-devtools-shared-auth.mjs'

const managedDaily = {
  active: true,
  managed: true,
  pids: [101],
  processes: [
    {
      pid: 101,
      command: `${SYSTEM_NW_BINARY} --remote-port 3798 --ide-http-port 9423 --user-data-dir=${DAILY_PROFILE_PATH} --package-dir=${SYSTEM_PACKAGE_DIR}`,
      process_start_identity: 'managed-start'
    }
  ]
}
const unmanagedDaily = { active: true, managed: false, pids: [202], processes: [] }

test('auth broker accepts publish only from the managed daily process', () => {
  const capabilityState = {
    schema_version: 1,
    capability: 'capability-a',
    pid: 101,
    process_start_identity: 'managed-start'
  }
  assert.equal(
    canAcceptDailyPublish({
      role: 'daily',
      dailyProcess: managedDaily,
      capability: 'capability-a',
      capabilityState
    }),
    true
  )
  assert.equal(
    canAcceptDailyPublish({
      role: 'daily',
      dailyProcess: managedDaily,
      capability: 'wrong-capability',
      capabilityState
    }),
    false
  )
  assert.equal(
    canAcceptDailyPublish({
      role: 'daily',
      dailyProcess: managedDaily,
      capability: 'capability-a',
      capabilityState: { ...capabilityState, process_start_identity: 'stale-start' }
    }),
    false
  )
  assert.equal(canAcceptDailyPublish({ role: 'daily', dailyProcess: unmanagedDaily }), false)
  assert.equal(canAcceptDailyPublish({ role: 'qa', dailyProcess: managedDaily }), false)
  assert.equal(canAcceptDailyPublish({ role: 'broker', dailyProcess: managedDaily }), false)
})

test('auth operating mode distinguishes native daily, managed daily, and QA-only refresh', () => {
  assert.equal(authOperatingMode({ active: false, managed: false }), 'qa_only_shared_refresh')
  assert.equal(authOperatingMode({ active: true, managed: false }), 'native_daily_read_only')
  assert.equal(authOperatingMode({ active: true, managed: true }), 'managed_daily_single_writer')
})

test('managed daily ownership is rooted at the immutable installed package', () => {
  assert.match(
    SYSTEM_NW_BINARY,
    /\/Applications\/wechatwebdevtools\.app\/Contents\/MacOS\/wechatdevtools$/u
  )
  assert.match(
    SYSTEM_PACKAGE_DIR,
    /\/Applications\/wechatwebdevtools\.app\/Contents\/Resources\/package\.nw$/u
  )
})

test('shared-auth patcher cannot write the installed DevTools package', () => {
  assert.throws(
    () =>
      install(
        '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/core.wxvpkg',
        '/tmp/backup'
      ),
    error => error?.code === 'qa_system_devtools_write_forbidden'
  )
})

test('auth broker never replaces a shared ticket with older material', () => {
  const previous = {
    identityHash: 'identity-a',
    newticket: 'ticket-a',
    ticketExpiredTime: 2_000,
    signatureExpiredTime: 2_000
  }
  assert.equal(
    shouldReplaceSharedAuth(previous, {
      identityHash: 'identity-a',
      newticket: 'ticket-old',
      ticketExpiredTime: 1_000,
      signatureExpiredTime: 1_000
    }),
    false
  )
  assert.equal(
    shouldReplaceSharedAuth(previous, {
      identityHash: 'identity-a',
      newticket: 'ticket-new',
      ticketExpiredTime: 3_000,
      signatureExpiredTime: 3_000
    }),
    true
  )
  assert.throws(
    () =>
      shouldReplaceSharedAuth(previous, {
        identityHash: 'identity-b',
        newticket: 'ticket-other',
        ticketExpiredTime: 3_000,
        signatureExpiredTime: 3_000
      }),
    error => error?.code === 'qa_auth_identity_mismatch'
  )
})

test('tourist placeholder may be replaced once by real login, but real identities cannot switch', () => {
  const touristPlaceholder = {
    identityHash: 'identity-tourist',
    isTourist: true,
    newticket: 'ticket-tourist',
    ticketExpiredTime: 2_000,
    signatureExpiredTime: 2_000
  }
  assert.equal(
    shouldReplaceSharedAuth(touristPlaceholder, {
      identityHash: 'identity-real',
      isTourist: false,
      newticket: 'ticket-real',
      ticketExpiredTime: 3_000,
      signatureExpiredTime: 3_000
    }),
    true
  )
  assert.throws(
    () =>
      shouldReplaceSharedAuth(
        { ...touristPlaceholder, isTourist: false },
        {
          identityHash: 'identity-real',
          isTourist: false,
          newticket: 'ticket-real',
          ticketExpiredTime: 3_000,
          signatureExpiredTime: 3_000
        }
      ),
    error => error?.code === 'qa_auth_identity_mismatch'
  )
})

test('auth broker rejects legacy or read-only publishers as writers', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /qa_auth_broker_publish_source_role_forbidden/u)
  assert.match(
    source,
    /!\['daily', 'broker_observed_daily', 'qa-auth-broker'\]\.includes\(sourceRole\)/u
  )
  assert.match(source, /publish\(value, sourceRole = null/u)
})

test('forced refresh dedupe window is bounded to one identity and one latest ticket', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /FORCED_REFRESH_DEDUPE_MS\s*=\s*5_000/u)
  assert.match(source, /lastSuccessfulRefresh\.identity_hash/u)
  assert.match(source, /existing\?\.newticket === lastSuccessfulRefresh\.newticket/u)
  assert.match(source, /existing\.newticket !== requested\.newticket/u)
  assert.match(source, /second caller must consume that ticket/u)
  assert.match(
    source,
    /Date\.now\(\) - lastSuccessfulRefresh\.refreshed_at < FORCED_REFRESH_DEDUPE_MS/u
  )
})

test('managed daily refreshes before expiry while QA remains a consumer', () => {
  const brokerSource = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
    'utf8'
  )
  const coordinatorSource = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-coordinator.mjs', import.meta.url),
    'utf8'
  )
  const patchSource = readFileSync(
    new URL('../../../../../scripts/qa/patch-wechat-devtools-shared-auth.mjs', import.meta.url),
    'utf8'
  )
  assert.match(brokerSource, /proactiveRefreshDue/u)
  assert.match(brokerSource, /Date\.now\(\) \+ 120_000/u)
  assert.match(brokerSource, /maybeProactiveManagedDailyRefresh/u)
  assert.match(brokerSource, /MANAGED_DAILY_PROACTIVE_REFRESH_WINDOW_MS\s*=\s*120_000/u)
  assert.match(brokerSource, /MANAGED_DAILY_PROACTIVE_REFRESH_RETRY_MS\s*=\s*15_000/u)
  assert.match(brokerSource, /proactive: true/u)
  assert.match(brokerSource, /qa_managed_daily_refresh_completed/u)
  assert.match(patchSource, /proactive:true/u)
  assert.match(patchSource, /__qaSharedAuthSyncDailyRuntime/u)
  assert.match(patchSource, /__qaSharedAuthRecordConsumption/u)
  assert.doesNotMatch(patchSource, /__qaSharedAuthApplyRuntimeAuth/u)
  assert.doesNotMatch(patchSource, /__qaSharedAuthConsumptionState/u)
  assert.doesNotMatch(patchSource, /lastAckAt/u)
  assert.doesNotMatch(patchSource, /lastAttemptAt/u)
  assert.match(patchSource, /setInterval\(__qaSharedAuthSyncDailyRuntime,5000\)/u)
  assert.match(patchSource, /\},15000\);/u)
  assert.match(patchSource, /if\("daily"!==__qaSharedAuthRole\)return/u)
  assert.match(coordinatorSource, /if \(state\.material_ready\) \{/u)
  assert.match(coordinatorSource, /qa_auth_broker_revalidation_pending/u)
  assert.match(coordinatorSource, /server_revalidation_required: revalidationPending/u)
  assert.match(coordinatorSource, /export function assertQaAuthMaterialReady/u)
  assert.match(brokerSource, /promoteQaServerValidationForConsumedGeneration/u)
  assert.match(brokerSource, /shared_auth_consumption_revalidated/u)
})

test('native daily DevTools cannot be proactively refreshed without a consumption-capable package', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /nativeDailyPackage/u)
  assert.match(source, /qa_managed_daily_refresh_native_owner_delegated/u)
  assert.match(source, /brokerRefreshCapableDailyPackage/u)
  assert.match(source, /qa_managed_daily_refresh_consumer_capability_unproven/u)
  assert.match(source, /Let the native daily owner refresh itself/u)
})

test('native daily DevTools is a read-only source while QA cannot refresh it', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /allowUnmanagedReadOnly/u)
  assert.match(source, /qa_auth_broker_daily_observed_read_only/u)
  assert.match(source, /qa_auth_broker_daily_observed_ticket_unavailable/u)
  assert.match(source, /rotate the server ticket behind the daily process/u)
  assert.match(source, /`force` belongs to the DevTools caller/u)
  assert.match(source, /const auth = publish\(value, 'broker_observed_daily'\)/u)
  assert.match(source, /const shared = publish\(observed, 'broker_observed_daily'\)/u)
  assert.match(source, /daily_capability:/u)
  assert.match(source, /canAcceptDailyPublish\(\{/u)
  assert.match(source, /if \(dailyState\.active && role !== 'daily'\)/u)
  assert.match(source, /only adopt a fresh observation/iu)
  assert.doesNotMatch(
    source,
    /if \(existing\?\.openid === requested\.openid && authIsFresh\(existing\)\) \{\s*return existing\s*\}/u
  )
  assert.match(source, /refreshQaAuthSync/u)
})

test('managed native daily can be observed from its current session after local storage expiry', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-daily-session-observer.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /--app-session-id/u)
  assert.match(source, /updateUserInfo/u)
  assert.match(source, /endsWith\(`-\$\{sessionId\}\.log`\)/u)
  assert.match(source, /Number\(value\.ticketExpiredTime\) > now \+ 5_000/u)
  assert.match(
    readFileSync(
      new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
      'utf8'
    ),
    /managed_daily_session_log/u
  )
})

test('auth consumption receipt has a broker-owned validation path', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-broker-core.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /AUTH_CONSUMPTION_PATH/u)
  assert.match(source, /qa_auth_consumption_process_unverified/u)
  assert.match(source, /qa_auth_consumption_material_mismatch/u)
  assert.match(source, /latest_by_role/u)
  assert.equal(typeof validateAuthConsumptionRequest, 'function')
  assert.match(source, /qa_auth_consumption_source_invalid/u)
})

test('legacy coordinator snapshots remain readable by the authoritative broker', () => {
  const source = readFileSync(
    new URL('../../../../../scripts/qa/qa-auth-coordinator.mjs', import.meta.url),
    'utf8'
  )
  assert.match(source, /previousShared\?\.writerRole === 'qa-auth-broker'/u)
  assert.match(source, /writerRole: 'qa-auth-broker'/u)
})

console.log('qa auth broker contract passed')
