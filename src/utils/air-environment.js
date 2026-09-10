import {
  createInitialAirExchangeInput,
  isAirExchangeAnswerReady,
  resolveAirExchangeEvidence
} from './air-exchange-evidence.js'

const CANOPY_OPENNESS = new Set(['open', 'partial', 'enclosed', 'unknown'])
const DEVICE_AIRFLOW_MODES = new Set(['none', 'circulating', 'direct', 'unknown'])
const DEVICE_AIRFLOW_SOURCES = new Set(['fan', 'air_conditioner', 'fresh_air'])
const DEVICE_AIRFLOW_SOURCE_MODES = new Set(['circulating', 'direct'])

function text(value = '') {
  return String(value || '').trim()
}

export function createInitialAirEnvironmentInput() {
  return {
    airExchange: createInitialAirExchangeInput(),
    canopyOpenness: null,
    deviceAirflow: { mode: null, sources: [], directSources: [], sourceModes: {} }
  }
}

export function sanitizeAirEnvironmentInput(value = {}) {
  const airExchange = value?.airExchange || createInitialAirExchangeInput()
  const source = text(airExchange.source)
  const isFreshAir = source === 'fresh_air'
  const rawMode = text(value?.deviceAirflow?.mode)
  const mode =
    isFreshAir && !['circulating', 'direct'].includes(rawMode)
      ? 'circulating'
      : DEVICE_AIRFLOW_MODES.has(rawMode)
        ? rawMode
        : null
  const inputSources = Array.isArray(value?.deviceAirflow?.sources)
    ? value.deviceAirflow.sources
    : []
  const inputDirectSources = Array.isArray(value?.deviceAirflow?.directSources)
    ? value.deviceAirflow.directSources
    : []
  const rawSourceModes = value?.deviceAirflow?.sourceModes
  const hasSourceModes =
    rawSourceModes && typeof rawSourceModes === 'object' && !Array.isArray(rawSourceModes)
  const normalizedSources = Array.from(
    new Set(
      inputSources
        .map(text)
        .filter(key => DEVICE_AIRFLOW_SOURCES.has(key))
        .filter(key => key !== 'fresh_air' || isFreshAir)
    )
  )
  const sources =
    isFreshAir && ['circulating', 'direct'].includes(mode)
      ? Array.from(new Set(['fresh_air', ...normalizedSources]))
      : ['none', 'unknown'].includes(mode)
        ? []
        : normalizedSources
  const normalizedLegacyDirectSources = Array.from(
    new Set(inputDirectSources.map(text).filter(key => sources.includes(key)))
  )
  const normalizedSourceModes = hasSourceModes
    ? Object.fromEntries(
        Object.entries(rawSourceModes)
          .map(([source, sourceMode]) => [text(source), text(sourceMode)])
          .filter(
            ([source, sourceMode]) =>
              DEVICE_AIRFLOW_SOURCES.has(source) &&
              DEVICE_AIRFLOW_SOURCE_MODES.has(sourceMode) &&
              (source !== 'fresh_air' || isFreshAir)
          )
      )
    : null
  const sourceModes = ['none', 'unknown'].includes(mode)
    ? {}
    : normalizedSourceModes
      ? isFreshAir && ['circulating', 'direct'].includes(mode)
        ? { fresh_air: 'circulating', ...normalizedSourceModes }
        : normalizedSourceModes
      : mode === 'direct' && !normalizedLegacyDirectSources.length
        ? null
        : Object.fromEntries(
            sources.map(source => [
              source,
              normalizedLegacyDirectSources.includes(source) ? 'direct' : 'circulating'
            ])
          )
  const sourceModeKeys = sourceModes ? Object.keys(sourceModes) : []
  const directSources = sourceModes
    ? sourceModeKeys.filter(source => sourceModes[source] === 'direct')
    : normalizedLegacyDirectSources
  const derivedMode =
    directSources.length > 0 ? 'direct' : sourceModeKeys.length > 0 ? 'circulating' : mode
  const rawWindowDirectionCount = text(airExchange.windowDirectionCount)
  const isLegacyClosedWindow = source === 'window' && rawWindowDirectionCount === 'closed'
  const windowDirectionCount =
    source === 'window' &&
    (['one', 'two_or_more'].includes(rawWindowDirectionCount) || isLegacyClosedWindow)
      ? isLegacyClosedWindow
        ? 'one'
        : rawWindowDirectionCount
      : null
  const windowOpenFrequency =
    source === 'window' &&
    (isLegacyClosedWindow ||
      ['daily', 'every_other_day', 'weekly_1_2', 'almost_never'].includes(
        text(airExchange.windowOpenFrequency)
      ))
      ? isLegacyClosedWindow
        ? 'almost_never'
        : text(airExchange.windowOpenFrequency)
      : null
  return {
    airExchange: {
      source: ['window', 'fresh_air', 'unknown'].includes(source) ? source : null,
      windowDirectionCount,
      windowOpenFrequency
    },
    canopyOpenness: CANOPY_OPENNESS.has(text(value?.canopyOpenness))
      ? text(value.canopyOpenness)
      : null,
    deviceAirflow: {
      mode: derivedMode,
      sources: sourceModes ? sourceModeKeys : sources,
      directSources,
      sourceModes
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
  if (
    input.airExchange.source === 'fresh_air' &&
    !input.deviceAirflow.sources.includes('fresh_air')
  ) {
    return false
  }
  return Boolean(
    !['circulating', 'direct'].includes(input.deviceAirflow.mode) ||
    (input.deviceAirflow.sources.length > 0 &&
      input.deviceAirflow.sourceModes &&
      (input.deviceAirflow.mode !== 'direct' || input.deviceAirflow.directSources.length > 0))
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
  // 历史档案可能没有位置绑定；当前植物也可能尚未保存照料位置。此时不能
  // 把“无法比较”当成“位置已变化”，否则每次问诊都会强迫用户重填空气环境。
  // 只有两边都有可比较的位置且确实不同，才要求再次确认。
  const hasSavedBinding = Boolean(savedBinding.careLocationId || savedBinding.locationKey)
  const hasCurrentBinding = Boolean(currentBinding.careLocationId || currentBinding.locationKey)
  if (!hasSavedBinding || !hasCurrentBinding) {
    return true
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
        ? input.airExchange.windowOpenFrequency === 'almost_never'
          ? '平时几乎不开窗'
          : '开窗换气'
        : '换气情况不确定'
  const airflowLabel =
    input.deviceAirflow.mode === 'direct'
      ? `有直吹${
          input.deviceAirflow.directSources.length
            ? `（${input.deviceAirflow.directSources
                .map(
                  source => ({ fan: '风扇', air_conditioner: '空调', fresh_air: '新风' })[source]
                )
                .join('、')}）`
            : '（来源待补充）'
        }`
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
