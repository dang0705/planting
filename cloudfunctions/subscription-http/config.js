'use strict'

const crypto = require('crypto')

const MAX_PLAN_ID_LENGTH = 64
const MAX_DESCRIPTION_BYTES = 127
const DEFAULT_SUBSCRIPTION_PLANS = [
  {
    id: 'free',
    plan: 'free',
    name: '免费用户',
    description: '基础植物记录功能',
    amountFen: 0,
    durationDays: 0,
    currency: 'CNY'
  },
  {
    id: 'premium_30d',
    plan: 'premium',
    name: 'MVP 会员 30 天',
    description: '解锁青花植 MVP 全部高阶功能',
    amountFen: 1,
    durationDays: 30,
    currency: 'CNY'
  }
]

function createConfigError(message, code = 'SUBSCRIPTION_CONFIG_INVALID') {
  const error = new Error(message)
  error.code = code
  error.statusCode = 503
  return error
}

function readFirstEnv(env, keys) {
  for (const key of keys) {
    const value = String(env[key] || '').trim()
    if (value) {
      return value
    }
  }
  return ''
}

function normalizePem(value) {
  const normalized = String(value || '')
    .trim()
    .replaceAll('\\n', '\n')

  const pemMatch = normalized.match(
    /-----BEGIN ([^-]+)-----([\s\S]*?)-----END \1-----/
  )
  if (!pemMatch) {
    return normalized
  }

  const body = pemMatch[2].replace(/\s+/g, '')
  const bodyLines = body.match(/.{1,64}/g) || []
  return `-----BEGIN ${pemMatch[1]}-----\n${bodyLines.join('\n')}\n-----END ${pemMatch[1]}-----`
}

function decodePem(value) {
  const normalized = normalizePem(value)
  if (!normalized) {
    return ''
  }
  if (normalized.includes('-----BEGIN')) {
    return normalized
  }
  try {
    const decoded = Buffer.from(normalized, 'base64').toString('utf8')
    return decoded.includes('-----BEGIN') ? normalizePem(decoded) : normalized
  } catch {
    return normalized
  }
}

function parsePlans(rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) {
    return DEFAULT_SUBSCRIPTION_PLANS.map(plan => ({ ...plan }))
  }

  let parsed
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw createConfigError('订阅套餐配置不是有效 JSON', 'SUBSCRIPTION_PLANS_INVALID')
  }

  const source = Array.isArray(parsed) ? parsed : parsed?.plans
  if (!Array.isArray(source) || source.length === 0) {
    throw createConfigError('订阅套餐配置不能为空', 'SUBSCRIPTION_PLANS_INVALID')
  }

  const plans = source.map((item, index) => {
    const id = String(item?.id || item?.planId || '').trim()
    const plan = String(item?.plan || item?.type || 'premium')
      .trim()
      .toLowerCase()
    const name = String(item?.name || '').trim()
    const description = String(item?.description || name).trim()
    const amountFen = Number(
      item?.amountFen ?? item?.amount_fen ?? item?.amount ?? (plan === 'free' ? 0 : NaN)
    )
    const durationDays = Number(
      item?.durationDays ?? item?.duration_days ?? (plan === 'free' ? 0 : NaN)
    )

    if (!id || id.length > MAX_PLAN_ID_LENGTH || !/^[A-Za-z0-9_-]+$/.test(id)) {
      throw createConfigError(`第 ${index + 1} 个订阅套餐 ID 无效`, 'SUBSCRIPTION_PLANS_INVALID')
    }
    if (!['free', 'basic', 'premium'].includes(plan)) {
      throw createConfigError(`订阅套餐 ${id} 的会员类型无效`, 'SUBSCRIPTION_PLANS_INVALID')
    }
    if (!name || !description || Buffer.byteLength(description, 'utf8') > MAX_DESCRIPTION_BYTES) {
      throw createConfigError(`订阅套餐 ${id} 的描述无效`, 'SUBSCRIPTION_PLANS_INVALID')
    }
    if (!Number.isSafeInteger(amountFen) || amountFen < 0 || amountFen > 100000000) {
      throw createConfigError(`订阅套餐 ${id} 的金额无效`, 'SUBSCRIPTION_PLANS_INVALID')
    }
    if (plan === 'free' && (amountFen !== 0 || durationDays !== 0)) {
      throw createConfigError('免费套餐金额和有效期必须为 0', 'SUBSCRIPTION_PLANS_INVALID')
    }
    if (
      plan !== 'free' &&
      (!Number.isSafeInteger(amountFen) || amountFen <= 0 || !Number.isSafeInteger(durationDays))
    ) {
      throw createConfigError(`订阅套餐 ${id} 的金额或时长无效`, 'SUBSCRIPTION_PLANS_INVALID')
    }
    if (plan !== 'free' && (durationDays <= 0 || durationDays > 3660)) {
      throw createConfigError(`订阅套餐 ${id} 的时长无效`, 'SUBSCRIPTION_PLANS_INVALID')
    }

    return {
      id,
      plan,
      name,
      description,
      amountFen,
      durationDays,
      currency: 'CNY'
    }
  })

  const ids = new Set()
  for (const plan of plans) {
    if (ids.has(plan.id)) {
      throw createConfigError(`订阅套餐 ID 重复：${plan.id}`, 'SUBSCRIPTION_PLANS_INVALID')
    }
    ids.add(plan.id)
  }
  return plans
}

