/* oxlint-disable no-console, no-magic-numbers -- This source contract uses fixed hash fixtures. */
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  javaStringHash,
  inspectFreshQaAppSession,
  projectStorageId,
  reconcileQaAppSessionPartitions,
  syncQaAppSessionFromDailyReadOnly
} from '../../../../../scripts/qa/qa-app-auth-coordinator.mjs'

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`)
}

function storageEnvelope({ user, session, extra = {} }) {
  return {
    0: {
      preserved: { data: JSON.stringify(extra), dataType: 'String' },
      user: { data: JSON.stringify(user), dataType: 'String' },
      'planting-platform-session': { data: JSON.stringify(session), dataType: 'String' }
    },
    2: {},
    3: {}
  }
}

function testContext() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-app-auth-coordinator-'))
  const dailyProfile = path.join(root, 'daily')
  const qaProfileRoot = path.join(root, '.planting', 'qa-devtools-home')
  const qaProfile = path.join(qaProfileRoot, 'profile')
  const qaRuntimeRoot = path.join(root, '.planting', 'automator-qa', 'v3', 'runtimes')
  const sourceProjectPath = path.join(root, 'source', 'dist', 'dev', 'mp-weixin')
  const targetProjectPath = path.join(
    qaRuntimeRoot,
    '0123456789abcdef0123456789abcdef',
    'mp-weixin'
  )
  const user = {
    userId: 'user-1',
    openid: 'openid-1',
    token: 'token-1',
    isLoggedIn: true
  }
  const session = { accessToken: 'token-1', expiresAt: Date.now() + 60_000 }
  fs.mkdirSync(qaProfile, { recursive: true })
  return {
    root,
    dailyProfile,
    qaProfile,
    qaProfileRoot,
    qaRuntimeRoot,
    sourceProjectPath,
    targetProjectPath,
    user,
    session
  }
}

function storagePath(profile, projectPath, suffix) {
  return path.join(
    profile,
    'WeappSimulator',
    'WeappStorage',
    `storage_${projectStorageId(projectPath)}${suffix}.json`
  )
}

test('project storage id follows DevTools Java hash convention', () => {
  assert.equal(javaStringHash('abc'), 96354)
  assert.equal(
    projectStorageId('/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin'),
    '1542004252'
  )
})

test('read-only app session bridge copies auth fields and preserves QA data', () => {
  const context = testContext()
  const suffix = '_test-account'
  writeJson(
    storagePath(context.dailyProfile, context.sourceProjectPath, suffix),
    storageEnvelope({ user: context.user, session: context.session, extra: { source: true } })
  )
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, suffix),
    storageEnvelope({
      user: { userId: 'old', openid: 'old', token: 'old', isLoggedIn: false },
      session: { accessToken: 'old', expiresAt: 0 },
      extra: { qaOnly: true }
    })
  )
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, '_'),
    storageEnvelope({
      user: { userId: '', openid: '', token: '', isLoggedIn: false },
      session: { accessToken: '', expiresAt: 0 },
      extra: { defaultPartition: true }
    })
  )

  const result = syncQaAppSessionFromDailyReadOnly({
    dailyProfile: context.dailyProfile,
    qaProfile: context.qaProfile,
    sourceProjectPath: context.sourceProjectPath,
    targetProjectPath: context.targetProjectPath,
    qaProfileRoot: context.qaProfileRoot,
    qaRuntimeRoot: context.qaRuntimeRoot
  })
  const target = JSON.parse(
    fs.readFileSync(storagePath(context.qaProfile, context.targetProjectPath, suffix), 'utf8')
  )
  assert.equal(result.code, 'qa_app_auth_bridged_from_daily_read_only')
  assert.equal(result.partition_sync.updated_target_count, 1)
  assert.deepEqual(JSON.parse(target['0'].user.data), context.user)
  assert.deepEqual(JSON.parse(target['0']['planting-platform-session'].data), context.session)
  assert.deepEqual(JSON.parse(target['0'].preserved.data), { qaOnly: true })
  const defaultPartition = JSON.parse(
    fs.readFileSync(storagePath(context.qaProfile, context.targetProjectPath, '_'), 'utf8')
  )
  assert.deepEqual(JSON.parse(defaultPartition['0'].user.data), context.user)
  assert.deepEqual(
    JSON.parse(defaultPartition['0']['planting-platform-session'].data),
    context.session
  )
  assert.deepEqual(JSON.parse(defaultPartition['0'].preserved.data), { defaultPartition: true })
})

test('bridge rejects an expired or mismatched daily app session', () => {
  const context = testContext()
  writeJson(
    storagePath(context.dailyProfile, context.sourceProjectPath, '_test-account'),
    storageEnvelope({
      user: { ...context.user, token: 'different-token' },
      session: { accessToken: 'different-token', expiresAt: Date.now() - 1 }
    })
  )
  assert.throws(
    () =>
      syncQaAppSessionFromDailyReadOnly({
        dailyProfile: context.dailyProfile,
        qaProfile: context.qaProfile,
        sourceProjectPath: context.sourceProjectPath,
        targetProjectPath: context.targetProjectPath,
        qaProfileRoot: context.qaProfileRoot,
        qaRuntimeRoot: context.qaRuntimeRoot
      }),
    error => error?.code === 'qa_app_auth_source_unavailable'
  )
})

test('bridge reports a fresh session from another identity explicitly', () => {
  const context = testContext()
  writeJson(
    storagePath(context.dailyProfile, context.sourceProjectPath, '_test-account'),
    storageEnvelope({ user: context.user, session: context.session })
  )
  assert.throws(
    () =>
      syncQaAppSessionFromDailyReadOnly({
        dailyProfile: context.dailyProfile,
        qaProfile: context.qaProfile,
        sourceProjectPath: context.sourceProjectPath,
        targetProjectPath: context.targetProjectPath,
        expectedIdentityHash: '0'.repeat(64),
        qaProfileRoot: context.qaProfileRoot,
        qaRuntimeRoot: context.qaRuntimeRoot
      }),
    error => error?.code === 'qa_app_auth_identity_mismatch'
  )
})

test('inspect accepts a fresh matching QA session without exposing credentials', () => {
  const context = testContext()
  const suffix = '_qa-enrolled'
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, suffix),
    storageEnvelope({ user: context.user, session: context.session })
  )
  const identityHash = crypto.createHash('sha256').update(context.user.openid).digest('hex')

  const result = inspectFreshQaAppSession({
    profile: context.qaProfile,
    storageId: projectStorageId(context.targetProjectPath),
    expectedIdentityHash: identityHash
  })

  assert.equal(result.status, 'ready')
  assert.equal(
    result.file_name,
    `storage_${projectStorageId(context.targetProjectPath)}${suffix}.json`
  )
  assert.equal(result.partition_count, 1)
  assert.equal(result.identity_hash, identityHash)
  assert.equal('token' in result, false)
  assert.equal('accessToken' in result, false)
})

test('inspect treats mirrored QA partitions for the same enrolled session as one session', () => {
  const context = testContext()
  const firstSuffix = '_first'
  const secondSuffix = '_second'
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, firstSuffix),
    storageEnvelope({ user: context.user, session: context.session })
  )
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, secondSuffix),
    storageEnvelope({ user: context.user, session: context.session })
  )

  const result = inspectFreshQaAppSession({
    profile: context.qaProfile,
    storageId: projectStorageId(context.targetProjectPath)
  })

  assert.equal(result.status, 'ready')
  assert.equal(result.partition_count, 2)
})

test('QA partition reconciliation copies only the enrolled QA app session into empty partitions', () => {
  const context = testContext()
  const sourceSuffix = '_enrolled'
  const emptySuffix = '_new-simulator-user'
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, sourceSuffix),
    storageEnvelope({ user: context.user, session: context.session, extra: { sourceOnly: true } })
  )
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, emptySuffix),
    storageEnvelope({
      user: { userId: '', openid: '', token: '', isLoggedIn: false },
      session: { accessToken: '', expiresAt: 0 },
      extra: { partitionOnly: true }
    })
  )

  const result = reconcileQaAppSessionPartitions({
    profile: context.qaProfile,
    storageId: projectStorageId(context.targetProjectPath),
    qaProfileRoot: context.qaProfileRoot
  })
  const target = JSON.parse(
    fs.readFileSync(storagePath(context.qaProfile, context.targetProjectPath, emptySuffix), 'utf8')
  )

  assert.equal(result.status, 'ready')
  assert.equal(result.code, 'qa_app_auth_qa_partitions_reconciled')
  assert.equal(result.updated_target_count, 1)
  assert.deepEqual(JSON.parse(target['0'].user.data), context.user)
  assert.deepEqual(JSON.parse(target['0']['planting-platform-session'].data), context.session)
  assert.deepEqual(JSON.parse(target['0'].preserved.data), { partitionOnly: true })
  assert.equal('token' in result, false)
  assert.equal('accessToken' in result, false)
})

test('QA partition reconciliation does not overwrite a conflicting identity', () => {
  const context = testContext()
  const sourceSuffix = '_enrolled'
  const conflictingSuffix = '_another-user'
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, sourceSuffix),
    storageEnvelope({ user: context.user, session: context.session })
  )
  writeJson(
    storagePath(context.qaProfile, context.targetProjectPath, conflictingSuffix),
    storageEnvelope({
      user: { userId: 'user-2', openid: 'openid-2', token: '', isLoggedIn: false },
      session: { accessToken: '', expiresAt: 0 }
    })
  )

  const result = reconcileQaAppSessionPartitions({
    profile: context.qaProfile,
    storageId: projectStorageId(context.targetProjectPath),
    qaProfileRoot: context.qaProfileRoot
  })
  const target = JSON.parse(
    fs.readFileSync(
      storagePath(context.qaProfile, context.targetProjectPath, conflictingSuffix),
      'utf8'
    )
  )

  assert.equal(result.updated_target_count, 0)
  assert.equal(result.skipped_conflicting_target_count, 1)
  assert.equal(JSON.parse(target['0'].user.data).openid, 'openid-2')
})

console.log(
  'qa app auth coordinator contracts passed data_mode=unit_fake test_kind=source_contract'
)
