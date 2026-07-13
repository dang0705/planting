'use strict'

/**
 * 浇水建议会话服务 —— plant-user-http 内部服务。
 *
 * 管理独立浇水（watering-advisor）的会话落库与查询。
 * 独立浇水不绑定用户植物实例，仅基于植物种类 + 临时盆型输入给出建议毫升数。
 *
 * 合同约束：
 *   - 落库的 plannerResult 仅包含建议毫升数相关信息，不包含日期/间隔/盆土判断/蒸腾/光照文案。
 *   - 不读取光照，不使用蒸腾间隔修正。
 */

const { models } = require('/opt/utils/cloudbase')

/* ---------- 基础工具 ---------- */

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
}

function normalizeNumber(value) {
  const num = Number(value)
  return Number.isFinite(num) ? num : null
}

function stringifyJson(value) {
  if (value === null || value === undefined) {
    return null
  }
  try {
    return JSON.stringify(value)
  } catch {
    return null
  }
}

/**
 * 保存独立浇水建议会话。
 *
 * @param {string} openid
 * @param {object} body - { catalogPlantId, catalogPlantName, potProfile, weatherSummary, plannerResult }
 * @returns {Promise<{ statusCode: number, message: string, data: object|null }>}
 */
async function saveAdvisorSession(openid = '', body = {}) {
  if (!openid) {
    return { statusCode: 401, message: '请先登录', data: null }
  }
  const catalogPlantId = normalizeText(body.catalogPlantId)
  if (!catalogPlantId) {
    return { statusCode: 400, message: '缺少植物种类ID', data: null }
  }
  const catalogPlantName = normalizeText(body.catalogPlantName)
  const potProfileJson = stringifyJson(body.potProfile || null)
  const weatherSummaryJson = stringifyJson(body.weatherSummary || null)
  const plannerResultJson = stringifyJson(body.plannerResult || null)

  const result = await models.$runSQL(
    `
      INSERT INTO watering_advisor_sessions (
        _openid, catalog_plant_id, catalog_plant_name,
        pot_profile_json, weather_summary_json, planner_result_json
      ) VALUES (
        {{openid}}, {{catalogPlantId}}, {{catalogPlantName}},
        {{potProfileJson}}, {{weatherSummaryJson}}, {{plannerResultJson}}
      )
    `,
    {
      openid,
      catalogPlantId,
      catalogPlantName: catalogPlantName || null,
      potProfileJson,
      weatherSummaryJson,
      plannerResultJson
    }
  )

  const insertId = result?.data?.executeResultList?.[0]?.insertId || result?.insertId || 0
  return {
    statusCode: 200,
    message: '保存成功',
    data: {
      sessionId: Number(insertId) || 0,
      catalogPlantId,
      catalogPlantName: catalogPlantName || ''
    }
  }
}

/**
 * 查询独立浇水建议会话列表。
 *
 * @param {string} openid
 * @param {object} options - { page, pageSize }
 * @returns {Promise<{ statusCode: number, data: object }>}
 */
async function listAdvisorSessions(openid = '', { page = 1, pageSize = 20 } = {}) {
  if (!openid) {
    return { statusCode: 401, data: { list: [], total: 0, page: 1, pageSize: 20 } }
  }
  const limit = Math.max(1, Math.min(100, Number(pageSize) || 20))
  const offset = Math.max(0, (Math.max(1, Number(page) || 1) - 1) * limit)

  const countResult = await models.$runSQL(
    'SELECT COUNT(*) AS total FROM watering_advisor_sessions WHERE _openid = {{openid}}',
    { openid }
  )
  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)

  const listResult = await models.$runSQL(
    `
      SELECT id, _openid, catalog_plant_id, catalog_plant_name,
             pot_profile_json, weather_summary_json, planner_result_json,
             created_at
      FROM watering_advisor_sessions
      WHERE _openid = {{openid}}
      ORDER BY created_at DESC, id DESC
      LIMIT {{limit}} OFFSET {{offset}}
    `,
    { openid, limit, offset }
  )

  const rows = listResult?.data?.executeResultList || []
  const list = rows.map(row => ({
    sessionId: row.id,
    catalogPlantId: row.catalog_plant_id || '',
    catalogPlantName: row.catalog_plant_name || '',
    potProfile: parseJsonField(row.pot_profile_json),
    weatherSummary: parseJsonField(row.weather_summary_json),
    plannerResult: parseJsonField(row.planner_result_json),
    createdAt: row.created_at || null
  }))

  return {
    statusCode: 200,
    data: { list, total, page: Math.floor(offset / limit) + 1, pageSize: limit }
  }
}

function parseJsonField(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(String(value))
  } catch {
    return fallback
  }
}

module.exports = {
  saveAdvisorSession,
  listAdvisorSessions
}
