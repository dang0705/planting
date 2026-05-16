'use strict'

const { clamp01 } = require('./sql')

const STATIC_REPOSITORY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.DIAGNOSE_STATIC_CACHE_TTL_MS || 60000)
)

const priorCache = {
  genusCareProfileByGenusFamily: new Map(),
  linkedCandidatePriorsByPlantIdentity: new Map(),
  candidateProblemPriorsByPlantId: new Map(),
  genusCandidatePriorsByGenus: new Map(),
  hostCandidatePriorsByHostKey: new Map(),
  genusCompatibilityByGenusAndProblemSet: new Map(),
  hostCompatibilityByHostContextAndProblemSet: new Map()
}

const pendingPriorCache = {
  genusCareProfileByGenusFamily: new Map(),
  linkedDiagnosisTargetsByIdentity: new Map(),
  linkedCandidatePriorsByPlantIdentity: new Map(),
  candidateProblemPriorsByPlantId: new Map(),
  genusCandidatePriorsByGenus: new Map(),
  hostCandidatePriorsByHostKey: new Map(),
  genusCompatibilityByGenusAndProblemSet: new Map(),
  hostCompatibilityByHostContextAndProblemSet: new Map()
}

function getCacheEntry(cache, key = '') {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return null}
  const normalizedKey = String(key || '').trim()
  const entry = cache.get(normalizedKey)
  if (!entry) {return null}
  if (Date.now() - Number(entry.cachedAt || 0) > STATIC_REPOSITORY_CACHE_TTL_MS) {
    cache.delete(normalizedKey)
    return null
  }
  return entry.value
}

function setCacheEntry(cache, key = '', value) {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return}
  cache.set(String(key || '').trim(), {
    cachedAt: Date.now(),
    value
  })
}

function normalizeCacheSignature(items = []) {
  return Array.from(new Set((items || []).map(item => String(item || '').trim()).filter(Boolean)))
    .sort()
    .join('|')
}

function withPending(cache, key = '', queryFn) {
  const normalizedKey = String(key || '').trim()
  const pending = cache.get(normalizedKey)
  if (pending) {return pending}

  const promise = Promise.resolve()
    .then(queryFn)
    .finally(() => {
      cache.delete(normalizedKey)
    })
  cache.set(normalizedKey, promise)
  return promise
}

function buildPlantIdentityCacheKey(plantContext = {}) {
  return normalizeCacheSignature([
    String(plantContext?.plantIdentityId || '').trim(),
    String(plantContext?.identityResolutionStatus || '').trim(),
    String(plantContext?.genus || '').trim(),
    String(plantContext?.family || '').trim(),
    String(plantContext?.category || '').trim()
  ])
}

function buildHostContextCacheKey({ genus = '', family = '', category = '' } = {}) {
  return normalizeCacheSignature([
    String(genus || '').trim(),
    String(family || '').trim(),
    String(category || '').trim()
  ])
}

function buildProblemSetCacheKey(problemKeys = []) {
  return normalizeCacheSignature((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean))
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

function normalizeCareStrategy(value) {
  const parsed = parseJsonField(value, null)
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }

  return Object.keys(parsed).length ? parsed : null
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

module.exports = {
  priorCache,
  pendingPriorCache,
  getCacheEntry,
  setCacheEntry,
  withPending,
  buildPlantIdentityCacheKey,
  buildHostContextCacheKey,
  buildProblemSetCacheKey,
  normalizeCareStrategy,
  mapCandidateRow,
  normalizeText
}
