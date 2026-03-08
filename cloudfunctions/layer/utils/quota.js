/**
 * 用户配额管理工具
 * 根据 tiers.csv 实现三级用户体系：
 * - free: 诊断3次/天, 聊天5次/天, 月上限90次诊断
 * - basic: 无限诊断+聊天
 * - premium: 无限 + 优先队列
 */

const cloudbase = require('./cloudbase');

// 配额配置
const QUOTA_CONFIG = {
  free: {
    diagnoseDaily: -1,  // 不限制每日次数
    identifyDaily: -1,  // 识别和诊断共享月度配额
    chatDaily: -1,      // 不限制聊天
    diagnoseMonthly: 5  // 每月 5 次免费诊断（产品定义）
  },
  basic: {
    diagnoseDaily: -1,  // -1 表示无限
    identifyDaily: -1,
    chatDaily: -1,
    diagnoseMonthly: -1
  },
  premium: {
    diagnoseDaily: -1,
    identifyDaily: -1,
    chatDaily: -1,
    diagnoseMonthly: -1,
    priority: true  // 优先队列
  }
};

/**
 * 获取用户信息和配额状态
 */
async function getUserWithQuota(openid) {
  const sql = `
    SELECT * FROM users
    WHERE _openid = {{openid}}
    LIMIT 1
  `;

  const result = await cloudbase.models.$runSQL(sql, { openid });
  const users = result?.data?.executeResultList || [];

  if (users.length === 0) {
    return null;
  }

  const user = users[0];
  const now = Date.now();
  const today = new Date().toISOString().split('T')[0];
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  // 检查是否需要重置每日配额
  const lastResetDate = user.usage_lastResetDate
    ? new Date(user.usage_lastResetDate).toISOString().split('T')[0]
    : null;

  if (lastResetDate !== today) {
    // 重置每日配额
    const resetSql = `
      UPDATE users
      SET usage_diagnoseToday = 0,
          usage_identifyToday = 0,
          usage_chatToday = 0,
          usage_lastResetDate = {{now}},
          updatedAt = {{now}}
      WHERE _openid = {{openid}}
    `;
    await cloudbase.models.$runSQL(resetSql, { openid, now });

    user.usage_diagnoseToday = 0;
    user.usage_identifyToday = 0;
    user.usage_chatToday = 0;
    user.usage_lastResetDate = now;
  }

  // 检查是否需要重置月度配额
  const lastMonthReset = user.usage_lastMonthReset
    ? new Date(user.usage_lastMonthReset).toISOString().slice(0, 7)
    : null;

  if (lastMonthReset !== currentMonth) {
    const resetMonthSql = `
      UPDATE users
      SET usage_diagnoseMonth = 0,
          usage_lastMonthReset = {{now}},
          updatedAt = {{now}}
      WHERE _openid = {{openid}}
    `;
    await cloudbase.models.$runSQL(resetMonthSql, { openid, now });

    user.usage_diagnoseMonth = 0;
    user.usage_lastMonthReset = now;
  }

  return user;
}

/**
 * 获取用户等级
 */
function getUserTier(user) {
  if (!user) return 'free';

  const plan = user.subscription_plan || 'free';
  const status = user.subscription_status || 'inactive';
  const endDate = user.subscription_endDate;
  const now = Date.now();

  // 检查订阅是否有效
  if (plan !== 'free' && status === 'active') {
    if (!endDate || endDate > now) {
      return plan; // 'basic' or 'premium'
    }
  }

  return 'free';
}

/**
 * 检查诊断/识别配额
 * @param {string} openid 用户 openid
 * @param {string} type 'diagnose' | 'identify'
 */
