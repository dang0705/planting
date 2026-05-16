/**
 * CloudBase Node SDK 模块
 * 用于 MySQL 数据库操作、AI 能力和用户信息获取
 */
const cloudbaseSDK = require('@cloudbase/node-sdk')
const { resolveCloudbaseEnvId, resolveSqlDatabaseName } = require('./runtime-env')

let cloudbaseApp = null
const RUN_SQL_RETRY_LIMIT = 3
const RUN_SQL_RETRY_DELAY_MS = 250

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function isRetryableRunSqlError(error) {
  const message = String(error?.message || error || '')
  return (
    message.includes('Database connection failed') ||
    message.includes('Run query failed')
  )
}

const SQL_TABLES = [
  'users',
  'user_platform_identities',
  'plant_catalog',
  'plant_images',
  'plant_identity_entities',
  'plant_identity_aliases',
  'plant_identity_match_rules',
  'plant_identity_merge_history',
  'genus_care_profiles',
  'plant_identity_diagnosis_links',
  'user_plant_instances',
  'symptoms',
  'symptom_classes',
  'symptom_class_mapping',
  'problems',
  'diagnosis_result_explanations',
  'symptom_problem_evidence',
  'problem_host_profiles',
  'genus_problem_profiles',
  'plant_problem_profiles',
  'problem_causality',
  'question_library_v5_real',
  'question_option_mapping_v5_real',
  'question_strategy_v5_real',
  'class_question_group_strategy',
  'question_generation_engine',
  'diagnosis_sessions',
  'diagnosis_result_snapshots',
  'visual_call_batches',
  'plant_identity_resolution_records',
  'visual_raw_image_records',
  'visual_normalized_image_results',
  'visual_admission_records',
  'visual_call_aggregate_results',
  'visual_supervision_records',
  'observed_evidence_set',
  'diagnosis_symptom_observations',
  'diagnosis_follow_ups',
  'question_queue',
  'stop_state',
  'diagnosis_feedback',
  'diagnosis_batch_reviews',
  'identify_sessions',
  'user_diagnose_quota',
  'user_identify_quota',
  'weather_cache'
]

function qualifySqlTableNames(sql, databaseName) {
  const dbName = String(databaseName || '').trim()
  if (!dbName) {
    return sql
  }

  const escapedDbName = `\`${dbName.replace(/`/g, '``')}\``
  const tablePattern = SQL_TABLES.join('|')

  return String(sql || '')
    .replace(
      new RegExp(`\\b(FROM|JOIN|UPDATE|INTO)\\s+(?!\\()(?!(?:\\\`?${dbName.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\\`?)\\.)((?:\\\`)?(${tablePattern})(?:\\\`)?)\\b`, 'gi'),
      (match, keyword, originalTableRef, tableName) => {
        return `${keyword} ${escapedDbName}.\`${tableName}\``
      }
    )
}

/**
 * 获取 CloudBase 实例（单例模式）
 */
function getCloudBase() {
  if (!cloudbaseApp) {
    cloudbaseApp = cloudbaseSDK.init({
      env: resolveCloudbaseEnvId(),
      secretId: process.env.CLOUDBASE_SECRET_ID,
      secretKey: process.env.CLOUDBASE_SECRET_KEY
    })
  }
  return cloudbaseApp
}

/**
 * 获取用户信息（替代 wx-server-sdk 的 getWXContext）
 * @param {object} context - 云函数上下文
 * @returns {object} 用户信息对象
 */
function getUserInfo(context) {
  const runtimeEnv = context?.environment || context?.environ || {}
  const extendedContext = context?.extendedContext || {}

  const runtimeOpenId =
    runtimeEnv.WX_OPENID ||
    process.env.WX_OPENID ||
    ''
  const runtimeAppId =
    runtimeEnv.WX_APPID ||
    process.env.WX_APPID ||
    ''
  const runtimeUid =
    runtimeEnv.TCB_UUID ||
    extendedContext.userId ||
    process.env.TCB_UUID ||
    ''
  const runtimeCustomUserId =
    runtimeEnv.TCB_CUSTOM_USER_ID ||
    process.env.TCB_CUSTOM_USER_ID ||
    ''
  const runtimeUnionId =
    runtimeEnv.WX_UNIONID ||
    process.env.WX_UNIONID ||
    ''

  if (runtimeOpenId || runtimeUid || runtimeCustomUserId) {
    const openid = runtimeOpenId || runtimeUid || runtimeCustomUserId

    return {
      OPENID: openid,
      APPID: runtimeAppId,
      UNIONID: runtimeUnionId,
      ENV: resolveCloudbaseEnvId(context)
    }
  }

  const app = cloudbaseSDK.init({
    env: resolveCloudbaseEnvId(context)
  })
  const auth = app.auth()
  const userInfo = auth.getUserInfo()

  const {
    openId, // 微信openId，非微信授权登录则空
    appId, // 微信appId，非微信授权登录则空
    uid, // 用户唯一ID
    customUserId // 开发者自定义的用户唯一id
  } = userInfo

  // 使用 openId 作为用户的 openid，如果不存在则使用 uid 或 customUserId
  const openid = openId || uid || customUserId

  return {
    OPENID: openid,
    APPID: appId,
    UNIONID: '', // CloudBase Node SDK 不提供 UNIONID
    ENV: resolveCloudbaseEnvId(context)
  }
}

// 封装 models.$runSQL 方法
const models = {
  /**
   * 执行 SQL 语句
   * @param {string} sql - SQL 语句，使用 {{paramName}} 作为参数占位符
   * @param {object} params - 参数对象
   * @returns {Promise<{data: {executeResultList: Array}}>}
   */
  async $runSQL(sql, params = {}) {
    const app = getCloudBase()
    const normalizedSql = qualifySqlTableNames(sql, resolveSqlDatabaseName())
    let lastError = null

    for (let attempt = 1; attempt <= RUN_SQL_RETRY_LIMIT; attempt += 1) {
      try {
        return await app.models.$runSQL(normalizedSql, params)
      } catch (error) {
        lastError = error
        if (!isRetryableRunSqlError(error) || attempt >= RUN_SQL_RETRY_LIMIT) {
          throw error
        }
        console.warn(
          '[cloudbase.models.$runSQL] transient failure, retrying',
          JSON.stringify({
            attempt,
            nextAttempt: attempt + 1,
            message: String(error?.message || error).slice(0, 300)
          })
        )
        await sleep(RUN_SQL_RETRY_DELAY_MS * attempt)
      }
    }

    throw lastError
  }
}

/**
 * 获取 AI 模块
 */
function ai() {
  const app = getCloudBase()
  return app.ai()
}

/**
 * 获取存储模块
 */
function storage() {
  const app = getCloudBase()
  return app.storage()
}

module.exports = {
  getCloudBase,
  models,
  ai,
  storage,
  getUserInfo
}
