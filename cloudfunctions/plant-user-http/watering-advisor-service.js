'use strict'

/**
 * 独立浇水建议落库 service。
 *
 * 职责：
 *   - saveAdvisorSession: 保存独立浇水建议会话记录（输入快照 + planner 结果）
 *   - listAdvisorSessions: 分页查询用户历史独立建议记录
 *
 * 数据表：watering_advisor_sessions（与 user_watering_reminder_events 独立，不绑植物）
 */

const { models } = require('/opt/utils/cloudbase')

function parseJsonText(value, fallback) {
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

function mapSessionRow(row = {}) {
  const potProfile = parseJsonText(row.pot_profile_json_text ?? row.pot_profile_json, null)
  const weatherSummary = parseJsonText(
    row.weather_summary_json_text ?? row.weather_summary_json,
    {}
  )
  const plannerResult = parseJsonText(row.planner_result_json_text ?? row.planner_result_json, {})
  return {
    id: row.id,
    catalogPlantId: row.catalog_plant_id || '',
    catalogPlantName: row.catalog_plant_name || '',
    potProfile,
    weatherSummary,
    plannerResult,
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || ''
  }
}

/**
 * 保存独立浇水建议会话记录。
 *
 * @param {string} openid - 用户 openid
 * @param {object} body - 请求体
 * @param {string} body.catalogPlantId - 植物种类 ID
 * @param {string} body.catalogPlantName - 植物名称快照
 * @param {object} body.potProfile - 盆型输入快照
 * @param {object} body.weatherSummary - 天气摘要快照
 * @param {object} body.plannerResult - planner 完整建议结果
 * @returns {Promise<object>} { statusCode, data, message }
 */
async function saveAdvisorSession(openid, body = {}) {
  const catalogPlantId = String(body.catalogPlantId || '').trim()
  if (!catalogPlantId) {
    return { statusCode: 400, data: null, message: '缺少植物种类ID' }
  }

  const params = {
    openid,
    catalogPlantId,
    catalogPlantName: String(body.catalogPlantName || '').slice(0, 255),
    potProfileJson: JSON.stringify(body.potProfile || null),
    weatherSummaryJson: JSON.stringify(body.weatherSummary || {}),
    plannerResultJson: JSON.stringify(body.plannerResult || {})
  }

  await models.$runSQL(
    `INSERT INTO watering_advisor_sessions
       (_openid, catalog_plant_id, catalog_plant_name, pot_profile_json, weather_summary_json,
        planner_result_json)
     VALUES
       ({{openid}}, {{catalogPlantId}}, {{catalogPlantName}}, {{potProfileJson}},
        {{weatherSummaryJson}}, {{plannerResultJson}})`,
    params
  )

  const result = await models.$runSQL(
    `SELECT
       id, _openid, catalog_plant_id, catalog_plant_name,
       CAST(pot_profile_json AS CHAR) AS pot_profile_json_text,
       CAST(weather_summary_json AS CHAR) AS weather_summary_json_text,
       CAST(planner_result_json AS CHAR) AS planner_result_json_text,
       created_at, updated_at
     FROM watering_advisor_sessions
     WHERE _openid = {{openid}} AND catalog_plant_id = {{catalogPlantId}}
     ORDER BY created_at DESC
     LIMIT 1`,
    { openid, catalogPlantId }
  )
  const row = result?.data?.executeResultList?.[0]
  return { statusCode: 200, data: row ? mapSessionRow(row) : null, message: '保存成功' }
}

/**
 * 分页查询用户历史独立浇水建议记录。
 *
 * @param {string} openid - 用户 openid
 * @param {object} options
 * @param {number} options.page - 页码，从 1 开始
 * @param {number} options.pageSize - 每页条数
 * @returns {Promise<object>} { statusCode, data: { list, total, page, pageSize, hasMore } }
 */
async function listAdvisorSessions(openid, { page = 1, pageSize = 20 } = {}) {
  const limit = Math.max(1, Math.min(100, Number(pageSize) || 20))
  const offset = Math.max(0, (Number(page) - 1) * limit)

  const countResult = await models.$runSQL(
    `SELECT COUNT(*) AS total FROM watering_advisor_sessions WHERE _openid = {{openid}}`,
    { openid }
  )
  const total = Number(countResult?.data?.executeResultList?.[0]?.total || 0)

  const result = await models.$runSQL(
    `SELECT
       id, _openid, catalog_plant_id, catalog_plant_name,
       CAST(pot_profile_json AS CHAR) AS pot_profile_json_text,
       CAST(weather_summary_json AS CHAR) AS weather_summary_json_text,
       CAST(planner_result_json AS CHAR) AS planner_result_json_text,
       created_at, updated_at
     FROM watering_advisor_sessions
     WHERE _openid = {{openid}}
     ORDER BY created_at DESC
     LIMIT {{limit}} OFFSET {{offset}}`,
    { openid, limit, offset }
  )
  const list = (result?.data?.executeResultList || []).map(mapSessionRow)
  return {
    statusCode: 200,
    data: {
      list,
      total,
      page: Number(page),
      pageSize: limit,
      hasMore: offset + list.length < total
    }
  }
}

module.exports = {
  saveAdvisorSession,
  listAdvisorSessions,
  mapSessionRow
}
