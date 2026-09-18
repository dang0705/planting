'use strict'

const { models } = require('/opt/utils/cloudbase')
const airEnvironmentEvidence = require('/opt/utils/air-environment-evidence')
const { normalizeAirEnvironmentInput } = airEnvironmentEvidence

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
  if (Number(stored?.schemaVersion) === 3) {
    const quick = airEnvironmentEvidence.normalizeQuickAirEnvironmentAnswer?.(
      stored?.completedModes?.quick
    )
    const advanced = normalizeAirEnvironmentInput(stored?.completedModes?.advanced, {
      requireDirectSource: true
    })
    const requestedMode = stored.activeMode === 'quick' ? 'quick' : 'advanced'
    const activeMode =
      requestedMode === 'quick' && quick
        ? 'quick'
        : requestedMode === 'advanced' && advanced
          ? 'advanced'
          : quick
            ? 'quick'
            : advanced
              ? 'advanced'
              : null
    if (!activeMode) {
      return null
    }
    return {
      schemaVersion: 3,
      activeMode,
      completedModes: { quick: quick || null, advanced: advanced || null },
      locationBinding: normalizeLocationBinding(stored?.locationBinding),
      updatedAt: String(stored?.updatedAt || row.updated_at || '').trim()
    }
  }
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

function normalizeSubmittedAssessment(value = null) {
  if (Number(value?.schemaVersion) === 3) {
    if (value.mode === 'quick') {
      const quick = airEnvironmentEvidence.normalizeQuickAirEnvironmentAnswer?.(value.quickAnswer)
      return quick ? { mode: 'quick', quick, advanced: null } : null
    }
    if (value.mode === 'advanced') {
      const advanced = normalizeAirEnvironmentInput(value.advancedInput, {
        requireDirectSource: true
      })
      return advanced ? { mode: 'advanced', quick: null, advanced } : null
    }
    return null
  }
  const advanced = normalizeAirEnvironmentInput(value, { requireDirectSource: true })
  return advanced ? { mode: 'advanced', quick: null, advanced } : null
}

function toCompletedModes(profile = null) {
  return Number(profile?.schemaVersion) === 3
    ? {
        quick: profile.completedModes?.quick || null,
        advanced: profile.completedModes?.advanced || null
      }
    : { quick: null, advanced: profile?.input || null }
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
  const submitted = normalizeSubmittedAssessment(payload.airEnvironment)
  if (!openid || !plantId) {
    return { statusCode: 400, message: '缺少植物ID', data: null }
  }
  if (!submitted) {
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
    const completedModes = toCompletedModes(current)
    if (submitted.mode === 'quick') {
      completedModes.quick = submitted.quick
    } else {
      completedModes.advanced = submitted.advanced
    }
    const profile = {
      schemaVersion: 3,
      activeMode: submitted.mode,
      completedModes,
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
  _test: {
    readProfile,
    normalizeLocationBinding,
    normalizeSubmittedAssessment,
    toCompletedModes,
    isMissingColumnError
  }
}
