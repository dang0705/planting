'use strict'

/**
 * 浇水提醒服务 —— plant-user-http 内部服务。
 *
 * 管理"我的植物"浇水提醒的读取与保存。
 * 提醒事件使用 user_watering_reminder_events 表，采用 superseded/active 状态模型：
 *   - 保存新提醒时，将同一植物同一 openid 下既有的 active 提醒标记为 superseded。
 *   - 仅返回 active 状态的最新提醒。
 *
 * 合同约束（浇水算法 v3）：
 *   - 蒸腾只影响下次浇水间隔；不得改变单次浇水毫升数；不得绕过现有 WET/湿润保护。
 *   - 本服务不计算蒸腾系数，仅负责落库与读取；蒸腾修正由调用方（app.js）注入 planner。
 */

const { models } = require('/opt/utils/cloudbase')

/* ---------- 基础工具 ---------- */

function normalizeText(value = '') {
  return String(value || '')
    .normalize('NFKC')
    .trim()
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

function normalizeDate(value = '') {
  const raw = normalizeText(value)
  if (!raw) {
    return null
  }
  const match = raw.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (match) {
    return [match[1], String(match[2]).padStart(2, '0'), String(match[3]).padStart(2, '0')].join(
      '-'
    )
  }
  return raw.slice(0, 10)
}

/**
 * 读取指定植物的最新 active 浇水提醒。
 *
 * @param {string} openid
 * @param {number} plantId - user_plant_instances.id
 * @returns {Promise<{ statusCode: number, data: object|null }>}
 */
async function readWateringReminder(openid = '', plantId = 0) {
  const normalizedPlantId = Number(plantId)
  if (!openid || !normalizedPlantId) {
    return { statusCode: 400, data: null }
  }

  const result = await models.$runSQL(
    `
      SELECT id, _openid, plant_id, plan_id, next_water_date, next_time,
             calendar_payload_json, status, created_at, updated_at
      FROM user_watering_reminder_events
      WHERE _openid = {{openid}}
        AND plant_id = {{plantId}}
        AND status = 'active'
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `,
    { openid, plantId: normalizedPlantId }
  )

  const row = result?.data?.executeResultList?.[0]
  if (!row) {
    return { statusCode: 200, data: null }
  }

  return {
    statusCode: 200,
    data: {
      reminderId: row.id,
      plantId: Number(row.plant_id),
      planId: row.plan_id || '',
      nextWaterDate: row.next_water_date || '',
      nextTime: row.next_time || '',
      calendarPayload: parseJsonField(row.calendar_payload_json, null),
      status: row.status || 'active',
      createdAt: row.created_at || null,
      updatedAt: row.updated_at || null
    }
  }
}

/**
 * 保存浇水提醒：将既有 active 提醒标记为 superseded，插入新 active 提醒，
 * 并同步更新 user_plant_instances.last_watered / next_water。
 *
 * @param {string} openid
 * @param {object} body - { plantId, planId, nextWaterDate, nextTime, calendarPayload }
 * @returns {Promise<{ statusCode: number, message: string, data: object }>}
 */
async function saveWateringReminder(openid = '', body = {}) {
  const plantId = Number(body.plantId)
  if (!openid || !plantId) {
    return { statusCode: 400, message: '缺少植物ID', data: null }
  }

  // 校验植物归属权
  const ownershipResult = await models.$runSQL(
    'SELECT id FROM user_plant_instances WHERE id = {{plantId}} AND _openid = {{openid}}',
    { openid, plantId }
  )
  if (!ownershipResult?.data?.executeResultList?.[0]) {
    return { statusCode: 404, message: '植物不存在或无权限', data: null }
  }

  const planId = normalizeText(body.planId) || null
  const nextWaterDate = normalizeDate(body.nextWaterDate)
  const nextTime = normalizeText(body.nextTime) || null
  const calendarPayloadJson = stringifyJson(body.calendarPayload || null)

  // 将同一植物同一 openid 下既有 active 提醒标记为 superseded
  await models.$runSQL(
    `
      UPDATE user_watering_reminder_events
      SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
      WHERE _openid = {{openid}}
        AND plant_id = {{plantId}}
        AND status = 'active'
    `,
    { openid, plantId }
  )

  // 插入新 active 提醒
  const insertResult = await models.$runSQL(
    `
      INSERT INTO user_watering_reminder_events (
        _openid, plant_id, plan_id, next_water_date, next_time,
        calendar_payload_json, status
      ) VALUES (
        {{openid}}, {{plantId}}, {{planId}}, {{nextWaterDate}}, {{nextTime}},
        {{calendarPayloadJson}}, 'active'
      )
    `,
    {
      openid,
      plantId,
      planId,
      nextWaterDate,
      nextTime,
      calendarPayloadJson
    }
  )

  const reminderId =
    insertResult?.data?.executeResultList?.[0]?.insertId || insertResult?.insertId || 0

  // 同步更新 user_plant_instances.last_watered / next_water
  await models.$runSQL(
    `
      UPDATE user_plant_instances
      SET next_water = {{nextWaterDate}}, last_watered = CURRENT_TIMESTAMP
      WHERE id = {{plantId}} AND _openid = {{openid}}
    `,
    { openid, plantId, nextWaterDate }
  )

  return {
    statusCode: 200,
    message: '保存成功',
    data: {
      reminderId: Number(reminderId) || 0,
      plantId,
      planId: planId || '',
      nextWaterDate: nextWaterDate || '',
      nextTime: nextTime || ''
    }
  }
}

/**
 * 为植物列表批量附加最新 active 浇水提醒状态。
 *
 * @param {string} openid
 * @param {object} data - { list: [...], total, page, pageSize }
 * @returns {Promise<object>} 附加 reminder 字段后的 data
 */
async function attachWateringReminderStateToList(openid = '', data = {}) {
  const list = Array.isArray(data?.list) ? data.list : []
  const plantIds = Array.from(new Set(list.map(item => Number(item?.id)).filter(Boolean)))
  if (!openid || !plantIds.length) {
    return data
  }

  const result = await models.$runSQL(
    `
      SELECT id, _openid, plant_id, plan_id, next_water_date, next_time,
             calendar_payload_json, status, created_at, updated_at
      FROM user_watering_reminder_events
      WHERE _openid = {{openid}}
        AND plant_id IN (${plantIds.join(',')})
        AND status = 'active'
      ORDER BY created_at DESC, id DESC
    `,
    { openid }
  )

  const reminderMap = new Map()
  for (const row of result?.data?.executeResultList || []) {
    const pid = Number(row.plant_id)
    if (pid && !reminderMap.has(pid)) {
      reminderMap.set(pid, {
        reminderId: row.id,
        plantId: pid,
        planId: row.plan_id || '',
        nextWaterDate: row.next_water_date || '',
        nextTime: row.next_time || '',
        calendarPayload: parseJsonField(row.calendar_payload_json, null),
        status: row.status || 'active',
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
      })
    }
  }

  return {
    ...data,
    list: list.map(item => ({
      ...item,
      reminder: reminderMap.get(Number(item?.id)) || null
    }))
  }
}

module.exports = {
  attachWateringReminderStateToList,
  readWateringReminder,
  saveWateringReminder
}
