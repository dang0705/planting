'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')

async function resolvePlantContext({ openid, plantId = null, userPlantId = null } = {}) {
  const candidateUserPlantId = userPlantId || plantId

  if (candidateUserPlantId !== null && candidateUserPlantId !== undefined && candidateUserPlantId !== '') {
    const result = await models.$runSQL(
      `
        SELECT
          up.id AS user_plant_id,
          up.plant_id AS catalog_plant_id,
          up.canonical_name,
          up.nickname,
          up.plant_genus,
          up.plant_family_en,
          pc.genus,
          pc.family_en,
          pc.category_cn,
          pc.category_en
        FROM ${table('user_plant_instances')} up
        LEFT JOIN ${table('plant_catalog')} pc ON pc.plant_id = up.plant_id
        WHERE up.id = {{userPlantId}} AND up._openid = {{openid}}
        LIMIT 1
      `,
      { userPlantId: Number(candidateUserPlantId), openid }
    )

    const row = result?.data?.executeResultList?.[0]
    if (row) {
      return {
        userPlantId: Number(row.user_plant_id),
        plantId: row.catalog_plant_id || null,
        plantDisplayName: row.nickname || row.canonical_name || '未知植物',
        genus: row.genus || row.plant_genus || '',
        family: row.family_en || row.plant_family_en || '',
        category: row.category_cn || row.category_en || ''
      }
    }
  }

  if (!plantId) {
    throw new Error('缺少 plantId 或 userPlantId')
  }

  const catalogResult = await models.$runSQL(
    `
      SELECT
        plant_id,
        canonical_name,
        genus,
        family_en,
        category_cn,
        category_en
      FROM ${table('plant_catalog')}
      WHERE plant_id = {{plantId}}
      LIMIT 1
    `,
    { plantId: String(plantId) }
  )

  const catalogRow = catalogResult?.data?.executeResultList?.[0]
  if (!catalogRow) {
    throw new Error('植物不存在或无权限访问')
  }

  return {
    userPlantId: null,
    plantId: catalogRow.plant_id,
    plantDisplayName: catalogRow.canonical_name || '未知植物',
    genus: catalogRow.genus || '',
    family: catalogRow.family_en || '',
    category: catalogRow.category_cn || catalogRow.category_en || ''
  }
}

function mapCandidateRow(row = {}) {
  return {
    problemKey: row.problem_key,
    genusCompatibility: clamp01(row.genus_compatibility),
    hostCompatibility: clamp01(row.host_compatibility),
    finalPriorScore: clamp01(row.final_prior_score),
    matchedHostLevel: row.matched_host_level || '',
    sourceLayer: row.source_layer || '',
    dataStatus: row.data_status || 'unknown'
  }
}

async function getCandidateProblemPriors(plantContext) {
  if (!plantContext?.plantId) {
    return []
  }

  const result = await models.$runSQL(
    `
      SELECT
        problem_key,
        genus_compatibility,
        host_compatibility,
        final_prior_score,
        matched_host_level,
        source_layer,
        data_status
      FROM ${table('plant_problem_profiles')}
      WHERE plant_id = {{plantId}}
        AND data_status IN ('audited', 'partial', 'derived_audited')
      ORDER BY final_prior_score DESC, problem_key ASC
    `,
    { plantId: plantContext.plantId }
  )

  return (result?.data?.executeResultList || []).map(mapCandidateRow)
}

async function getGenusCandidatePriors(genus = '') {
  if (!genus) return []

  const result = await models.$runSQL(
    `
      SELECT
        problem_key,
        genus_compatibility,
        1 AS host_compatibility,
        genus_compatibility AS final_prior_score,
        'genus' AS matched_host_level,
        'derived_from_genus_profile' AS source_layer,
        data_status
      FROM ${table('genus_problem_profiles')}
      WHERE genus = {{genus}}
        AND data_status IN ('audited', 'partial')
      ORDER BY genus_compatibility DESC, problem_key ASC
    `,
    { genus }
  )

  return (result?.data?.executeResultList || []).map(mapCandidateRow)
}

async function getGenusCompatibilityMap(genus, problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!genus || !safeKeys.length) return {}

  const result = await models.$runSQL(
    `
      SELECT problem_key, genus_compatibility
      FROM ${table('genus_problem_profiles')}
      WHERE genus = {{genus}}
        AND problem_key IN ${sqlInList(safeKeys)}
        AND data_status IN ('audited', 'partial')
    `,
    { genus }
  )

  const map = {}
  for (const row of result?.data?.executeResultList || []) {
    map[row.problem_key] = clamp01(row.genus_compatibility)
  }
  return map
}

async function getHostCompatibilityMap({ genus = '', family = '', category = '' } = {}, problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return {}

  const tasks = []
  if (genus) {
    tasks.push(
      models.$runSQL(
        `
          SELECT problem_key, host_compatibility, host_level
          FROM ${table('problem_host_profiles')}
          WHERE host_level = 'genus'
            AND host_name = {{hostName}}
            AND problem_key IN ${sqlInList(safeKeys)}
            AND data_status IN ('audited', 'partial')
        `,
        { hostName: genus }
      )
    )
  }

  if (family) {
    tasks.push(
      models.$runSQL(
        `
          SELECT problem_key, host_compatibility, host_level
          FROM ${table('problem_host_profiles')}
          WHERE host_level = 'family'
            AND host_name = {{hostName}}
            AND problem_key IN ${sqlInList(safeKeys)}
            AND data_status IN ('audited', 'partial')
        `,
        { hostName: family }
      )
    )
  }

  if (category) {
    tasks.push(
      models.$runSQL(
        `
          SELECT problem_key, host_compatibility, host_level
          FROM ${table('problem_host_profiles')}
          WHERE host_level IN ('category', 'plant_type')
            AND host_name = {{hostName}}
            AND problem_key IN ${sqlInList(safeKeys)}
            AND data_status IN ('audited', 'partial')
        `,
        { hostName: category }
      )
    )
  }

  if (!tasks.length) {
    return {}
  }

  const settled = await Promise.all(tasks)
  const map = {}
  for (const result of settled) {
    for (const row of result?.data?.executeResultList || []) {
      const existing = map[row.problem_key]
      const score = clamp01(row.host_compatibility)
      if (!existing || score > existing.hostCompatibility) {
        map[row.problem_key] = {
          hostCompatibility: score,
          hostLevel: row.host_level || ''
        }
      }
    }
  }

  return map
}

module.exports = {
  resolvePlantContext,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getGenusCompatibilityMap,
  getHostCompatibilityMap
}
