import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import test from 'node:test'

import { buildInstalledNativeDevToolsArgs } from '../../../../../scripts/qa/devtools-native-launch.mjs'
import {
  QA_NATIVE_AUTH_DEBUG_PORT,
  buildNativeAuthSyncExpression
} from '../../../../../scripts/qa/devtools-native-auth-bridge.mjs'

const identityHash = crypto.createHash('sha256').update('contract-openid').digest('hex')
const auth = {
  openid: 'contract-openid',
  signature: 'contract-signature',
  newticket: 'contract-ticket',
  identityHash,
  authGeneration: 7
}

test('native DevTools auth uses one-token browser debug port and dynamic auth module discovery', () => {
  const args = buildInstalledNativeDevToolsArgs({
    servicePort: 3799,
    controlPort: 9422,
    userDataDir: '/tmp/planting-qa-profile',
    appSessionId: 'native-auth-contract',
    browserDebugPort: QA_NATIVE_AUTH_DEBUG_PORT
  })
  assert.ok(args.includes('--remote-debugging-port=9424'))
  assert.ok(
    !args.some((value, index) => value === '--remote-debugging-port' && args[index + 1] === '9424')
  )
  const expression = buildNativeAuthSyncExpression(auth)
  assert.ok(expression.includes('Object.keys(require.cache || {})'))
  assert.match(expression, /getUserInfo/u)
  assert.match(expression, /updateUserInfo/u)
  assert.match(expression, /userInfoKeys/u)
})

test('native auth bridge rejects an identity that does not match openid', () => {
  assert.throws(
    () => buildNativeAuthSyncExpression({ ...auth, identityHash: '0'.repeat(64) }),
    error => error?.code === 'qa_native_auth_identity_invalid'
  )
})

test('QA launch paths cannot silently omit the native auth bridge', () => {
  const directLaunchSource = fs.readFileSync(
    new URL(
      '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/test-owned-devtools-launch.mjs',
      import.meta.url
    ),
    'utf8'
  )
  const managedLaunchSource = fs.readFileSync(
    new URL('../../../../../scripts/qa/launch-wechat-devtools.mjs', import.meta.url),
    'utf8'
  )
  assert.match(directLaunchSource, /syncNativeAuthRuntime/u)
  assert.match(directLaunchSource, /QA_NATIVE_AUTH_DEBUG_PORT/u)
  assert.match(managedLaunchSource, /syncNativeAuthRuntime/u)
  assert.match(managedLaunchSource, /QA_NATIVE_AUTH_DEBUG_PORT/u)
})

test('native auth consumption uses the broker snapshot instead of stale profile JSON', () => {
  const supervisorSource = fs.readFileSync(
    new URL('../../../../../scripts/qa/qa-supervisor-client.mjs', import.meta.url),
    'utf8'
  )
  assert.match(supervisorSource, /import \{ currentShared, requestUnix \} from/u)
  assert.match(supervisorSource, /const shared = currentShared\(\)/u)
  assert.match(supervisorSource, /qa_auth_native_shared_material_not_current/u)
  assert.doesNotMatch(supervisorSource, /readProfileAuthValue\(session\.profile\)/u)
})

test('fresh QA appservice attachment has a bounded login page-probe window', () => {
  const supervisorSource = fs.readFileSync(
    new URL('../../../../../scripts/qa/qa-supervisor-client.mjs', import.meta.url),
    'utf8'
  )
  assert.match(supervisorSource, /const APP_AUTH_PAGE_PROBE_TIMEOUT_MS = 15_000/u)
  assert.match(supervisorSource, /APP_AUTH_PAGE_PROBE_TIMEOUT_MS,\n\s*'currentPage'/u)
  assert.match(supervisorSource, /APP_AUTH_PAGE_PROBE_TIMEOUT_MS,\n\s*'pageStack'/u)
})

test('formal sessions reject authentication-generation drift before runtime reuse', () => {
  const supervisorSource = fs.readFileSync(
    new URL('../../../../../scripts/qa/qa-supervisor-client.mjs', import.meta.url),
    'utf8'
  )
  assert.match(supervisorSource, /qa_supervisor_auth_generation_drift/u)
  assert.match(supervisorSource, /qa_runtime_auth_generation_drift/u)
  assert.match(supervisorSource, /authGeneration !== stateAuthGeneration/u)
  assert.match(supervisorSource, /sharedAuthGeneration !== authGeneration/u)
  assert.match(supervisorSource, /Number\(manifest\.auth_generation\) !== authGeneration/u)
})
