'use strict'

const DEFAULT_DAILY_LIMIT = 20
const WARNING_REMAINING_RATIO = 0.2

function positiveInteger(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nextQuotaReset(value) {
  const current = new Date(value)
  const nextDayUtc = Date.UTC(
    current.getUTCFullYear(),
    current.getUTCMonth(),
    current.getUTCDate() + 1
  )
  return new Date(nextDayUtc).toISOString()
}

function buildQuotaData({ user, dailyLimit, now, blocked = false }) {
  const unlimited = dailyLimit < 0
  const usedToday = Math.max(0, Number(user?.usage_chatToday || 0))
  const remainingToday = unlimited ? null : Math.max(0, dailyLimit - usedToday)
  const warningRemaining = unlimited ? 0 : Math.max(1, Math.ceil(dailyLimit * WARNING_REMAINING_RATIO))
  const warning = !blocked && !unlimited && remainingToday > 0 && remainingToday <= warningRemaining
  return {
    tier: String(user?.subscription_plan || 'free'),
    policy: 'daily_turns',
    usedToday,
    dailyLimit,
    remainingToday,
    unlimited,
    warning,
    blocked,
    // usage_lastResetDate in the shared quota reader uses the UTC calendar day.
    resetAt: nextQuotaReset(now),
    message: blocked
      ? '今天的小青额度已用完，明天再来继续聊天。'
      : warning
        ? `今天还可以和小青聊 ${remainingToday} 轮。`
        : ''
  }
}

function quotaError(data) {
  return Object.assign(new Error(data.message), {
    statusCode: 429,
    code: 'AGENT_DAILY_LIMIT_EXCEEDED',
    data
  })
}

function createAgentQuota({
  models,
  getUserWithQuota,
  getUserTier = user => (user?.subscription_plan === 'free' ? 'free' : 'basic'),
  quotaConfig = { free: { chatDaily: DEFAULT_DAILY_LIMIT } },
  env = process.env,
  now = () => Date.now()
}) {
  if (!models || typeof models.$runSQL !== 'function') {
    throw new Error('小青额度服务缺少数据库模型。')
  }
  if (typeof getUserWithQuota !== 'function') {
    throw new Error('小青额度服务缺少用户配额读取器。')
  }

  const globalDailyLimit = positiveInteger(env.AGENT_CHAT_DAILY_LIMIT, 0)
  const userLocks = new Map()

  async function withUserLock(openid, callback) {
    const key = String(openid || '').trim()
    const previous = userLocks.get(key) || Promise.resolve()
    let release
    const current = new Promise(resolve => {
      release = resolve
    })
    const chain = previous.then(() => current)
    userLocks.set(key, chain)
    await previous
    try {
      return await callback()
    } finally {
      release()
      if (userLocks.get(key) === chain) {
        userLocks.delete(key)
      }
    }
  }

  async function reserve(identity) {
    const openid = String(identity?.openid || '').trim()
    if (!openid) {
      throw Object.assign(new Error('小青用户额度身份不可用。'), { statusCode: 503 })
    }

    return withUserLock(openid, async () => {
      const timestamp = now()
      const userBefore = await getUserWithQuota(openid)
      if (!userBefore) {
        throw Object.assign(new Error('用户不存在，请重新登录。'), { statusCode: 401 })
      }
      const tier = getUserTier(userBefore)
      const configuredFreeLimit = positiveInteger(
        quotaConfig?.free?.chatDaily,
        DEFAULT_DAILY_LIMIT
      )
      const dailyLimit = globalDailyLimit || (tier === 'free' ? configuredFreeLimit : -1)
      const before = buildQuotaData({ user: userBefore, dailyLimit, now: timestamp })
      if (before.unlimited) {
        return before
      }
      if (before.usedToday >= dailyLimit) {
        throw quotaError({
          ...before,
          blocked: true,
          message: '今天的小青额度已用完，明天再来继续聊天。'
        })
      }

      // 条件 UPDATE 是后端硬阀门；前端的禁用状态不能替代它。
      await models.$runSQL(
        `UPDATE users
         SET usage_chatToday = COALESCE(usage_chatToday, 0) + 1,
             usage_chatTotal = COALESCE(usage_chatTotal, 0) + 1,
             updatedAt = {{now}}
         WHERE _openid = {{openid}}
           AND COALESCE(usage_chatToday, 0) < {{dailyLimit}}`,
        { openid, dailyLimit, now: timestamp }
      )

      const userAfter = await getUserWithQuota(openid)
      if (!userAfter) {
        throw Object.assign(new Error('小青额度状态读取失败。'), { statusCode: 503 })
      }
      const after = buildQuotaData({ user: userAfter, dailyLimit, now: timestamp })
      if (after.usedToday <= before.usedToday || after.usedToday > dailyLimit) {
        throw quotaError({
          ...after,
          blocked: true,
          message: '今天的小青额度已用完，明天再来继续聊天。'
        })
      }
      return after
    })
  }

  return { dailyLimit: globalDailyLimit || null, reserve }
}

module.exports = {
  DEFAULT_DAILY_LIMIT,
  buildQuotaData,
  createAgentQuota,
  nextQuotaReset
}
