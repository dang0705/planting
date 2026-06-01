const CARE_BEHAVIOR_UNCERTAIN_OPTION_PATTERNS = [
  'unknown',
  'unclear',
  'not_sure',
  'unsure',
  'not_noticed',
  'forgot',
  '说不清',
  '不清楚',
  '没留意',
  '没注意',
  '不知道',
  '不确定',
  '记不清'
]

const CARE_BEHAVIOR_TIMELINE_SENTINEL_OPTION_PATTERNS = [
  'care_behavior_timeline',
  'timeline_recorded',
  'timeline_provided'
]

function pickByKeys(source = {}, keys = []) {
  if (!source || typeof source !== 'object') {
    return undefined
  }
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      return source[key]
    }
  }
  return undefined
}

function normalizeOptionSearchText(option = {}) {
  return [
    option?.optionKey,
    option?.optionId,
    option?.id,
    option?.text,
    option?.optionText,
    option?.label,
    option?.desc
  ]
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

function compactOptionSearchText(value = '') {
  return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function hasCareBehaviorTimelineSource(question = {}) {
  const sourceKeys = ['careBehaviorTimeline', 'care_behavior_timeline', 'careBehavior', 'timeline', 'timelineSource', 'timeline_source']
  const nestedSources = [
    pickByKeys(question || {}, sourceKeys),
    pickByKeys(question?.payload || {}, sourceKeys),
    pickByKeys(question?.data || {}, sourceKeys),
    pickByKeys(question?.meta || {}, sourceKeys)
  ]
  return nestedSources.some(source => {
    if (!source) {
      return false
    }
    if (Array.isArray(source)) {
      return source.length > 0
    }
    if (typeof source !== 'object') {
      return Boolean(String(source || '').trim())
    }
    return Object.keys(source).length > 0
  })
}

function getQuestionText(question = {}) {
  return String(
    question?.questionTextCn ||
    question?.questionTextUserCn ||
    question?.questionText ||
    question?.text ||
    ''
  ).trim().toLowerCase()
}

function isExplicitCareBehaviorTimelineQuestion(question = {}) {
  return String(question?.uiVariant || '').trim() === 'care_behavior_timeline' ||
    hasCareBehaviorTimelineSource(question)
}

function isLegacyWateringTimelineTarget(question = {}) {
  const target = String(question?.targetDimension || '').trim().toLowerCase()
  const qk = String(question?.questionKey || '').trim().toLowerCase()
  return qk.includes('watering_frequency_context') ||
    qk.includes('watering_context') ||
    target === 'watering' ||
    target === 'watering_context' ||
    target === 'watering_frequency_context'
}

export function isUncertainCareBehaviorOption(option = {}) {
  const searchText = normalizeOptionSearchText(option)
  if (!searchText) {
    return false
  }
  const compactSearchText = compactOptionSearchText(searchText)
  return CARE_BEHAVIOR_UNCERTAIN_OPTION_PATTERNS.some(pattern => {
    const normalizedPattern = compactOptionSearchText(pattern)
    return searchText.includes(pattern.toLowerCase()) || compactSearchText.includes(normalizedPattern)
  })
}

export function isCareBehaviorTimelineSentinelOption(option = {}) {
  const searchText = normalizeOptionSearchText(option)
  if (!searchText) {
    return false
  }
  const compactSearchText = compactOptionSearchText(searchText)
  return CARE_BEHAVIOR_TIMELINE_SENTINEL_OPTION_PATTERNS.some(pattern => {
    const normalizedPattern = compactOptionSearchText(pattern)
    return searchText.includes(pattern) || compactSearchText.includes(normalizedPattern)
  })
}

export function isLegacyWateringTimelineQuestion(question = {}) {
  if (isExplicitCareBehaviorTimelineQuestion(question)) {
    return false
  }
  return isLegacyWateringTimelineTarget(question)
}

export function isCareBehaviorTimelineQuestion(question = {}) {
  return isExplicitCareBehaviorTimelineQuestion(question) || isLegacyWateringTimelineQuestion(question)
}

export function isCareBehaviorWateringTimelineQuestion(question = {}) {
  if (isLegacyWateringTimelineQuestion(question)) {
    return true
  }

  if (!isExplicitCareBehaviorTimelineQuestion(question)) {
    return false
  }

  const target = String(question?.targetDimension || '').trim().toLowerCase()
  const qk = String(question?.questionKey || '').trim().toLowerCase()
  const text = getQuestionText(question)

  return target.includes('watering') ||
    qk.includes('watering') ||
    text.includes('浇水') ||
    text.includes('watering')
}

export function getVisibleCareBehaviorOptions(question = {}) {
  const options = Array.isArray(question?.options) ? question.options : []
  if (!isCareBehaviorWateringTimelineQuestion(question)) {
    return options
  }
  return options.filter(option => isUncertainCareBehaviorOption(option))
}

function resolveQuestionDefaultOption(question = {}, options = []) {
  const defaultOptionId = String(question?.defaultOptionId || '').trim()
  const defaultOptionKey = String(question?.defaultOptionKey || '').trim().toLowerCase()

  if (defaultOptionId) {
    const byId = options.find(option => String(option?.optionId || '').trim() === defaultOptionId)
    if (byId) {
      return byId
    }
  }

  if (defaultOptionKey) {
    const byKey = options.find(option => String(option?.optionKey || '').trim().toLowerCase() === defaultOptionKey)
    if (byKey) {
      return byKey
    }
  }

  if (options.some(option => option?.isDefault)) {
    return options.find(option => option?.isDefault) || null
  }

  return null
}

export function resolveCareBehaviorTimelineAutoAnswerOptionId(question = {}) {
  if (!isCareBehaviorWateringTimelineQuestion(question)) {
    return ''
  }

  if (isLegacyWateringTimelineQuestion(question)) {
    return ''
  }

  const options = Array.isArray(question?.options) ? question.options : []
  const sentinelOption = options.find(option => isCareBehaviorTimelineSentinelOption(option)) || null
  if (!sentinelOption?.optionId) {
    return ''
  }

  const hasExplicitDefaultHint = Boolean(
    String(question?.defaultOptionId || '').trim() ||
    String(question?.defaultOptionKey || '').trim() ||
    options.some(option => option?.isDefault)
  )

  if (!hasExplicitDefaultHint) {
    return sentinelOption.optionId
  }

  const defaultOption = resolveQuestionDefaultOption(question, options)
  if (!defaultOption) {
    return sentinelOption.optionId
  }

  return isCareBehaviorTimelineSentinelOption(defaultOption) ? sentinelOption.optionId : ''
}

export function resolveCareBehaviorTimelineRecordedAnswerOptionId(question = {}) {
  if (!isCareBehaviorWateringTimelineQuestion(question) || isLegacyWateringTimelineQuestion(question)) {
    return ''
  }

  const options = Array.isArray(question?.options) ? question.options : []
  const sentinelOption = options.find(option => isCareBehaviorTimelineSentinelOption(option)) || null
  if (sentinelOption?.optionId) {
    return sentinelOption.optionId
  }

  return 'care_behavior_timeline'
}

export function resolveCareBehaviorTimelineAnswerOptionId(question = {}) {
  return resolveCareBehaviorTimelineAutoAnswerOptionId(question)
}

export function isCareBehaviorTimelineUnclearAnswer(question = {}, answerId = '') {
  if (!isCareBehaviorWateringTimelineQuestion(question)) {
    return false
  }

  const normalizedAnswerId = String(answerId || '').trim()
  if (!normalizedAnswerId) {
    return false
  }

  const options = Array.isArray(question?.options) ? question.options : []
  const answerOption = options.find(option => String(option?.optionId || '').trim() === normalizedAnswerId)
  return Boolean(answerOption && isUncertainCareBehaviorOption(answerOption))
}

export function isCareBehaviorTimelineSentinelAnswer(question = {}, answerId = '') {
  if (!isCareBehaviorWateringTimelineQuestion(question)) {
    return false
  }

  const normalizedAnswerId = String(answerId || '').trim()
  if (!normalizedAnswerId) {
    return false
  }

  if (normalizedAnswerId === 'care_behavior_timeline') {
    return true
  }

  const options = Array.isArray(question?.options) ? question.options : []
  const answerOption = options.find(option => String(option?.optionId || '').trim() === normalizedAnswerId)
  return Boolean(answerOption && isCareBehaviorTimelineSentinelOption(answerOption))
}

export function shouldIncludeCareBehaviorTimelineQuestion(question = {}, answerId = '') {
  if (!isCareBehaviorWateringTimelineQuestion(question)) {
    return true
  }
  return isCareBehaviorTimelineSentinelAnswer(question, answerId)
}
