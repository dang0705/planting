'use strict'

const { models } = require('/opt/utils/cloudbase')
const {
  getPlantCatalogById,
  getUserPlantInstanceById
} = require('/opt/utils/plant-knowledge')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')

function buildResolvedPlantContext({
  userPlant = null,
  plant = null,
  plantId = null
} = {}) {
  const resolvedPlantId =
    plant?.plantId ||
    userPlant?.plantId ||
    userPlant?.legacyPlantId ||
    (plantId !== null && plantId !== undefined ? String(plantId) : '')
  const resolvedPlantIdentityId = plant?.plantIdentityId || userPlant?.plantIdentityId || ''
  const resolvedIdentityStatus =
    userPlant?.identityResolutionStatus ||
    (resolvedPlantIdentityId ? 'matched' : 'unresolved')
  const resolvedDisplayName =
    userPlant?.displayName ||
    userPlant?.canonicalName ||
    userPlant?.recognizedName ||
    plant?.canonicalName ||
    '未知植物'

  return {
    userPlantId: userPlant ? Number(userPlant.id) : null,
    plantId: resolvedPlantId || null,
    plantDisplayName: resolvedDisplayName,
    plantIdentityId: resolvedPlantIdentityId,
    legacyPlantId: plant?.legacyPlantId || userPlant?.legacyPlantId || '',
    identityResolutionStatus: resolvedIdentityStatus,
    latestVisualCallBatchId: userPlant?.visualCallBatchId || '',
    recognizedName: userPlant?.recognizedName || '',
    sourceType: userPlant?.sourceType || '',
    recognitionType: userPlant?.recognitionType || '',
    recognitionConfidence:
      userPlant?.recognitionConfidence === null || userPlant?.recognitionConfidence === undefined
        ? null
        : Number(userPlant.recognitionConfidence),
    genus: plant?.genus || userPlant?.genus || '',
    family: plant?.familyEn || userPlant?.familyEn || '',
    category: plant?.categoryCn || plant?.categoryEn || ''
  }
}

