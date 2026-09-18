'use strict'

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
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

  const conservativePolicy = normalizeText(routeDecision.conservativePolicy)
  if (!conservativePolicy) {return true}

  return false
}

module.exports = {
  normalizeRouteDecisionCause,
  isAuthoritativeRouteDecision
}
