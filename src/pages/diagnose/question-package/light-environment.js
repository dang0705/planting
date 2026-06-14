const LIGHT_CONTEXT_TOPIC = 'light_change_context'

export const LIGHT_FACING_LABELS = Object.freeze({
  north: '北',
  north_east: '东北',
  east: '东',
  south_east: '东南',
  south: '南',
  south_west: '西南',
  west: '西',
  north_west: '西北',
  unknown: '不确定',
  no_window: '无窗'
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function resolveQuestionKey(question = {}) {
  return normalizeText(question?.questionKey || question?.questionId || question?.id || '')
}

export function isLightEnvironmentQuestion(question = {}) {
  const questionKey = resolveQuestionKey(question)
  const packageTopic = normalizeText(question?.packageTopic || question?.package_topic)
  return questionKey.includes(LIGHT_CONTEXT_TOPIC) || packageTopic === LIGHT_CONTEXT_TOPIC
}

function findOptionKey(question = {}, candidates = []) {
  const options = Array.isArray(question?.options) ? question.options : []
  const candidateSet = new Set(candidates)
  const matched = options.find(option => {
    const optionKey = normalizeText(
      option?.optionKey || option?.optionId || option?.value || option?.id
    )
    return candidateSet.has(optionKey)
  })
  return normalizeText(
    matched?.optionKey || matched?.optionId || matched?.value || matched?.id || candidates[0]
  )
}

export function resolveLightEnvironmentAnswerKey(question = {}, environment = {}) {
  if (environment.windowType === 'no_window') {
    return findOptionKey(question, ['weaker_light', 'no_clear_change', 'unknown'])
  }
  if (
    environment.hasDirectSun === true &&
    ['west', 'south', 'balcony'].includes(environment.facing)
  ) {
    return findOptionKey(question, ['stronger_direct_light', 'no_clear_change', 'unknown'])
  }
  return findOptionKey(question, ['no_clear_change', 'weaker_light', 'unknown'])
}

export function compassDirectionToFacing(direction) {
  const degree = Number(direction)
  if (!Number.isFinite(degree)) {
    return 'unknown'
  }
  const normalizedDegree = ((degree % 360) + 360) % 360
  const sector = Math.floor((normalizedDegree + 22.5) / 45) % 8
  return ['north', 'north_east', 'east', 'south_east', 'south', 'south_west', 'west', 'north_west'][
    sector
  ]
}

export function getLightFacingLabel(facing = '') {
  return LIGHT_FACING_LABELS[normalizeText(facing)] || LIGHT_FACING_LABELS.unknown
}

export function createDefaultLightEnvironment() {
  return {
    facing: 'south',
    windowType: 'standard',
    position: 'window_side',
    hasDirectSun: false,
    distance: 1
  }
}

export function sanitizeLightEnvironment(value = {}) {
  const fallback = createDefaultLightEnvironment()
  const distance = Number(value?.distance)
  return {
    facing: normalizeText(value?.facing) || fallback.facing,
    windowType: normalizeText(value?.windowType) || fallback.windowType,
    position: normalizeText(value?.position) || fallback.position,
    hasDirectSun: value?.hasDirectSun === true,
    distance: Number.isFinite(distance) ? Math.max(0, Math.min(10, distance)) : fallback.distance
  }
}

export function getLightEnvironmentSignature(value = {}) {
  const normalized = sanitizeLightEnvironment(value)
  return JSON.stringify(normalized)
}
