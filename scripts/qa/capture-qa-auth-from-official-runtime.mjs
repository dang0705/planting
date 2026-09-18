#!/usr/bin/env node

import fs from 'node:fs'
import crypto from 'node:crypto'
import os from 'node:os'
import path from 'node:path'

import automator from 'miniprogram-automator'
import { qaAuthProfiles, syncQaAuthFromProfile } from './qa-auth-coordinator.mjs'

const QA_AUTOMATOR_ENDPOINT = 'ws://127.0.0.1:9421'
const QA_SHARED_AUTH_PATH = path.join(
  os.homedir(),
  '.planting',
  'automator-qa',
  'v3',
  'auth',
  'shared.json'
)

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function fail(code, message) {
  const error = new Error(message || code)
  error.code = code
  return error
}

function readSharedAuth() {
  try {
    return JSON.parse(fs.readFileSync(QA_SHARED_AUTH_PATH, 'utf8'))
  } catch {
    throw fail('qa_official_auth_identity_unavailable', 'QA 现有身份材料不可用')
  }
}

function assertPinnedIdentity(value) {
  if (
    !value?.openid ||
    !value?.signature ||
    value.identityHash !== sha256(value.openid) ||
    !Number.isFinite(Number(value.signatureExpiredTime)) ||
    Number(value.signatureExpiredTime) <= Date.now() + 5000
  ) {
    throw fail('qa_official_auth_identity_unavailable', 'QA 现有身份材料已失效，不能接管票据')
  }
}

async function capture() {
  const profiles = qaAuthProfiles()
  const base = readSharedAuth()
  assertPinnedIdentity(base)

  let miniProgram = null
  try {
    miniProgram = await automator.connect({ wsEndpoint: QA_AUTOMATOR_ENDPOINT })
    const ticket = await miniProgram.getTicket()
    if (
      typeof ticket?.ticket !== 'string' ||
      !ticket.ticket ||
      !Number.isFinite(Number(ticket.expiredTime)) ||
      Number(ticket.expiredTime) <= Date.now() + 5000
    ) {
      throw fail('qa_official_auth_ticket_unavailable', '官方 Automator 未返回有效 QA 票据')
    }
    const adopted = syncQaAuthFromProfile({
      profile: profiles.qa,
      fallbackAuthValue: {
        ...base,
        loginStatus: 'SUCCESS',
        newticket: ticket.ticket,
        ticketExpiredTime: Number(ticket.expiredTime),
        syncTime: Date.now()
      }
    })
    const manifest = adopted?.manifest || {}
    return {
      status: 'ready',
      code: 'qa_official_auth_captured',
      auth_generation: manifest.auth_generation || null,
      ticket_expired_at: manifest.ticket_expired_at || null,
      identity_hash: manifest.identity_hash || null,
      source: 'official_automator_get_ticket',
      profile: profiles.qa
    }
  } finally {
    try {
      miniProgram?.disconnect?.()
    } catch {
      // The official Automator connection is best-effort cleanup only.
    }
  }
}

capture()
  .then(value => process.stdout.write(`${JSON.stringify(value)}\n`))
  .catch(error => {
    process.stdout.write(
      `${JSON.stringify({
        status: 'blocked',
        code: error.code || 'qa_official_auth_capture_failed',
        message: error.message
      })}\n`
    )
    process.exitCode = 1
  })
