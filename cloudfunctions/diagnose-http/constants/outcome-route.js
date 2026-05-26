'use strict'

const ROUTE_MODE = Object.freeze({
  MULTI_OUTCOME_ROUTE: 'multi_outcome_route'
})

const ROUTE_STATUS = Object.freeze({
  CANDIDATE: 'candidate',
  NEEDS_QUESTION: 'needs_question',
  STRENGTHENED: 'strengthened',
  WEAKENED: 'weakened',
  DISPLAY_ELIGIBLE: 'display_eligible',
  CLOSURE_ELIGIBLE: 'closure_eligible',
  BLOCKED: 'blocked'
})

const GATE_RESULT = Object.freeze({
  PASS: 'pass',
  FAIL: 'fail',
  BLOCK: 'block',
  NEED_MORE_INFO: 'need_more_info',
  CONFLICT: 'conflict'
})

const OUTCOME_EFFECT_TYPE = Object.freeze({
  SUPPORT: 'support',
  WEAKEN: 'weaken',
  EXCLUDE: 'exclude',
  REDIRECT: 'redirect',
  NEUTRAL: 'neutral'
})

const ROUTE_FALLBACK_POLICY = Object.freeze({
  UNCERTAIN: 'uncertain'
})

module.exports = {
  ROUTE_MODE,
  ROUTE_STATUS,
  GATE_RESULT,
  OUTCOME_EFFECT_TYPE,
  ROUTE_FALLBACK_POLICY
}