async function checkAIQuota(openid, type = 'diagnose') {
  const user = await getUserWithQuota(openid);

  if (!user) {
    return {
      allowed: false,
      code: 401,
      message: '用户不存在，请先登录',
      data: null
    };
  }

  const tier = getUserTier(user);
  const config = QUOTA_CONFIG[tier];

  // 付费用户无限制
  if (tier !== 'free') {
    return {
      allowed: true,
      code: 200,
      message: '配额充足',
      data: {
        tier,
        unlimited: true,
        usedToday: type === 'diagnose' ? user.usage_diagnoseToday : user.usage_identifyToday,
        usedMonth: user.usage_diagnoseMonth || 0,
        priority: tier === 'premium'
      }
    };
  }

  // 免费用户检查配额（仅检查月度配额）
  const usedMonth = user.usage_diagnoseMonth || 0;
  const monthlyLimit = config.diagnoseMonthly;

  // 检查月度配额
  if (usedMonth >= monthlyLimit) {
    return {
      allowed: false,
      code: 403,
      message: `本月${type === 'diagnose' ? '诊断' : '识别'}次数已用完（${monthlyLimit}次/月），升级会员可无限使用`,
      data: {
        tier,
        usedMonth,
        monthlyLimit
      }
    };
  }

  return {
    allowed: true,
    code: 200,
    message: '配额充足',
    data: {
      tier,
      usedMonth,
      monthlyLimit,
      remainingMonth: monthlyLimit - usedMonth
    }
  };
}

/**
 * 检查聊天配额
 */
async function checkChatQuota(openid) {
  const user = await getUserWithQuota(openid);

  if (!user) {
    return {
      allowed: false,
      code: 401,
      message: '用户不存在，请先登录',
      data: null
    };
  }

  const tier = getUserTier(user);
  const config = QUOTA_CONFIG[tier];

  // 付费用户无限制
  if (tier !== 'free') {
    return {
      allowed: true,
      code: 200,
      message: '配额充足',
      data: {
        tier,
        unlimited: true,
        usedToday: user.usage_chatToday || 0
      }
    };
  }

  // 免费用户检查配额
  const usedToday = user.usage_chatToday || 0;
  const dailyLimit = config.chatDaily;

  if (usedToday >= dailyLimit) {
    return {
      allowed: false,
      code: 403,
      message: `今日聊天次数已用完（${dailyLimit}次/天），升级会员可无限使用`,
      data: {
        tier,
        usedToday,
        dailyLimit
      }
    };
  }

  return {
    allowed: true,
    code: 200,
    message: '配额充足',
    data: {
      tier,
      usedToday,
      dailyLimit,
      remainingToday: dailyLimit - usedToday
    }
  };
}

/**
 * 扣除配额
 * @param {string} openid 用户 openid
 * @param {string} type 'diagnose' | 'identify' | 'chat'
 */
async function deductQuota(openid, type = 'diagnose') {
  const now = Date.now();

  let updateField;
  switch (type) {
    case 'diagnose':
      updateField = 'usage_diagnoseToday = usage_diagnoseToday + 1, usage_diagnoseTotal = usage_diagnoseTotal + 1, usage_diagnoseMonth = usage_diagnoseMonth + 1';
      break;
    case 'identify':
      updateField = 'usage_identifyToday = usage_identifyToday + 1, usage_identifyTotal = usage_identifyTotal + 1';
      break;
    case 'chat':
      updateField = 'usage_chatToday = usage_chatToday + 1, usage_chatTotal = usage_chatTotal + 1';
      break;
    default:
      throw new Error('Invalid quota type');
  }

  const sql = `
    UPDATE users
    SET ${updateField},
        updatedAt = {{now}}
    WHERE _openid = {{openid}}
  `;

  await cloudbase.models.$runSQL(sql, { openid, now });
}

/**
 * 获取用户配额概览（用于前端显示）
 */
async function getQuotaOverview(openid) {
  const user = await getUserWithQuota(openid);

  if (!user) {
    return null;
  }

  const tier = getUserTier(user);
  const config = QUOTA_CONFIG[tier];

  return {
    tier,
    tierName: tier === 'free' ? '免费用户' : tier === 'basic' ? '基础会员' : '高级会员',
    unlimited: tier !== 'free',
    diagnose: {
      usedToday: user.usage_diagnoseToday || 0,
      dailyLimit: config.diagnoseDaily,
      usedMonth: user.usage_diagnoseMonth || 0,
      monthlyLimit: config.diagnoseMonthly
    },
    identify: {
      usedToday: user.usage_identifyToday || 0,
      dailyLimit: config.identifyDaily
    },
    chat: {
      usedToday: user.usage_chatToday || 0,
      dailyLimit: config.chatDaily
    },
    subscription: {
      plan: user.subscription_plan,
      status: user.subscription_status,
      endDate: user.subscription_endDate
    }
  };
}

module.exports = {
  QUOTA_CONFIG,
  getUserWithQuota,
  getUserTier,
  checkAIQuota,
  checkChatQuota,
  deductQuota,
  getQuotaOverview
};
