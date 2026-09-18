// data_mode=unit_fake. Isolates persistence to verify authentication boundaries.
// Expected: one-use short-lived ticket agreed in task; AGENTS.md user isolation.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createSessionService } = require('../../../../cloudfunctions/agent-http/session-service.js')
function setup() {
  let now = 100000,
    active = true
  const rows = new Map()
  const store = {
    async insert(row) {
      rows.set(row.ticketHash, { ...row })
    },
    async consume(ticketHash, sessionHash, time) {
      const row = rows.get(ticketHash)
      if (!row || row.sessionHash || row.ticketExpiresAt <= time) {
        return false
      }
      row.sessionHash = sessionHash
      return true
    },
    async find(sessionHash) {
      return [...rows.values()].find(row => row.sessionHash === sessionHash)
    },
    async parentActive() {
      return active
    }
  }
  return {
    service: createSessionService(store, () => now),
    expire: () => {
      now += 61000
    },
    revoke: () => {
      active = false
    },
    rows
  }
}
test('票据只允许一次兑换，保存摘要而不是明文', async () => {
  const { service, rows } = setup()
  const ticket = await service.issue({ userId: 'alice', parentHash: 'parent' })
  assert.equal(JSON.stringify([...rows.values()]).includes(ticket), false)
  const token = await service.exchange(ticket)
  assert.equal((await service.authorize(token)).userId, 'alice')
  await assert.rejects(service.exchange(ticket))
  await assert.rejects(service.authorize(ticket))
  await assert.rejects(service.authorize('forged-token'))
})
test('过期票据拒绝兑换', async () => {
  const { service, expire } = setup()
  const ticket = await service.issue({ userId: 'alice', parentHash: 'parent' })
  expire()
  await assert.rejects(service.exchange(ticket))
})
test('父登录已撤销时网页登录立即失效', async () => {
  const { service, revoke } = setup()
  const ticket = await service.issue({ userId: 'alice', parentHash: 'parent' })
  const token = await service.exchange(ticket)
  revoke()
  await assert.rejects(service.authorize(token))
})
test('并发兑换只有一个成功', async () => {
  const { service } = setup()
  const ticket = await service.issue({ userId: 'alice', parentHash: 'parent' })
  const results = await Promise.allSettled([service.exchange(ticket), service.exchange(ticket)])
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1)
})
