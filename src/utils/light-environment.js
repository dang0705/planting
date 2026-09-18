const LIGHT_CONTEXT_TOPIC = 'light_change_context'

export const NATURAL_LIGHT_TYPE_OPTIONS = Object.freeze([
  {
    key: 'direct',
    label: '直射光',
    description: '晴天时，阳光会直接照到叶片'
  },
  {
    key: 'bright_diffuse',
    label: '明亮散射光',
    description: '不直晒，白天这里很明亮'
  },
  {
    key: 'weak_diffuse',
    label: '较弱散射光',
    description: '不直晒，白天这里仍偏暗'
  },
  {
    key: 'almost_none',
    label: '几乎无自然光',
    description: '白天这里很暗，几乎没有自然光'
  }
])

export const ENTRY_METHOD_OPTIONS = Object.freeze([
  { key: 'through_glass', label: '阳光透过窗玻璃' },
  { key: 'open_environment', label: '开放环境' }
])

const NATURAL_LIGHT_TYPES = new Set(NATURAL_LIGHT_TYPE_OPTIONS.map(item => item.key))
const ENTRY_METHODS = new Set(ENTRY_METHOD_OPTIONS.map(item => item.key))

function normalizeText(value = '') {
  return String(value || '').normalize('NFKC').trim()
}

function resolveQuestionKey(question = {}) {
  return normalizeText(question?.questionKey || question?.questionId || question?.id)
}

export function isLightEnvironmentQuestion(question = {}) {
  const questionKey = resolveQuestionKey(question)
  const packageTopic = normalizeText(question?.packageTopic || question?.package_topic)
  return questionKey.includes(LIGHT_CONTEXT_TOPIC) || packageTopic === LIGHT_CONTEXT_TOPIC
}

export function createDefaultLightEnvironment() {
  return {
    schemaVersion: 2,
    naturalLightType: '',
    entryMethod: 'through_glass',
    hasSupplementalLight: false,
    captureSource: 'user'
  }
}

export function migrateLegacyLightEnvironment(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null
  }
  const windowType = normalizeText(value.windowType || value.window_type).toLowerCase()
  const facing = normalizeText(value.facing || value.direction).toLowerCase()
  const position = normalizeText(value.position || value.roomPosition).toLowerCase()
  const distance = Number(value.distance ?? value.distanceMeters ?? value.distance_meters)
  const hasDirectSun = value.hasDirectSun === true || value.has_direct_sun === true
  const hasLegacySignal = Boolean(
    windowType ||
      facing ||
      position ||
      Number.isFinite(distance) ||
      value.hasDirectSun !== undefined ||
      value.has_direct_sun !== undefined
  )
  if (!hasLegacySignal) {
    return null
  }

  const growLight = ['grow_light', '补光灯'].includes(windowType)
  const noWindow =
    ['no_window', 'windowless', '无窗'].includes(windowType) ||
    ['no_window', 'windowless', '无窗'].includes(facing)
  const nearWindow =
    ['window_side', 'near_window', '窗边', '靠窗'].includes(position) ||
    (Number.isFinite(distance) && distance <= 1.2)
  const naturalLightType = hasDirectSun
    ? 'direct'
    : noWindow || growLight
      ? 'almost_none'
      : nearWindow
        ? 'bright_diffuse'
        : 'weak_diffuse'

  return {
    schemaVersion: 2,
    naturalLightType,
    entryMethod:
      naturalLightType === 'almost_none'
        ? null
        : ['balcony', '阳台'].includes(facing)
          ? 'open_environment'
          : 'through_glass',
    hasSupplementalLight: growLight,
    captureSource: 'migrated_v1'
  }
}

export function sanitizeLightEnvironment(value = {}) {
  const fallback = createDefaultLightEnvironment()
  const isV2 = Number(value?.schemaVersion) === 2 && NATURAL_LIGHT_TYPES.has(value.naturalLightType)
  const source = isV2 ? value : migrateLegacyLightEnvironment(value)
  if (!source) {
    return fallback
  }
  const naturalLightType = NATURAL_LIGHT_TYPES.has(source.naturalLightType)
    ? source.naturalLightType
    : ''
  const entryMethod =
    naturalLightType === 'almost_none'
      ? null
      : ENTRY_METHODS.has(source.entryMethod)
        ? source.entryMethod
        : 'through_glass'
  return {
    schemaVersion: 2,
    naturalLightType,
    entryMethod,
    hasSupplementalLight: source.hasSupplementalLight === true,
    captureSource: source.captureSource === 'user' ? 'user' : 'migrated_v1'
  }
}

export function markLightEnvironmentAsUser(value = {}) {
  return {
    ...sanitizeLightEnvironment(value),
    captureSource: 'user'
  }
}

export function getLightEnvironmentSignature(value = {}) {
  return JSON.stringify(sanitizeLightEnvironment(value))
}

export function hasMeaningfulLightEnvironment(value) {
  if (!value || typeof value !== 'object') {
    return false
  }
  return NATURAL_LIGHT_TYPES.has(sanitizeLightEnvironment(value).naturalLightType)
}

export function isUserConfirmedLightEnvironment(value) {
  const normalized = sanitizeLightEnvironment(value)
  return hasMeaningfulLightEnvironment(normalized) && normalized.captureSource === 'user'
}

export function normalizeOptionalLightEnvironment(value) {
  return hasMeaningfulLightEnvironment(value) ? sanitizeLightEnvironment(value) : null
}

export function getNaturalLightTypeOption(value = '') {
  return NATURAL_LIGHT_TYPE_OPTIONS.find(item => item.key === value) || null
}

export function describeLightEnvironment(value) {
  const normalized = sanitizeLightEnvironment(value)
  const type = getNaturalLightTypeOption(normalized.naturalLightType)
  if (!type) {
    return '尚未设置，点击进入设置'
  }
  const entry =
    normalized.entryMethod &&
    ENTRY_METHOD_OPTIONS.find(item => item.key === normalized.entryMethod)?.label
  return [
    normalized.captureSource === 'migrated_v1' ? '待确认' : type.label,
    normalized.captureSource === 'migrated_v1' ? type.label : '',
    entry,
    normalized.hasSupplementalLight ? '已记录补光灯' : ''
  ]
    .filter(Boolean)
    .join(' · ')
}
