import {
  createInitialAirEnvironmentInput,
  isAirEnvironmentAnswerReady,
  sanitizeAirEnvironmentInput
} from './air-environment.js'

export const AIR_ENVIRONMENT_SCHEMA_VERSION = 3
export const AIR_ENVIRONMENT_QUESTION_KEY = 'air_exchange_frequency'
export const QUICK_AIR_ENVIRONMENT_OPTIONS = Object.freeze([
  Object.freeze({
    key: 'frequent',
    label: '高频换气',
    description: '每天多次或长时间开窗，新风也经常运行。'
  }),
  Object.freeze({
    key: 'regular',
    label: '日常换气',
    description: '通常每天一次或隔天开窗、开新风。'
  }),
  Object.freeze({
    key: 'rare',
    label: '很少换气',
    description: '每周一两次，或基本不开窗、新风。'
  })
])

const QUICK_OPTION_KEYS = new Set(QUICK_AIR_ENVIRONMENT_OPTIONS.map(option => option.key))

function clone(value) {
  return value === null || value === undefined ? value : JSON.parse(JSON.stringify(value))
}

export function normalizeQuickAirEnvironmentAnswer(value = null) {
  const questionKey = String(value?.questionKey || '').trim()
  const optionKey = String(value?.optionKey || '').trim()
  if (questionKey !== AIR_ENVIRONMENT_QUESTION_KEY || !QUICK_OPTION_KEYS.has(optionKey)) {
    return null
  }
  return { questionKey, optionKey }
}

export function buildQuickAirEnvironmentAssessment(draft = {}) {
  const optionKey = String(draft?.selectedOptionKey || '').trim()
  if (!QUICK_OPTION_KEYS.has(optionKey)) {
    return { ok: false, userMessage: '请选择植物所处空间的换气频率' }
  }
  return {
    ok: true,
    value: {
      schemaVersion: AIR_ENVIRONMENT_SCHEMA_VERSION,
      mode: 'quick',
      quickAnswer: { questionKey: AIR_ENVIRONMENT_QUESTION_KEY, optionKey },
      advancedInput: null
    }
  }
}

export function buildAdvancedAirEnvironmentAssessment(draft = {}) {
  const advancedInput = sanitizeAirEnvironmentInput(draft)
  if (!isAirEnvironmentAnswerReady(advancedInput)) {
    return { ok: false, userMessage: '请完成空气环境信息' }
  }
  return {
    ok: true,
    value: {
      schemaVersion: AIR_ENVIRONMENT_SCHEMA_VERSION,
      mode: 'advanced',
      quickAnswer: null,
      advancedInput: clone(advancedInput)
    }
  }
}

export function normalizeAirEnvironmentAssessment(value = null) {
  if (Number(value?.schemaVersion) !== AIR_ENVIRONMENT_SCHEMA_VERSION) {
    return null
  }
  const result =
    value.mode === 'quick'
      ? buildQuickAirEnvironmentAssessment({ selectedOptionKey: value.quickAnswer?.optionKey })
      : value.mode === 'advanced'
        ? buildAdvancedAirEnvironmentAssessment(value.advancedInput)
        : null
  return result?.ok ? result.value : null
}

export const isAirEnvironmentAssessmentReady = value =>
  Boolean(normalizeAirEnvironmentAssessment(value))

export function normalizeAirEnvironmentProfile(value = null) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  if (Number(value.schemaVersion) === AIR_ENVIRONMENT_SCHEMA_VERSION) {
    const quick = normalizeQuickAirEnvironmentAnswer(value.completedModes?.quick)
    const advancedCandidate = sanitizeAirEnvironmentInput(value.completedModes?.advanced)
    const advanced = isAirEnvironmentAnswerReady(advancedCandidate) ? advancedCandidate : null
    const requestedMode = value.activeMode === 'quick' ? 'quick' : 'advanced'
    const activeMode =
      requestedMode === 'quick' && quick
        ? 'quick'
        : requestedMode === 'advanced' && advanced
          ? 'advanced'
          : quick
            ? 'quick'
            : advanced
              ? 'advanced'
              : null
    if (!activeMode) {
      return null
    }
    return {
      schemaVersion: AIR_ENVIRONMENT_SCHEMA_VERSION,
      activeMode,
      completedModes: { quick, advanced: clone(advanced) },
      locationBinding: clone(value.locationBinding || {}),
      updatedAt: String(value.updatedAt || '').trim()
    }
  }
  const advanced = sanitizeAirEnvironmentInput(value.input || value)
  if (!isAirEnvironmentAnswerReady(advanced)) {
    return null
  }
  return {
    schemaVersion: Number(value.schemaVersion || 1),
    input: clone(advanced),
    locationBinding: clone(value.locationBinding || {}),
    updatedAt: String(value.updatedAt || '').trim()
  }
}

