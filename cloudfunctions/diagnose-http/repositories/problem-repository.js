'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList } = require('./sql')
const { table } = require('../db/table-helper')

const STATIC_REPOSITORY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.DIAGNOSE_STATIC_CACHE_TTL_MS || 60000)
)
const staticCache = {
  problemsByKey: new Map(),
  explanationsByProblemKey: new Map()
}
const pendingStaticCache = {
  problemsBySignature: new Map(),
  explanationsBySignature: new Map()
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

function getCached(cache, key = '') {
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

function setCached(cache, key = '', value) {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return}
  cache.set(String(key || '').trim(), {
    cachedAt: Date.now(),
    value
  })
}

function mapProblemRow(row = {}) {
  return {
    problemKey: row.problem_key,
    problemName: row.problem_name || row.problem_key,
    problemCn: row.problem_cn || row.problem_key,
    problemType: row.problem_type || '',
    problemRole: row.problem_role || 'root_cause',
    definition: row.definition || '',
    defaultAction: row.default_action || '',
    defaultPrevention: row.default_prevention || '',
    displayNameCn: row.display_name_cn || row.problem_cn || row.problem_key,
    userDefinitionCn: row.user_definition_cn || row.definition || '',
    userActionCn: row.user_action_cn || row.default_action || '',
    userPreventionCn: row.user_prevention_cn || row.default_prevention || '',
    severityHintCn: row.severity_hint_cn || '中',
    urgencyHintCn: row.urgency_hint_cn || '中',
    dataStatus: row.data_status || 'unknown'
  }
}

function mapExplanationRow(row = {}) {
  return {
    problemKey: row.problem_key,
    displayNameCn: row.display_name_cn || '',
    resultSummaryCn: row.result_summary_cn || '',
    whyItHappensCn: row.why_it_happens_cn || '',
    whatToCheckNextCn: row.what_to_check_next_cn || '',
    firstAidCn: row.first_aid_cn || '',
    avoidCn: row.avoid_cn || '',
    reassuranceCn: row.reassurance_cn || ''
  }
}

async function getProblemsByKeys(problemKeys = []) {
  const safeKeys = Array.from(
    new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  )
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.problemsByKey, key)
    if (cached) {
      cachedRows.push(cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPending(
    pendingStaticCache.problemsBySignature,
    normalizeCacheSignature(missingKeys),
    () => models.$runSQL(
      `
        SELECT
          problem_key,
          problem_name,
          problem_cn,
          problem_type,
          problem_role,
          definition,
          default_action,
          default_prevention,
          display_name_cn,
          user_definition_cn,
          user_action_cn,
          user_prevention_cn,
          severity_hint_cn,
          urgency_hint_cn,
          data_status
        FROM ${table('problems')}
        WHERE problem_key IN ${sqlInList(missingKeys)}
      `,
      {}
    )
  )

  const rows = (result?.data?.executeResultList || []).map(mapProblemRow)
  const rowsByKey = new Map(rows.map(row => [String(row.problemKey || '').trim(), row]))
  for (const key of missingKeys) {
    setCached(staticCache.problemsByKey, key, rowsByKey.get(key) || null)
  }
  return [
    ...cachedRows,
    ...missingKeys.map(key => getCached(staticCache.problemsByKey, key)).filter(Boolean)
  ]
}

async function getExplanationsByProblemKeys(problemKeys = []) {
  const safeKeys = Array.from(
    new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  )
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.explanationsByProblemKey, key)
    if (cached) {
      cachedRows.push(cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPending(
    pendingStaticCache.explanationsBySignature,
    normalizeCacheSignature(missingKeys),
    () => models.$runSQL(
      `
        SELECT
          problem_key,
          display_name_cn,
          result_summary_cn,
          why_it_happens_cn,
          what_to_check_next_cn,
          first_aid_cn,
          avoid_cn,
          reassurance_cn
        FROM ${table('diagnosis_result_explanations')}
        WHERE problem_key IN ${sqlInList(missingKeys)}
          AND is_active = 1
          AND review_status = 'audited'
      `,
      {}
    )
  )

  const rows = (result?.data?.executeResultList || []).map(mapExplanationRow)
  const rowsByKey = new Map(rows.map(row => [String(row.problemKey || '').trim(), row]))
  for (const key of missingKeys) {
    setCached(staticCache.explanationsByProblemKey, key, rowsByKey.get(key) || null)
  }
  return [
    ...cachedRows,
    ...missingKeys.map(key => getCached(staticCache.explanationsByProblemKey, key)).filter(Boolean)
  ]
}

module.exports = {
  getProblemsByKeys,
  getExplanationsByProblemKeys
}
