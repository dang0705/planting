import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'

const require = createRequire(import.meta.url)
const { createSessionStore } = require('../../../../cloudfunctions/agent-http/session-store.js')

test('Agent session SQL uses CloudBase prepared-statement null comparison', async () => {
  const statements = []
  const models = {
    async $runSQL(sql, params) {
      statements.push(sql)
      if (sql.startsWith('SELECT session_hash')) {
        return { data: { executeResultList: [{ session_hash: params.sessionHash }] } }
      }
      if (sql.includes('storage_openid')) {
        return {
          data: {
            executeResultList: [{
              user_id: 'user-row',
              storage_openid: 'wx-openid',
              platform: 'wechat_mp',
              app_id: 'wx-app'
            }]
          }
        }
      }
      return { data: { executeResultList: [] } }
    }
  }
  const store = createSessionStore(models)
  await store.consume('ticket', 'session', Date.now())
  await store.parentActive({ parentHash: 'parent', userId: 'user' }, Date.now())
  const identity = await store.resolveIdentity({ parentHash: 'parent', userId: 'user' })

  assert.equal(
    statements.some(sql => /\bIS\s+NULL\b/iu.test(sql)),
    false
  )
  assert.equal(statements.filter(sql => /<=>\s+NULL/iu.test(sql)).length, 3)
  assert.deepEqual(identity, {
    userId: 'user-row',
    openid: 'wx-openid',
    platform: 'wechat_mp',
    appId: 'wx-app'
  })
})
