'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList } = require('./sql')
const { table } = require('../db/table-helper')
const {
  priorCache,
  pendingPriorCache,
  getCacheEntry,
  setCacheEntry,
  withPending,
  buildPlantIdentityCacheKey,
  buildHostContextCacheKey,
  mapCandidateRow,
  normalizeText
} = require('./prior-cache')

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
  if (!safePlantIdentityId) {return []}

  return withPending(pendingPriorCache.linkedDiagnosisTargetsByIdentity, safePlantIdentityId, async () => {
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
  })
}

async function getLinkedCandidatePriors(plantContext = {}) {
  const cacheKey = buildPlantIdentityCacheKey(plantContext)
  const cached = getCacheEntry(priorCache.linkedCandidatePriorsByPlantIdentity, cacheKey)
  if (cached) {return cached}

  return withPending(pendingPriorCache.linkedCandidatePriorsByPlantIdentity, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.linkedCandidatePriorsByPlantIdentity, cacheKey)
    if (cachedAfterWait) {return cachedAfterWait}

    const links = await getLinkedDiagnosisTargets(plantContext?.plantIdentityId)
    if (!links.length) {
      const fallbackResult = {
        hasAnyLinks: false,
        hasReviewedLinks: false,
        selectedLevel: '',
        weakBackgroundOnly: false,
        priors: []
      }
      setCacheEntry(priorCache.linkedCandidatePriorsByPlantIdentity, cacheKey, fallbackResult)
      return fallbackResult
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
  })
}

async function getCandidateProblemPriors(plantContext) {
  if (!plantContext?.plantId) {return []}
  const cacheKey = String(plantContext.plantId || '').trim()
  const cached = getCacheEntry(priorCache.candidateProblemPriorsByPlantId, cacheKey)
  if (cached) {return cached}

  return withPending(pendingPriorCache.candidateProblemPriorsByPlantId, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.candidateProblemPriorsByPlantId, cacheKey)
    if (cachedAfterWait) {return cachedAfterWait}

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

    const priors = (result?.data?.executeResultList || []).map(mapCandidateRow)
    setCacheEntry(priorCache.candidateProblemPriorsByPlantId, cacheKey, priors)
    return priors
  })
}

async function getGenusCandidatePriors(genus = '') {
  if (!genus) {return []}
  const cacheKey = String(genus || '').trim()
  const cached = getCacheEntry(priorCache.genusCandidatePriorsByGenus, cacheKey)
  if (cached) {return cached}

  return withPending(pendingPriorCache.genusCandidatePriorsByGenus, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.genusCandidatePriorsByGenus, cacheKey)
    if (cachedAfterWait) {return cachedAfterWait}

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

    const priors = (result?.data?.executeResultList || []).map(mapCandidateRow)
    setCacheEntry(priorCache.genusCandidatePriorsByGenus, cacheKey, priors)
    return priors
  })
}

async function getHostCandidatePriors({ genus = '', family = '', category = '' } = {}) {
  const cacheKey = buildHostContextCacheKey({ genus, family, category })
  const cached = getCacheEntry(priorCache.hostCandidatePriorsByHostKey, cacheKey)
  if (cached) {return cached}

  return withPending(pendingPriorCache.hostCandidatePriorsByHostKey, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.hostCandidatePriorsByHostKey, cacheKey)
    if (cachedAfterWait) {return cachedAfterWait}

    const tasks = []
    for (const [hostName, hostWhereClause] of [
      [genus, "host_level = 'genus'"],
      [family, "host_level = 'family'"],
      [category, "host_level IN ('category', 'plant_type')"]
    ]) {
      if (!hostName) {continue}
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
            WHERE ${hostWhereClause}
              AND host_name = {{hostName}}
              AND data_status IN ('audited', 'partial')
          `,
          { hostName }
        )
      )
    }

    if (!tasks.length) {return []}
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

    const priors = Array.from(merged.values())
    setCacheEntry(priorCache.hostCandidatePriorsByHostKey, cacheKey, priors)
    return priors
  })
}

module.exports = {
  getLinkedCandidatePriors,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getHostCandidatePriors
}
