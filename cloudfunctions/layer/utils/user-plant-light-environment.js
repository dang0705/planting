'use strict'

/**
 * 用户植物光照环境查询模块 —— 职责单一的小模块。
 *
 * 仅从 user_plant_instances 表读取 light_environment_json 列并解析为
 * 结构化光照输入（facing/windowType/position/hasDirectSun/distance），
 * 供蒸腾间隔修正（transpiration）消费。
 *
 * 不复制光照公式、SQL 业务契约或制造第二事实源；
 * 光照暴露计算仍在 layer/utils/light-exposure.js 唯一实现。
 */

const { models } = require('/opt/utils/cloudbase')

function parseJsonField(value, fallback = null) {
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

/**
 * 按用户植物 ID 读取结构化光照环境。
 *
 * @param {string} openid - 用户 openid
 * @param {number|string} userPlantId - user_plant_instances.id
 * @returns {Promise<object|null>} 光照环境对象，缺失时返回 null
 */
async function getUserPlantLightEnvironment(openid, userPlantId) {
  if (!openid || !userPlantId) {
    return null
  }
  const result = await models.$runSQL(
    'SELECT CAST(light_environment_json AS CHAR) AS light_environment_json_text FROM user_plant_instances WHERE id = {{id}} AND _openid = {{openid}} LIMIT 1',
    { openid, id: Number(userPlantId) }
  )
  const row = result?.data?.executeResultList?.[0]
  if (!row) {
    return null
  }
  return parseJsonField(
    row.light_environment_json_text ?? row.light_environment_json,
    null
  )
}

module.exports = {
  getUserPlantLightEnvironment
}