export function getCompletedAdvancedAirEnvironmentInput(profile = null) {
  const normalized = normalizeAirEnvironmentProfile(profile)
  if (!normalized) {
    return null
  }
  return clone(
    Number(normalized.schemaVersion) === AIR_ENVIRONMENT_SCHEMA_VERSION
      ? normalized.completedModes.advanced
      : normalized.input
  )
}

export function getCompletedQuickAirEnvironmentAnswer(profile = null) {
  const normalized = normalizeAirEnvironmentProfile(profile)
  return Number(normalized?.schemaVersion) === AIR_ENVIRONMENT_SCHEMA_VERSION
    ? clone(normalized.completedModes.quick)
    : null
}

export function getPreferredAirEnvironmentMode(profile = null) {
  const normalized = normalizeAirEnvironmentProfile(profile)
  return Number(normalized?.schemaVersion) === AIR_ENVIRONMENT_SCHEMA_VERSION
    ? normalized.activeMode
    : normalized
      ? 'advanced'
      : 'quick'
}

export function getActiveAirEnvironmentAssessment(profile = null) {
  const directAssessment = normalizeAirEnvironmentAssessment(profile)
  if (directAssessment) {
    return directAssessment
  }
  const normalized = normalizeAirEnvironmentProfile(profile)
  if (!normalized) {
    return null
  }
  if (Number(normalized.schemaVersion) !== AIR_ENVIRONMENT_SCHEMA_VERSION) {
    return buildAdvancedAirEnvironmentAssessment(normalized.input).value
  }
  if (normalized.activeMode === 'quick') {
    return {
      schemaVersion: AIR_ENVIRONMENT_SCHEMA_VERSION,
      mode: 'quick',
      quickAnswer: clone(normalized.completedModes.quick),
      advancedInput: null
    }
  }
  return {
    schemaVersion: AIR_ENVIRONMENT_SCHEMA_VERSION,
    mode: 'advanced',
    quickAnswer: null,
    advancedInput: clone(normalized.completedModes.advanced)
  }
}

export function getInitialAdvancedAirEnvironmentInput(profile = null) {
  return getCompletedAdvancedAirEnvironmentInput(profile) || createInitialAirEnvironmentInput()
}

export function describeAirEnvironmentAssessment(value = null) {
  const assessment = value?.mode ? value : getActiveAirEnvironmentAssessment(value)
  if (!assessment) {
    return '尚未记录'
  }
  if (assessment.mode === 'quick') {
    const answer = normalizeQuickAirEnvironmentAnswer(assessment.quickAnswer)
    return (
      QUICK_AIR_ENVIRONMENT_OPTIONS.find(option => option.key === answer?.optionKey)?.label ||
      '尚未记录'
    )
  }
  const input = assessment.advancedInput
  const sourceLabel =
    input?.airExchange?.source === 'fresh_air'
      ? '主要靠新风'
      : input?.airExchange?.source === 'window'
        ? '主要靠开窗'
        : '换气情况不确定'
  const canopyLabel =
    input?.canopyOpenness === 'open'
      ? '周围无遮挡'
      : input?.canopyOpenness === 'partial'
        ? '周围部分遮挡'
        : input?.canopyOpenness === 'enclosed'
          ? '周围遮挡较多'
          : '遮挡情况不确定'
  return `${sourceLabel} · ${canopyLabel}`
}
