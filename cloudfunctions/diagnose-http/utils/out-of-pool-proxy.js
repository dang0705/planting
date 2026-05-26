'use strict'

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeClosestHint(value = '') {
  const normalized = normalizeText(value, '').toLowerCase()
  if (!normalized || ['none', 'null', 'n/a', 'na', 'unknown', 'no'].includes(normalized)) {
    return ''
  }
  return normalized
}

function buildOutOfPoolSearchText(candidate = {}) {
  return [
    candidate?.raw_visual_name_cn,
    candidate?.raw_visual_name_en,
    candidate?.reason
  ]
    .map(item => normalizeText(item, '').toLowerCase())
    .filter(Boolean)
    .join(' ')
}

function resolveGovernedProxyMapping(candidate = {}, proxyMappings = []) {
  const searchText = buildOutOfPoolSearchText(candidate)
  if (!searchText) {
    return null
  }

  return (Array.isArray(proxyMappings) ? proxyMappings : []).find(mapping => {
    if (String(mapping?.reviewStatus || '').trim() !== 'audited') {
      return false
    }
    return (Array.isArray(mapping?.matchTerms) ? mapping.matchTerms : []).some(term => {
      const normalizedTerm = normalizeText(term, '').toLowerCase()
      return normalizedTerm && searchText.includes(normalizedTerm)
    })
  }) || null
}

function resolveOutOfPoolProxyCandidate(candidate = {}, { proxyMappings = [] } = {}) {
  const modelClosestSymptomKey = normalizeClosestHint(
    candidate?.closest_symptom_key_hint || candidate?.closestSymptomKeyHint || ''
  )
  const governedMapping = resolveGovernedProxyMapping(candidate, proxyMappings)

  if (governedMapping?.targetSymptomKey) {
    return {
      symptomKey: normalizeText(governedMapping.targetSymptomKey, '').toLowerCase(),
      evidenceRole: 'proxy',
      hintScope: 'out_of_pool_proxy',
      hintSource: 'governed_out_of_pool_proxy_mapping',
      mappingId: normalizeText(governedMapping.mappingId, ''),
      mappingRationale: normalizeText(governedMapping.rationale, '')
    }
  }

  if (modelClosestSymptomKey) {
    return {
      symptomKey: modelClosestSymptomKey,
      evidenceRole: 'proxy',
      hintScope: 'out_of_pool_proxy',
      hintSource: 'model_closest_hint',
      mappingId: '',
      mappingRationale: ''
    }
  }

  return {
    symptomKey: '',
    evidenceRole: 'audit',
    hintScope: 'audit_only',
    hintSource: 'raw_out_of_pool_audit',
    mappingId: '',
    mappingRationale: ''
  }
}

function normalizeStringList(value = []) {
  return Array.from(
    new Set(
      (Array.isArray(value) ? value : [])
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
  )
}

function buildOutOfPoolSymptomHintsFromCandidates(entries = [], { proxyMappings = [] } = {}) {
  const hintMap = new Map()

  for (const entry of Array.isArray(entries) ? entries : []) {
    const candidate = entry?.candidate && typeof entry.candidate === 'object'
      ? entry.candidate
      : entry
    if (!candidate || typeof candidate !== 'object') {
      continue
    }

    const organKey = normalizeText(entry?.organKey || candidate?.normalized_organ || 'unknown', 'unknown')
    const proxyCandidate = resolveOutOfPoolProxyCandidate(candidate, { proxyMappings })
    const symptomKey = proxyCandidate.symptomKey || ''
    const rawVisualKey = normalizeText(
      candidate?.raw_visual_name_cn || candidate?.raw_visual_name_en || candidate?.reason || '',
      'unknown'
    )
    const key = symptomKey || `audit_only:${organKey}:${rawVisualKey}`
    const current = hintMap.get(key) || {
      symptom_key: symptomKey,
      closest_symptom_key_hint: symptomKey,
      evidence_role: proxyCandidate.evidenceRole,
      hint_scope: proxyCandidate.hintScope,
      hint_sources: [],
      support_count: 0,
      raw_visual_names_cn: [],
      raw_visual_names_en: [],
      reasons: [],
      support_organs: [],
      mapping_ids: [],
      mapping_rationales: []
    }

    current.support_count += 1
    if (candidate?.raw_visual_name_cn) {
      current.raw_visual_names_cn.push(normalizeText(candidate.raw_visual_name_cn, ''))
    }
    if (candidate?.raw_visual_name_en) {
      current.raw_visual_names_en.push(normalizeText(candidate.raw_visual_name_en, ''))
    }
    if (candidate?.reason) {
      current.reasons.push(normalizeText(candidate.reason, ''))
    }
    if (proxyCandidate.mappingId) {
      current.mapping_ids.push(proxyCandidate.mappingId)
    }
    if (proxyCandidate.mappingRationale) {
      current.mapping_rationales.push(proxyCandidate.mappingRationale)
    }
    current.hint_sources.push(proxyCandidate.hintSource)
    if (organKey && organKey !== 'unknown') {
      current.support_organs.push(organKey)
    }

    hintMap.set(key, current)
  }

  return Array.from(hintMap.values())
    .map(item => ({
      ...item,
      raw_visual_names_cn: normalizeStringList(item.raw_visual_names_cn || []),
      raw_visual_names_en: normalizeStringList(item.raw_visual_names_en || []),
      reasons: normalizeStringList(item.reasons || []),
      support_organs: normalizeStringList(item.support_organs || []),
      hint_sources: normalizeStringList(item.hint_sources || []),
      mapping_ids: normalizeStringList(item.mapping_ids || []),
      mapping_rationales: normalizeStringList(item.mapping_rationales || [])
    }))
    .sort((a, b) => Number(b.support_count || 0) - Number(a.support_count || 0))
}

module.exports = {
  buildOutOfPoolSymptomHintsFromCandidates,
  normalizeClosestHint,
  resolveOutOfPoolProxyCandidate
}
