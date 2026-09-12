import { isCareBehaviorWateringTimelineQuestion } from '@/utils/care-behavior-timeline.js'

function normalizeText(value = '') {
  return String(value || '').trim()
}

function sanitizeTemplateText(value = '') {
  return String(value || '')
    .replace(/\{\{[^}]+\}\}/g, '')
    .replace(/[\r\n]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isFrequencyOption(optionKey = '', optionText = '', optionKeys = []) {
  if (optionKeys.includes(optionKey)) {
    return true
  }
  if (!optionText) {
    return false
  }
  return optionKeys.some(item => optionText.includes(item.replaceAll('_', '')))
}

function isYellowingQuestion(question = {}) {
  const questionKey = normalizeText(question?.questionKey)
  const questionText = normalizeText(
    question?.questionTextCn || question?.questionTextUserCn || question?.questionText || ''
  )
  return questionKey.includes('yellowing') || questionText.includes('黄叶')
}

function isYellowingWateringQuestion(questionKey = '', packageTopic = '') {
  return (
    questionKey.includes('watering_frequency_context') ||
    questionKey.includes('watering_context') ||
    questionKey.includes('watering') ||
    packageTopic.includes('watering')
  )
}

function isYellowingFertilizationQuestion(questionKey = '', packageTopic = '') {
  return (
    questionKey.includes('fertilization_growth_context') ||
    questionKey.includes('fertilization_context') ||
    questionKey.includes('fertilization_reference') ||
    questionKey.includes('fertilization') ||
    packageTopic.includes('fertilization')
  )
}

function resolveYellowingQuestionOptionText(question = {}, option = {}) {
  if (!isYellowingQuestion(question)) {
    return ''
  }
  const optionKey = normalizeText(
    option?.optionKey || option?.value || option?.optionId || option?.id || ''
  )
  const optionText = normalizeText(
    option?.optionTextUserCn ||
      option?.optionTextCn ||
      option?.text ||
      option?.optionText ||
      option?.label ||
      ''
  )
  const questionKey = normalizeText(question?.questionKey)
  const packageTopic = normalizeText(question?.packageTopic)

  if (isYellowingWateringQuestion(questionKey, packageTopic)) {
    if (
      isFrequencyOption(optionKey, optionText, [
        'often_wet',
        'more_wet',
        'too_wet',
        'over_wet',
        'yes'
      ])
    ) {
      return '近2周 2 次以上'
    }
    if (
      isFrequencyOption(optionKey, optionText, [
        'normal_or_stable',
        'no_change',
        'normal',
        'stable'
      ])
    ) {
      return '近2周 1-2 次'
    }
    if (
      isFrequencyOption(optionKey, optionText, [
        'often_dry',
        'more_dry',
        'not_enough',
        'dry',
        'lack'
      ])
    ) {
      return '近2周 0 次'
    }
  }
  if (isYellowingFertilizationQuestion(questionKey, packageTopic)) {
    if (
      isFrequencyOption(optionKey, optionText, [
        'low_or_no_fertilizer',
        'no',
        'none',
        'not_fertilized'
      ])
    ) {
      return '近1个月 0 次'
    }
    if (
      isFrequencyOption(optionKey, optionText, ['normal_light_fertilizer', 'normal', 'appropriate'])
    ) {
      return '近1个月 1-2 次'
    }
    if (
      isFrequencyOption(optionKey, optionText, [
        'recent_heavy_fertilizer_or_repot',
        'heavy_fertilizer',
        'heavy',
        'repot',
        'fertilize'
      ])
    ) {
      return '近1个月 2 次以上'
    }
  }
  return ''
}

export function getQuestionTitle(question = {}) {
  if (isCareBehaviorWateringTimelineQuestion(question)) {
    return '请您选择在过去的10天内，哪几天浇了水？'
  }
  return sanitizeTemplateText(
    question?.questionTextUserCn ||
      question?.questionTextCn ||
      question?.questionText ||
      question?.text ||
      ''
  )
}

export function getQuestionHelpText(question = {}) {
  return sanitizeTemplateText(
    question?.helpTextCn || question?.helpText || question?.questionHelpText || ''
  )
}

export function getOptionText(question = {}, option = {}) {
  const text = sanitizeTemplateText(
    option?.optionTextUserCn ||
      option?.optionTextCn ||
      option?.text ||
      option?.optionText ||
      option?.label ||
      option?.desc ||
      ''
  )
  return resolveYellowingQuestionOptionText(question, option) || text
}

export function getOptionDescription(option = {}) {
  return sanitizeTemplateText(
    option?.descriptionCn || option?.optionDescription || option?.description || option?.desc || ''
  )
}

export function estimateQuestionSwiperHeight(question) {
  if (!question) {
    return 280
  }
  const options = Array.isArray(question.options) ? question.options : []
  const titleRows = Math.ceil(Math.max(getQuestionTitle(question).length - 26, 0) / 22)
  const helpRows = getQuestionHelpText(question)
    ? Math.ceil(getQuestionHelpText(question).length / 34)
    : 0
  const timelineHeight = isCareBehaviorWateringTimelineQuestion(question) ? 220 : 0
  const optionHeight = options.reduce(
    (sum, option) =>
      sum + 52 + Math.max(0, Math.ceil(getOptionText(question, option).length / 18) - 1) * 18,
    0
  )
  return Math.max(
    280,
    Math.min(1020, 118 + titleRows * 18 + helpRows * 16 + timelineHeight + optionHeight + 72)
  )
}
