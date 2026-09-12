import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import {
  findDailyAuthRecord,
  syncQaAuthFromDailyProfile
} from '../../../../../scripts/qa/bridge-wechat-devtools-auth.mjs'
import { profileFromCommand } from '../../../../../scripts/qa/qa-devtools-topology.mjs'

test('profile parsing preserves macOS paths with spaces', () => {
  const profile =
    '/Users/jay/Library/Application Support/微信开发者工具/50a7d9210159a32f006158795f893857'
  const command = `wechatdevtools --help --user-data-dir=${profile} --package-dir=/tmp/package.nw`
  assert.equal(profileFromCommand(command), profile)
})

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`)
}

function encryptOfficialStorageValue(value, key, iv) {
  const keyHash = crypto.createHash('md5').update(String(key)).digest('hex')
  const ivHash = crypto.createHash('md5').update(String(iv)).digest('hex')
  const cipher = crypto.createCipheriv(
    'aes-192-cbc',
    Buffer.from(keyHash.slice(0, 24), 'utf8'),
    Buffer.from(ivHash.slice(0, 16), 'utf8')
  )
  return Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]).toString(
    'hex'
  )
}

function fixture({ ticketExpiredTime = Date.now() + 60_000 } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-auth-isolation-'))
  const sourceProfile = path.join(root, 'daily-profile')
  const targetProfile = path.join(root, 'qa-profile')
  const authFile = 'localstorage_0123456789abcdef.json'
  const sourceData = path.join(sourceProfile, 'WeappLocalData')
  const targetData = path.join(targetProfile, 'WeappLocalData')
  const value = {
    loginStatus: 'SUCCESS',
    openid: 'openid-qa-isolation',
    signature: 'signature',
    newticket: 'ticket',
    signatureExpiredTime: Date.now() + 60 * 60 * 1000,
    ticketExpiredTime,
    nickName: 'QA',
    syncTime: Date.now()
  }
  writeJson(path.join(sourceData, authFile), value)
  writeJson(path.join(sourceData, 'hash_key_map_2.json'), { '0123456789abcdef': 'key' })
  fs.mkdirSync(targetData, { recursive: true })
  return { root, sourceProfile, targetProfile, authFile, value }
}

test('normal daily-to-QA bridge never refreshes the shared account ticket', () => {
  const context = fixture({ ticketExpiredTime: Date.now() + 1_000 })
  assert.throws(
    () =>
      syncQaAuthFromDailyProfile({
        sourceProfile: context.sourceProfile,
        targetProfile: context.targetProfile,
        sharedAuthRoot: path.join(context.root, 'shared'),
        requireFresh: false,
        forceRefresh: false,
        allowOfficialRefresh: false
      }),
    error => error?.code === 'qa_daily_auth_ticket_refresh_required'
  )
  assert.equal(
    fs.existsSync(path.join(context.targetProfile, 'WeappLocalData', context.authFile)),
    false
  )
})

test('normal daily-to-QA bridge copies a fresh persisted ticket without changing it', () => {
  const context = fixture()
  const result = syncQaAuthFromDailyProfile({
    sourceProfile: context.sourceProfile,
    targetProfile: context.targetProfile,
    sharedAuthRoot: path.join(context.root, 'shared'),
    requireFresh: true,
    forceRefresh: false,
    allowOfficialRefresh: false
  })
  const target = JSON.parse(
    fs.readFileSync(
      path.join(context.targetProfile, 'WeappLocalData', result.target_auth_file),
      'utf8'
    )
  )
  assert.equal(result.ticket_refreshed, false)
  assert.equal(target.newticket, context.value.newticket)
  assert.equal(target.ticketExpiredTime, context.value.ticketExpiredTime)
})

test('Nightly aggregate userInfo is parsed from its official encrypted storage envelope', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-auth-official-storage-'))
  const profile = path.join(root, 'daily-profile')
  const localData = path.join(profile, 'WeappLocalData')
  const key = 'fixture-storage-key'
  const iv = 'fixture-storage-iv'
  const value = {
    loginStatus: 'SUCCESS',
    openid: 'openid-official-storage',
    signature: 'signature',
    newticket: 'ticket',
    signatureExpiredTime: Date.now() + 60 * 60 * 1000,
    ticketExpiredTime: Date.now() + 60 * 60 * 1000,
    nickName: 'QA',
    isTourist: false
  }

  writeJson(path.join(localData, 'hash_key_map_2.json'), {
    '0123456789abcdef': 'userInfo'
  })
  writeJson(path.join(localData, 'ls_encrypt_secret.json'), {
    v: 2,
    method: 'plain',
    data: JSON.stringify({ k: key, i: iv })
  })
  fs.mkdirSync(localData, { recursive: true })
  fs.writeFileSync(
    path.join(localData, 'ls_0123456789abcdef.json'),
    `${encryptOfficialStorageValue(value, key, iv)}\n`
  )

  const record = findDailyAuthRecord(profile)
  assert.equal(record.storageFormat, 'official_encrypted')
  assert.equal(record.storageKey, 'userInfo')
  assert.equal(record.value.openid, value.openid)
  assert.equal(record.value.isTourist, false)
})