async function resolvePlantContext({ openid, plantId = null, userPlantId = null } = {}) {
  const candidateUserPlantId = userPlantId || plantId

  if (candidateUserPlantId !== null && candidateUserPlantId !== undefined && candidateUserPlantId !== '') {
    const userPlant = await getUserPlantInstanceById(openid, Number(candidateUserPlantId))
    if (userPlant) {
      const catalogLookupId =
        userPlant.plantIdentityId || userPlant.legacyPlantId || userPlant.plantId || ''
      const plant = catalogLookupId ? await getPlantCatalogById(String(catalogLookupId)) : null
      return buildResolvedPlantContext({ userPlant, plant })
    }
  }

  if (!plantId) {
    throw new Error('缺少 plantId 或 userPlantId')
  }

  const plant = await getPlantCatalogById(String(plantId))
  if (!plant) {
    throw new Error('植物不存在或无权限访问')
  }

  return buildResolvedPlantContext({ plant, plantId })
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

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function isReviewedDiagnosisLinkStatus(status = '') {
  const normalizedStatus = normalizeText(status)
  return normalizedStatus === 'reviewed' || normalizedStatus === 'audited'
}

function isMatchedIdentityResolutionStatus(status = '') {
  return normalizeText(status) === 'matched'
}

function resolveLinkedDiagnosisBridge(links = [], plantContext = {}) {
  const normalizedLinks = Array.isArray(links) ? links : []
  const reviewedLinks = normalizedLinks.filter(item =>
    isReviewedDiagnosisLinkStatus(item?.review_status)
  )
  const identityLinks = reviewedLinks.filter(item => item?.link_level === 'identity')
  const genusLinks = reviewedLinks.filter(item => item?.link_level === 'genus')
  const familyLinks = reviewedLinks.filter(item => item?.link_level === 'family')

  if (
    isMatchedIdentityResolutionStatus(plantContext?.identityResolutionStatus) &&
    String(plantContext?.plantIdentityId || '').trim() &&
    identityLinks.length
  ) {
    return {
      hasAnyLinks: normalizedLinks.length > 0,
      hasReviewedLinks: reviewedLinks.length > 0,
      selectedLevel: 'identity',
      selectedLinks: identityLinks,
      weakBackgroundOnly: false
    }
  }

  if (String(plantContext?.genus || '').trim() && genusLinks.length) {
    return {
      hasAnyLinks: normalizedLinks.length > 0,
      hasReviewedLinks: reviewedLinks.length > 0,
      selectedLevel: 'genus',
      selectedLinks: genusLinks,
      weakBackgroundOnly: false
    }
  }

  if (familyLinks.length) {
    return {
      hasAnyLinks: normalizedLinks.length > 0,
      hasReviewedLinks: reviewedLinks.length > 0,
      selectedLevel: 'family',
      selectedLinks: familyLinks,
      weakBackgroundOnly: true
    }
  }

  return {
    hasAnyLinks: normalizedLinks.length > 0,
    hasReviewedLinks: reviewedLinks.length > 0,
    selectedLevel: '',
    selectedLinks: [],
    weakBackgroundOnly: false
  }
}

async function getLinkedDiagnosisTargets(plantIdentityId = '') {
  const safePlantIdentityId = String(plantIdentityId || '').trim()
  if (!safePlantIdentityId) {
    return []
  }

  const result = await models.$runSQL(
    `
      SELECT
        plant_identity_id,
        link_level,
        target_profile_key,
        target_table_name,
        target_record_key,
        link_strength,
        review_status
      FROM ${table('plant_identity_diagnosis_links')}
      WHERE plant_identity_id = {{plantIdentityId}}
        AND is_active = 1
      ORDER BY
        FIELD(link_level, 'identity', 'genus', 'family'),
        FIELD(review_status, 'reviewed', 'audited', 'review_pending', 'pending'),
        FIELD(link_strength, 'exact', 'downgraded', 'weak_background'),
        target_table_name ASC,
        target_record_key ASC
    `,
    { plantIdentityId: safePlantIdentityId }
  )

  return result?.data?.executeResultList || []
}

async function getLinkedCandidatePriors(plantContext = {}) {
  const links = await getLinkedDiagnosisTargets(plantContext?.plantIdentityId)
  if (!links.length) {
    return {
      hasAnyLinks: false,
      hasReviewedLinks: false,
      selectedLevel: '',
      weakBackgroundOnly: false,
      priors: []
    }
  }

  const bridge = resolveLinkedDiagnosisBridge(links, plantContext)
  const selectedLinks = Array.isArray(bridge.selectedLinks) ? bridge.selectedLinks : []
  const identityTargetKeys = Array.from(
    new Set(
      selectedLinks
        .filter(item => item?.target_table_name === 'plant_problem_profiles')
        .map(item => String(item?.target_profile_key || '').trim())
        .filter(Boolean)
    )
  )
  const genusTargetKeys = Array.from(
    new Set(
      selectedLinks
        .filter(item => item?.target_table_name === 'genus_problem_profiles')
        .map(item => String(item?.target_profile_key || '').trim())
        .filter(Boolean)
    )
  )

  const queries = []

  if (bridge.selectedLevel === 'identity' && identityTargetKeys.length) {
    queries.push(
      models.$runSQL(
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
          WHERE plant_id IN ${sqlInList(identityTargetKeys)}
            AND data_status IN ('audited', 'partial', 'derived_audited')
        `
      ).then(result =>
        (result?.data?.executeResultList || []).map(row => ({
          ...mapCandidateRow(row),
          matchedHostLevel: row.matched_host_level || 'identity',
          sourceLayer: 'linked_identity_profile'
        }))
      )
    )
  }

  if (bridge.selectedLevel === 'genus' && genusTargetKeys.length) {
    queries.push(
      models.$runSQL(
        `
          SELECT
            problem_key,
            genus_compatibility,
            1 AS host_compatibility,
            genus_compatibility AS final_prior_score,
            'genus' AS matched_host_level,
            'linked_genus_profile' AS source_layer,
            data_status
          FROM ${table('genus_problem_profiles')}
          WHERE genus IN ${sqlInList(genusTargetKeys)}
            AND data_status IN ('audited', 'partial')
        `
      ).then(result => (result?.data?.executeResultList || []).map(mapCandidateRow))
    )
  }

  if (!queries.length) {
    return {
      ...bridge,
      priors: []
    }
  }

  const settled = await Promise.all(queries)
  const merged = new Map()

  for (const rows of settled) {
    for (const row of rows || []) {
      const existing = merged.get(row.problemKey)
      if (!existing || Number(row.finalPriorScore || 0) > Number(existing.finalPriorScore || 0)) {
        merged.set(row.problemKey, row)
      }
    }
  }

  return {
    ...bridge,
    priors: Array.from(merged.values()).sort(
      (left, right) => Number(right.finalPriorScore || 0) - Number(left.finalPriorScore || 0)
    )
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

async function getHostCandidatePriors({ genus = '', family = '', category = '' } = {}) {
  const tasks = []

  if (genus) {
    tasks.push(
      models.$runSQL(
        `
          SELECT
            problem_key,
            0.5 AS genus_compatibility,
            host_compatibility,
            host_compatibility AS final_prior_score,
            host_level AS matched_host_level,
            'derived_from_host_profile' AS source_layer,
            data_status
          FROM ${table('problem_host_profiles')}
          WHERE host_level = 'genus'
            AND host_name = {{hostName}}
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
          SELECT
            problem_key,
            0.5 AS genus_compatibility,
            host_compatibility,
            host_compatibility AS final_prior_score,
            host_level AS matched_host_level,
            'derived_from_host_profile' AS source_layer,
            data_status
          FROM ${table('problem_host_profiles')}
          WHERE host_level = 'family'
            AND host_name = {{hostName}}
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
          SELECT
            problem_key,
            0.5 AS genus_compatibility,
            host_compatibility,
            host_compatibility AS final_prior_score,
            host_level AS matched_host_level,
            'derived_from_host_profile' AS source_layer,
            data_status
          FROM ${table('problem_host_profiles')}
          WHERE host_level IN ('category', 'plant_type')
            AND host_name = {{hostName}}
            AND data_status IN ('audited', 'partial')
        `,
        { hostName: category }
      )
    )
  }

  if (!tasks.length) {
    return []
  }

  const settled = await Promise.all(tasks)
  const merged = new Map()
  for (const result of settled) {
    for (const row of (result?.data?.executeResultList || []).map(mapCandidateRow)) {
      const existing = merged.get(row.problemKey)
      if (!existing || Number(row.finalPriorScore || 0) > Number(existing.finalPriorScore || 0)) {
        merged.set(row.problemKey, row)
      }
    }
  }

  return Array.from(merged.values())
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
  getLinkedCandidatePriors,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getHostCandidatePriors,
  getGenusCompatibilityMap,
  getHostCompatibilityMap
}
