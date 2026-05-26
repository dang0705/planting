'use strict'

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeKey(value = '') {
  return normalizeText(value)
}

function normalizeRouteDecisionCause(decisionCause = null) {
  if (!decisionCause || typeof decisionCause !== 'object') {
    return null
  }

  const decisionCauseKey = normalizeKey(decisionCause.decisionCauseKey || decisionCause.key || '')
  if (!decisionCauseKey) {
    return null
  }

  return {
    decisionCauseKey,
    decisionCauseCategory: normalizeText(
      decisionCause.decisionCauseCategory || decisionCause.category || ''
    ),
    decisionCauseText: normalizeText(decisionCause.decisionCauseText || decisionCause.text || ''),
    decisionCauseDetails:
      decisionCause.decisionCauseDetails && typeof decisionCause.decisionCauseDetails === 'object'
        ? decisionCause.decisionCauseDetails
        : {}
  }
}

function isAuthoritativeRouteDecision(routeDecision = null) {
  if (!routeDecision || typeof routeDecision !== 'object') {
    return false
  }

  const fallbackPolicy = normalizeText(routeDecision.fallbackPolicy)
  if (!fallbackPolicy) {return true}

  return false
}

module.exports = {
  normalizeRouteDecisionCause,
  isAuthoritativeRouteDecision
}
