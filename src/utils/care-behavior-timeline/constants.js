// 养护行为时间线常量与字段映射
// 集中管理 bucket 枚举、事件枚举、字段别名映射与默认值，避免魔法字符串散落。

export const CARE_BEHAVIOR_BUCKET_OPTIONS = [
  'within_10d',
  '11_30d',
  '31_60d',
  'over_60d',
  'almost_never',
  'unknown'
]
export const CARE_BEHAVIOR_BUCKET_SET = new Set(CARE_BEHAVIOR_BUCKET_OPTIONS)

export const CARE_BEHAVIOR_LIGHT_CHANGE_EVENT = 'direct_sun_exposure'
export const CARE_BEHAVIOR_LIGHT_CHANGE_EVENTS = new Set([
  'moved_to_stronger_light',
  'moved_to_weaker_light',
  'direct_sun_exposure',
  'grow_light_changed',
  'none',
  'unknown'
])
export const LEGACY_LIGHT_CHANGE_EVENT = 'strong_light_or_position_change'

export const CARE_BEHAVIOR_WATERING_DEFAULT_AMOUNT = 'normal'
export const CARE_BEHAVIOR_FERTILIZING_DEFAULT_STRENGTH = 'thin'
export const CARE_BEHAVIOR_DEFAULT_DAYS = 10
export const DEFAULT_REFERENCE_DATE = new Date()
export const DAY_MS = 24 * 60 * 60 * 1000

// 不同来源的字段别名映射，兼容 snake_case / camelCase / 历史命名
export const CARE_FIELD_MAP = {
  watering: [
    'watering_events_10d',
    'wateringEvents10d',
    'wateringEvents',
    'watering',
    'watering_events'
  ],
  fertilizing: [
    'fertilizing_events_10d',
    'fertilizingEvents10d',
    'fertilizingEvents',
    'fertilizing',
    'fertilizing_events'
  ],
  light_change: [
    'light_change_events_10d',
    'lightChangeEvents10d',
    'lightChangeEvents',
    'lightChange',
    'light_change'
  ],
  last_fertilized_bucket: [
    'last_fertilized_bucket',
    'lastFertilizedBucket',
    'last_fertilizedBucket',
    'lastFertilized'
  ],
  reference_date: ['reference_date', 'referenceDate', 'referenceDateIso', 'referenceDateISO']
}

// 事件对象内部标记字段别名
export const EVENT_FIELD_MAP = {
  watering: ['watered', 'watering', 'water', 'isWatered', 'hasWatered'],
  fertilizing: ['fertilized', 'fertilizing', 'fertilize', 'isFertilized', 'hasFertilized'],
  light_change: [
    'event',
    'light_change',
    'lightChange',
    'strongLightOrPositionChange',
    'positionChange',
    'directSunExposure'
  ]
}
