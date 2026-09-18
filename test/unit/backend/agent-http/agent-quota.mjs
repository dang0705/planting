import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { buildQuotaData, createAgentQuota } = require('../../../../cloudfunctions/agent-http/agent-quota.js')

test('小青额度在达到每日阈值前提醒，达到阈值后阻断', async () => {
  const sql = []
  let used = 19
  const quota = createAgentQuota({
    env: { AGENT_CHAT_DAILY_LIMIT: '20' },
    now: () => Date.parse('2026-09-18T03:00:00.000Z'),
    models: {
      async $runSQL(statement) {
        sql.push(statement)
        if (statement.startsWith('UPDATE users')) {
          used += 1
        }
        return { data: { executeResultList: [] } }
      }
    },
    getUserWithQuota: async () => ({
      usage_chatToday: used,
      subscription_plan: 'free'
    })
  })

  const remaining = await quota.reserve({ openid: 'openid-1' })
  assert.equal(remaining.usedToday, 20)
  assert.equal(remaining.remainingToday, 0)
  assert.equal(remaining.warning, false)
  assert.match(remaining.resetAt, /^2026-09-19T00:00:00\.000Z$/)
  assert.match(sql[0], /usage_chatToday = COALESCE\(usage_chatToday, 0\) \+ 1/u)

  await assert.rejects(
    quota.reserve({ openid: 'openid-1' }),
    error => {
      assert.equal(error.code, 'AGENT_DAILY_LIMIT_EXCEEDED')
      assert.equal(error.statusCode, 429)
      assert.equal(error.data.blocked, true)
      return true
    }
  )
})

test('额度展示数据不泄露用户身份，只返回前端需要的状态', () => {
  const data = buildQuotaData({
    user: { usage_chatToday: 17, subscription_plan: 'free', _openid: 'private-openid' },
    dailyLimit: 20,
    now: Date.parse('2026-09-18T03:00:00.000Z')
  })
  assert.deepEqual(Object.keys(data).sort(), [
    'blocked',
    'dailyLimit',
    'message',
    'policy',
    'remainingToday',
    'resetAt',
    'tier',
    'unlimited',
    'usedToday',
    'warning'
  ])
  assert.equal(data.warning, true)
  assert.equal(Object.hasOwn(data, '_openid'), false)
})

test('基础会员默认保持不限，配置全等级阀门时才受统一上限约束', async () => {
  let used = 0
  const models = {
    async $runSQL(statement) {
      if (statement.startsWith('UPDATE users')) {
        used += 1
      }
      return { data: { executeResultList: [] } }
    }
  }
  const member = createAgentQuota({
    models,
    getUserWithQuota: async () => ({ usage_chatToday: used, subscription_plan: 'basic' }),
    getUserTier: user => user.subscription_plan,
    quotaConfig: { free: { chatDaily: 20 } }
  })
  const memberResult = await member.reserve({ openid: 'member-1' })
  assert.equal(memberResult.unlimited, true)
  assert.equal(used, 0)

  const capped = createAgentQuota({
    models,
    env: { AGENT_CHAT_DAILY_LIMIT: '1' },
    getUserWithQuota: async () => ({ usage_chatToday: used, subscription_plan: 'basic' }),
    getUserTier: user => user.subscription_plan,
    quotaConfig: { free: { chatDaily: 20 } }
  })
  const cappedResult = await capped.reserve({ openid: 'member-1' })
  assert.equal(cappedResult.unlimited, false)
  assert.equal(cappedResult.remainingToday, 0)
  assert.equal(used, 1)
})
