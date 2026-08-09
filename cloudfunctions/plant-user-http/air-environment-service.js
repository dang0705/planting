'use strict'

const { models } = require('/opt/utils/cloudbase')
const { normalizeAirEnvironmentInput } = require('/opt/utils/air-environment-evidence')

function parseJson(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback
  }
  if (typeof value === 'object') {
    return value
  }
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function normalizeLocationBinding(value = {}) {
  const careLocationId = String(value?.careLocationId || '').trim()
  const locationKey = String(value?.locationKey || '').trim()
  return { careLocationId, locationKey }
}

function readProfile(row = {}) {
  const stored = parseJson(row.air_environment_json_text ?? row.air_environment_json, null)
  const input = normalizeAirEnvironmentInput(stored?.input)
  if (!input) {
    return null
  }
  return {
    schemaVersion: Number(stored?.schemaVersion || 1),
    input,
    locationBinding: normalizeLocationBinding(stored?.locationBinding),
    updatedAt: String(stored?.updatedAt || row.updated_at || '').trim()
  }
}

function isMissingColumnError(error) {
  return /unknown column|air_environment_json|ER_BAD_FIELD_ERROR/i.test(
    String(error?.message || error)
  )
}

async function readOwnedPlantRow(openid, plantId) {
  const result = await models.$runSQL(
    `SELECT id, CAST(air_environment_json AS CHAR) AS air_environment_json_text, updated_at
     FROM user_plant_instances
     WHERE id = {{plantId}} AND _openid = {{openid}}
     LIMIT 1`,
    { openid, plantId: Number(plantId) }
  )
  return result?.data?.executeResultList?.[0] || null
}

async function readUserPlantAirEnvironment(openid, plantId) {
  if (!openid || !Number(plantId)) {
    return { statusCode: 400, message: '缺少植物ID', data: null }
  }
  try {
    const row = await readOwnedPlantRow(openid, plantId)
    if (!row) {
      return { statusCode: 404, message: '植物不存在或无权限', data: null }
    }
    return { statusCode: 200, message: '读取成功', data: readProfile(row) }
  } catch (error) {
    if (isMissingColumnError(error)) {
      return { statusCode: 200, message: '空气环境暂未设置', data: null, schemaReady: false }
    }
    throw error
  }
}

async function saveUserPlantAirEnvironment(openid, payload = {}) {
  const plantId = Number(payload.plantId)
  const input = normalizeAirEnvironmentInput(payload.airEnvironment, {
    requireDirectSource: true
  })
  if (!openid || !plantId) {
    return { statusCode: 400, message: '缺少植物ID', data: null }
  }
  if (!input) {
    return { statusCode: 400, message: '空气环境填写不完整', data: null }
  }
  const writeMode = String(payload.writeMode || '').trim()
  if (!['if_missing', 'replace_if_match'].includes(writeMode)) {
    return { statusCode: 400, message: '写入方式无效', data: null }
  }
  try {
    const row = await readOwnedPlantRow(openid, plantId)
    if (!row) {
      return { statusCode: 404, message: '植物不存在或无权限', data: null }
    }
    const current = readProfile(row)
    const expectedUpdatedAt = String(payload.expectedUpdatedAt || '').trim()
    if (writeMode === 'if_missing' && current) {
      return { statusCode: 409, message: '空气环境已存在', data: current }
    }
    if (
      writeMode === 'replace_if_match' &&
      (!current || !expectedUpdatedAt || current.updatedAt !== expectedUpdatedAt)
    ) {
      return { statusCode: 409, message: '空气环境已更新，请重新读取', data: current }
    }
    const profile = {
      schemaVersion: 2,
      input,
      locationBinding: normalizeLocationBinding(payload.locationBinding),
      updatedAt: new Date().toISOString()
    }
    await models.$runSQL(
      `UPDATE user_plant_instances
       SET air_environment_json = {{profileJson}}, updated_at = CURRENT_TIMESTAMP
       WHERE id = {{plantId}} AND _openid = {{openid}}`,
      { openid, plantId, profileJson: JSON.stringify(profile) }
    )
    return { statusCode: 200, message: '保存成功', data: profile }
  } catch (error) {
    if (isMissingColumnError(error)) {
      return { statusCode: 503, message: '空气环境暂不可保存', data: null, schemaReady: false }
    }
    throw error
  }
}

module.exports = {
  readUserPlantAirEnvironment,
  saveUserPlantAirEnvironment,
  _test: { readProfile, normalizeLocationBinding, isMissingColumnError }
}
