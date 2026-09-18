'use strict'
const crypto = require('node:crypto')
const digest = value => crypto.createHash('sha256').update(value).digest('hex')
const random = () => crypto.randomBytes(32).toString('base64url')
function loginError() {
  return Object.assign(new Error('登录已失效，请返回小程序重新进入小青。'), { statusCode: 401 })
}
function createSessionService(store, now = Date.now) {
  return {
    async issue({ userId, parentHash }) {
      if (!userId || !parentHash) {
        throw loginError()
      }
      const ticket = random()
      await store.insert({
        ticketHash: digest(ticket),
        userId,
        parentHash,
        ticketExpiresAt: now() + 60000,
        expiresAt: now() + 3600000
      })
      return ticket
    },
    async exchange(ticket) {
      if (!/^[\w-]{43}$/.test(ticket || '')) {
        throw loginError()
      }
      const token = random()
      if (!(await store.consume(digest(ticket), digest(token), now()))) {
        throw loginError()
      }
      await this.authorize(token)
      return token
    },
    async authorize(token) {
      if (!/^[\w-]{43}$/.test(token || '')) {
        throw loginError()
      }
      const row = await store.find(digest(token))
      if (!row || row.expiresAt <= now() || !(await store.parentActive(row, now()))) {
        throw loginError()
      }
      return row
    }
  }
}
module.exports = { createSessionService, digest }
