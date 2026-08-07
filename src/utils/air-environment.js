import {
  createInitialAirExchangeInput,
  isAirExchangeAnswerReady,
  resolveAirExchangeEvidence
} from './air-exchange-evidence.js'

const CANOPY_OPENNESS = new Set(['open', 'partial', 'enclosed', 'unknown'])
const DEVICE_AIRFLOW_MODES = new Set(['none', 'circulating', 'direct', 'unknown'])
const DEVICE_AIRFLOW_SOURCES = new Set(['fan', 'air_conditioner', 'fresh_air'])

function text(value = '') {
  return String(value || '').trim()
}

export function createInitialAirEnvironmentInput() {
  return {
    airExchange: createInitialAirExchangeInput(),
    canopyOpenness: null,
    deviceAirflow: { mode: null, sources: [] }
  }
}

export function sanitizeAirEnvironmentInput(value = {}) {
  const airExchange = value?.airExchange || createInitialAirExchangeInput()
  const source = text(airExchange.source)
  const isFreshAir = source === 'fresh_air'
  const mode = text(value?.deviceAirflow?.mode)
  return {
    airExchange: {
      source: ['window', 'fresh_air', 'unknown'].includes(source) ? source : null,
      windowDirectionCount:
        source === 'window' &&
        ['one', 'two_or_more', 'closed'].includes(text(airExchange.windowDirectionCount))
          ? text(airExchange.windowDirectionCount)
          : null,
      windowOpenFrequency:
        source === 'window' &&
        text(airExchange.windowDirectionCount) !== 'closed' &&
        ['daily', 'every_other_day', 'weekly_1_2'].includes(text(airExchange.windowOpenFrequency))
          ? text(airExchange.windowOpenFrequency)
          : null
    },
    canopyOpenness: CANOPY_OPENNESS.has(text(value?.canopyOpenness))
      ? text(value.canopyOpenness)
      : null,
    deviceAirflow: {
      mode: DEVICE_AIRFLOW_MODES.has(mode) ? mode : null,
      sources: ['none', 'unknown'].includes(mode)
        ? []
        : Array.from(
            new Set(
              (Array.isArray(value?.deviceAirflow?.sources) ? value.deviceAirflow.sources : [])
                .map(text)
                .filter(key => DEVICE_AIRFLOW_SOURCES.has(key))
                .filter(key => key !== 'fresh_air' || isFreshAir)
            )
          )
    }
  }
}

export function isAirEnvironmentAnswerReady(value = {}) {
  const input = sanitizeAirEnvironmentInput(value)
  if (!isAirExchangeAnswerReady(input.airExchange)) {
    return false
  }
  if (!input.canopyOpenness || !input.deviceAirflow.mode) {
    return false
  }
  return (
    !['circulating', 'direct'].includes(input.deviceAirflow.mode) ||
    input.deviceAirflow.sources.length > 0
  )
}

export function getAirEnvironmentSignature(value = {}) {
  return JSON.stringify(sanitizeAirEnvironmentInput(value))
}

export function normalizeAirEnvironmentLocationBinding(value = {}) {
  return {
    careLocationId: text(value?.careLocationId),
    locationKey: text(value?.locationKey)
  }
}

export function isSameAirEnvironmentLocationBinding(saved = {}, current = {}) {
  const savedBinding = normalizeAirEnvironmentLocationBinding(saved)
  const currentBinding = normalizeAirEnvironmentLocationBinding(current)
  if (!savedBinding.careLocationId && !savedBinding.locationKey) {
    return false
  }
  return (
    savedBinding.careLocationId === currentBinding.careLocationId &&
    savedBinding.locationKey === currentBinding.locationKey
  )
}

export function isCompleteAirEnvironmentProfile(profile = null) {
  return Boolean(profile?.input && isAirEnvironmentAnswerReady(profile.input))
}

export function describeAirEnvironmentInput(value = {}) {
  const input = sanitizeAirEnvironmentInput(value)
  const exchangeLabel =
    input.airExchange.source === 'fresh_air'
      ? '新风换气'
      : input.airExchange.source === 'window'
        ? '开窗换气'
        : '换气情况不确定'
  const airflowLabel =
    input.deviceAirflow.mode === 'direct'
      ? '有直吹'
      : input.deviceAirflow.mode === 'circulating'
        ? '有空气流动'
        : input.deviceAirflow.mode === 'none'
          ? '没有设备风'
          : '设备风不确定'
  return `${exchangeLabel}，${airflowLabel}`
}

export function resolveAirEnvironmentPreview(value = {}) {
  const input = sanitizeAirEnvironmentInput(value)
  if (!isAirEnvironmentAnswerReady(input)) {
    return null
  }
  const airExchange = resolveAirExchangeEvidence(input.airExchange)
  return {
    airExchangeLevel: airExchange?.level || 'unknown',
    directAirflow: input.deviceAirflow.mode === 'direct'
  }
}

export function isAirEnvironmentQuestion(question = {}) {
  const key = text(question?.questionKey || question?.questionId || question?.id)
  return (
    text(question?.uiVariant) === 'air_environment' ||
    text(question?.packageTopic) === 'air_environment' ||
    key.includes('air_environment')
  )
}