function getSubscriptionPlans(env = process.env) {
  return parsePlans(
    readFirstEnv(env, ['WECHAT_PAY_SUBSCRIPTION_PLANS_JSON', 'SUBSCRIPTION_PLANS_JSON'])
  )
}

function getWechatPayConfig(env = process.env) {
  return {
    appId: readFirstEnv(env, ['WECHAT_PAY_APPID', 'WECHAT_PAY_APP_ID']),
    mchId: readFirstEnv(env, ['WECHAT_PAY_MCHID', 'WECHAT_PAY_MERCHANT_ID']),
    merchantSerialNo: readFirstEnv(env, ['WECHAT_PAY_MERCHANT_SERIAL_NO', 'WECHAT_PAY_SERIAL_NO']),
    merchantPrivateKey: decodePem(
      readFirstEnv(env, [
        'WECHAT_PAY_MERCHANT_PRIVATE_KEY_BASE64',
        'WECHAT_PAY_MERCHANT_PRIVATE_KEY'
      ])
    ),
    apiV3Key: readFirstEnv(env, ['WECHAT_PAY_API_V3_KEY']),
    platformSerialNo: readFirstEnv(env, [
      'WECHAT_PAY_PLATFORM_SERIAL_NO',
      'WECHAT_PAY_PLATFORM_SERIAL'
    ]),
    platformPublicKey: decodePem(
      readFirstEnv(env, ['WECHAT_PAY_PLATFORM_PUBLIC_KEY_BASE64', 'WECHAT_PAY_PLATFORM_PUBLIC_KEY'])
    ),
    notifyUrl: readFirstEnv(env, ['WECHAT_PAY_NOTIFY_URL']),
    apiBaseUrl: readFirstEnv(env, ['WECHAT_PAY_API_BASE_URL']) || 'https://api.mch.weixin.qq.com'
  }
}

function assertWechatPayConfig(config, requiredKeys) {
  const missing = requiredKeys.filter(key => !String(config?.[key] || '').trim())
  if (missing.length) {
    throw createConfigError(
      `微信支付配置未完成，请补齐：${missing.join(', ')}`,
      'WECHAT_PAY_CONFIG_NOT_READY'
    )
  }
  if (requiredKeys.includes('apiV3Key') && Buffer.byteLength(config.apiV3Key, 'utf8') !== 32) {
    throw createConfigError('WECHAT_PAY_API_V3_KEY 必须是 32 字节', 'WECHAT_PAY_CONFIG_INVALID')
  }
  if (requiredKeys.includes('merchantPrivateKey')) {
    try {
      crypto.createPrivateKey(config.merchantPrivateKey)
    } catch {
      throw createConfigError('商户私钥格式无效', 'WECHAT_PAY_CONFIG_INVALID')
    }
  }
  if (requiredKeys.includes('platformPublicKey')) {
    try {
      crypto.createPublicKey(config.platformPublicKey)
    } catch {
      throw createConfigError('微信支付平台公钥格式无效', 'WECHAT_PAY_CONFIG_INVALID')
    }
  }
  if (requiredKeys.includes('notifyUrl')) {
    try {
      const notifyUrl = new URL(config.notifyUrl)
      if (notifyUrl.protocol !== 'https:') {
        throw new Error('notify url must use https')
      }
    } catch {
      throw createConfigError('微信支付回调地址必须是 HTTPS URL', 'WECHAT_PAY_CONFIG_INVALID')
    }
  }
  if (requiredKeys.includes('apiBaseUrl')) {
    try {
      const apiBaseUrl = new URL(config.apiBaseUrl)
      if (apiBaseUrl.protocol !== 'https:') {
        throw new Error('api base url must use https')
      }
    } catch {
      throw createConfigError('微信支付 API 地址必须是 HTTPS URL', 'WECHAT_PAY_CONFIG_INVALID')
    }
  }
}

module.exports = {
  MAX_DESCRIPTION_BYTES,
  assertWechatPayConfig,
  createConfigError,
  getSubscriptionPlans,
  getWechatPayConfig,
  parsePlans
}
