export function resolveDefaultQuestionOptionId(question = {}) {
  const options = Array.isArray(question?.options) ? question.options : []
  const defaultOptionId = String(question?.defaultOptionId || '').trim()
  const defaultOptionKey = String(question?.defaultOptionKey || '').trim().toLowerCase()

  if (defaultOptionId) {
    const matchedById = options.find(option => String(option?.optionId || '').trim() === defaultOptionId)
    if (matchedById?.optionId) {
      return matchedById.optionId
    }
  }

  if (defaultOptionKey) {
    const matchedByKey = options.find(option => String(option?.optionKey || '').trim().toLowerCase() === defaultOptionKey)
    if (matchedByKey?.optionId) {
      return matchedByKey.optionId
    }
  }

  const matchedDefaultOption = options.find(option => option?.isDefault)
  return matchedDefaultOption?.optionId || ''
}

export function normalizeOutcomeType(outcomeType = '') {
  return String(outcomeType || '').trim().toLowerCase()
}

function isEnglishLikeSymptomLabel(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized) {return false}
  return /[A-Za-z]/.test(normalized) && !/[\u4e00-\u9fff]/.test(normalized)
}

export function resolveDisplaySymptomCn(...candidates) {
  const candidate = candidates
    .map(item => String(item || '').trim())
    .find(Boolean)

  if (!candidate || isEnglishLikeSymptomLabel(candidate)) {
    return '待确认症状'
  }

  return candidate
}

export function mapSeverityToHealthText({ severity = 'medium', outcomeType = '', hasActiveQuestions = false } = {}) {
  const normalizedOutcomeType = normalizeOutcomeType(outcomeType)

  if (hasActiveQuestions) {return '待进一步确认'}
  if (normalizedOutcomeType === 'non_problematic') {return '暂未见明显问题'}
  if (normalizedOutcomeType === 'uncertain') {return '待进一步确认'}

  const key = String(severity || '').toLowerCase()
  if (key === 'critical') {return '严重问题'}
  if (key === 'high') {return '需要治疗'}
  if (key === 'low') {return '轻微问题'}
  return '需要治疗'
}

export function getHealthClass(status) {
  const classes = {
    健康: 'bg-green-100 text-green-700 px-3 py-1 rounded-full',
    暂未见明显问题: 'bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full',
    待进一步确认: 'bg-slate-100 text-slate-700 px-3 py-1 rounded-full',
    轻微问题: 'bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full',
    需要治疗: 'bg-orange-100 text-orange-700 px-3 py-1 rounded-full',
    严重问题: 'bg-red-100 text-red-700 px-3 py-1 rounded-full'
  }
  return classes[status] || classes['待进一步确认']
}

export function formatCausalityItem(item) {
  if (!item) {return ''}
  return `${item?.causeProblemKey || 'unknown'} → ${item?.effectProblemKey || 'unknown'}`
}

export function normalizeStringList(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => String(item || '').trim())
    .filter(Boolean)
}
