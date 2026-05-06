'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')

const STATIC_REPOSITORY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.DIAGNOSE_STATIC_CACHE_TTL_MS || 60000)
)
const causalityCache = new Map()
const pendingCausalityCache = new Map()

function getCacheEntry(key = '') {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) return null
  const normalizedKey = String(key || '').trim()
  const entry = causalityCache.get(normalizedKey)
  if (!entry) return null
  if (Date.now() - Number(entry.cachedAt || 0) > STATIC_REPOSITORY_CACHE_TTL_MS) {
    causalityCache.delete(normalizedKey)
    return null
  }
  return entry.value
}

function setCacheEntry(key = '', value) {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) return
  causalityCache.set(String(key || '').trim(), {
    cachedAt: Date.now(),
    value
  })
}

function normalizeCacheSignature(items = []) {
  return Array.from(new Set((items || []).map(item => String(item || '').trim()).filter(Boolean)))
    .sort()
    .join('|')
}

function withPending(key = '', queryFn) {
  const normalizedKey = String(key || '').trim()
  const pending = pendingCausalityCache.get(normalizedKey)
  if (pending) return pending

  const promise = Promise.resolve()
    .then(queryFn)
    .finally(() => {
      pendingCausalityCache.delete(normalizedKey)
    })
  pendingCausalityCache.set(normalizedKey, promise)
  return promise
}

function mapCausalityRow(row = {}) {
  return {
    causeProblemKey: row.cause_problem_key,
    effectProblemKey: row.effect_problem_key,
    relationType: row.relation_type || 'causes',
    relationStrength: clamp01(row.relation_strength),
    note: row.note || '',
    dataStatus: row.data_status || 'unknown'
  }
}

async function getCausalityEdges(problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return []
  const cacheSignature = `causality:${normalizeCacheSignature(safeKeys)}`
  const cached = getCacheEntry(cacheSignature)
  if (cached) {
    return cached
  }

  return withPending(cacheSignature, async () => {
    const cachedAfterWait = getCacheEntry(cacheSignature)
    if (cachedAfterWait) {
      return cachedAfterWait
    }

    const result = await models.$runSQL(
      `
        SELECT
          cause_problem_key,
          effect_problem_key,
          relation_type,
          relation_strength,
          note,
          data_status
        FROM ${table('problem_causality')}
        WHERE is_active = 1
          AND (
              cause_problem_key IN ${sqlInList(safeKeys)}
           OR effect_problem_key IN ${sqlInList(safeKeys)}
          )
        ORDER BY relation_strength DESC
      `,
      {}
    )

    const edges = (result?.data?.executeResultList || []).map(mapCausalityRow)
    setCacheEntry(cacheSignature, edges)
    return edges
  })
}

module.exports = {
  getCausalityEdges
}
