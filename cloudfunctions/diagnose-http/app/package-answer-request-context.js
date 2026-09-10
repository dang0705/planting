'use strict'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function mergeContext(primary = {}, fallback = {}) {
  const result = {}
  for (const key of [
    'source',
    'platform',
    'reviewSourceType',
    'visualInputVersion',
    'auditLabel',
    'auditFileName',
    'auditCaseKey',
    'diagnosisProfile',
    'entrySource'
  ]) {
    const value = normalizeText(primary?.[key] || fallback?.[key])
    if (value) {
      result[key] = value
    }
  }
  const structuredImageCount = Number(primary?.structuredImageCount || fallback?.structuredImageCount || 0)
  if (structuredImageCount > 0) {
    result.structuredImageCount = structuredImageCount
  }
  return Object.keys(result).length ? result : null
}

function normalizeRequestClientContext(payload = {}, conservative = null) {
  return mergeContext(
    payload?.clientContext || {},
    mergeContext(
      {
        source: payload?.source,
        platform: payload?.platform,
        reviewSourceType: payload?.reviewSourceType,
        visualInputVersion: payload?.visualInputVersion,
        structuredImageCount: payload?.structuredImageCount,
        auditLabel: payload?.auditLabel,
        auditFileName: payload?.auditFileName,
        auditCaseKey: payload?.auditCaseKey,
        diagnosisProfile: payload?.diagnosisProfile,
        entrySource: payload?.entrySource
      },
      conservative
    )
  )
}

module.exports = { normalizeRequestClientContext }
