'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const { resolvePlantContext } = require('./prior-plant-context-repository')
const {
  getLinkedCandidatePriors,
  getCandidateProblemPriors,
  getGenusCandidatePriors,
  getHostCandidatePriors
} = require('./prior-candidate-repository')
const {
  priorCache,
  pendingPriorCache,
  getCacheEntry,
  setCacheEntry,
  withPending,
  buildHostContextCacheKey,
  buildProblemSetCacheKey
} = require('./prior-cache')

async function getGenusCompatibilityMap(genus, problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!genus || !safeKeys.length) {return {}}
  const cacheKey = `${String(genus || '').trim()}::${buildProblemSetCacheKey(safeKeys)}`
  const cached = getCacheEntry(priorCache.genusCompatibilityByGenusAndProblemSet, cacheKey)
  if (cached) {return cached}

  const cachedGenusPriors = getCacheEntry(priorCache.genusCandidatePriorsByGenus, String(genus || '').trim())
  if (cachedGenusPriors) {
    const safeKeySet = new Set(safeKeys)
    const map = {}
    for (const row of cachedGenusPriors) {
      if (!safeKeySet.has(row.problemKey)) {continue}
      map[row.problemKey] = clamp01(row.genusCompatibility)
    }
    setCacheEntry(priorCache.genusCompatibilityByGenusAndProblemSet, cacheKey, map)
    return map
  }

  return withPending(pendingPriorCache.genusCompatibilityByGenusAndProblemSet, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.genusCompatibilityByGenusAndProblemSet, cacheKey)
    if (cachedAfterWait) {return cachedAfterWait}

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
    setCacheEntry(priorCache.genusCompatibilityByGenusAndProblemSet, cacheKey, map)
    return map
  })
}

async function getHostCompatibilityMap({ genus = '', family = '', category = '' } = {}, problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) {return {}}
  const cacheKey = `${buildHostContextCacheKey({ genus, family, category })}::${buildProblemSetCacheKey(safeKeys)}`
  const cached = getCacheEntry(priorCache.hostCompatibilityByHostContextAndProblemSet, cacheKey)
  if (cached) {return cached}

  const hostContextCacheKey = buildHostContextCacheKey({ genus, family, category })
  const cachedHostPriors = getCacheEntry(priorCache.hostCandidatePriorsByHostKey, hostContextCacheKey)
  if (cachedHostPriors) {
    const safeKeySet = new Set(safeKeys)
    const map = {}
    for (const row of cachedHostPriors) {
      if (!safeKeySet.has(row.problemKey)) {continue}
      const score = clamp01(row.hostCompatibility)
      const existing = map[row.problemKey]
      if (!existing || score > existing.hostCompatibility) {
        map[row.problemKey] = {
          hostCompatibility: score,
          hostLevel: row.matchedHostLevel || ''
        }
      }
    }
    setCacheEntry(priorCache.hostCompatibilityByHostContextAndProblemSet, cacheKey, map)
    return map
  }

  return withPending(pendingPriorCache.hostCompatibilityByHostContextAndProblemSet, cacheKey, async () => {
    const cachedAfterWait = getCacheEntry(priorCache.hostCompatibilityByHostContextAndProblemSet, cacheKey)
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
            SELECT problem_key, host_compatibility, host_level
            FROM ${table('problem_host_profiles')}
            WHERE ${hostWhereClause}
              AND host_name = {{hostName}}
              AND problem_key IN ${sqlInList(safeKeys)}
              AND data_status IN ('audited', 'partial')
          `,
          { hostName }
        )
      )
    }

    if (!tasks.length) {return {}}
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

    setCacheEntry(priorCache.hostCompatibilityByHostContextAndProblemSet, cacheKey, map)
    return map
  })
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
