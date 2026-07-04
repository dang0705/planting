'use strict'

// 光照健康估算因子表与常量
// 这些数值是诊断业务口径，迁移时必须 1:1 保留，不得调整。

const DEFAULT_PROFILE = {
  way: '明亮散射光',
  freq: [4, 6],
  unit: '小时/天',
  source: 'fallback_default_indoor_profile'
}

const WEATHER_SUN_FACTOR = [
  { pattern: /中雨|大雨|暴雨|heavy rain|storm/i, value: 0.08, label: '中到大雨' },
  { pattern: /小雨|阵雨|rain|shower/i, value: 0.15, label: '小雨/阵雨' },
  { pattern: /雪|snow/i, value: 0.1, label: '雪' },
  { pattern: /阴|overcast|cloudy/i, value: 0.25, label: '阴' },
  { pattern: /多云|partly|cloud/i, value: 0.4, label: '多云' },
  { pattern: /晴|sunny|clear/i, value: 0.6, label: '晴' }
]

const FACTORS = {
  facing: {
    south: { label: '南', factor: 1 },
    south_east: { label: '东南', factor: 0.9 },
    south_west: { label: '西南', factor: 0.88 },
    east: { label: '东', factor: 0.8 },
    west: { label: '西', factor: 0.78 },
    north_east: { label: '东北', factor: 0.62 },
    north_west: { label: '西北', factor: 0.55 },
    north: { label: '北', factor: 0.45 },
    balcony: { label: '阳台', factor: 1.1 },
    no_window: { label: '无窗', factor: 0.05 },
    unknown: { label: '不知道', factor: 0.65 }
  },
  windowType: {
    floor_to_ceiling: { label: '落地窗', factor: 1.15 },
    standard: { label: '标准窗', factor: 1 },
    small: { label: '小窗', factor: 0.8 },
    curtain: { label: '有窗帘', factor: 0.78 },
    blocked: { label: '有遮挡', factor: 0.75 },
    grow_light: { label: '补光灯', factor: 0.92 },
    no_window: { label: '无窗', factor: 0.05 },
    unknown: { label: '不知道', factor: 0.9 }
  },
  position: {
    window_side: { label: '窗边', factor: 1 },
    middle: { label: '房间中部', factor: 0.72 },
    deep: { label: '远离窗户', factor: 0.42 },
    unknown: { label: '不知道', factor: 0.7 }
  }
}

const OVER_PENALTY = {
  全日照: 35,
  半日照: 50,
  '全日照/半日照': 45,
  明亮散射光: 65,
  耐阴: 75
}
const DIRECT_SUN_EXPOSURE_BASE_HOURS = 2.3
const DIRECT_SUN_POSITION_EXPOSURE = {
  window_side: 1,
  middle: 0.45,
  unknown: 0.3,
  deep: 0
}
const DIRECT_SUN_BLOCKED_WINDOWS = new Set(['blocked', 'no_window'])

// —— 评分与系数公式参数（诊断口径，数值不得调整）——
// 天气光照因子默认值（未知天气时）
const WEATHER_FACTOR_UNKNOWN = 0.35
// 日均白昼小时数兜底（缺失 daylightHours 时）
const DAYLIGHT_FALLBACK_HOURS = 12
// 直射光对室内光照的加成/衰减系数
const DIRECT_SUN_BOOST_FACTOR = 1.08
const DIRECT_SUN_ATTENUATION_FACTOR = 0.92
// 距离衰减系数公式参数
const DISTANCE_FACTOR_NEAR_MAX = 1
const DISTANCE_FACTOR_MID_BOUNDARY = 3
const DISTANCE_FACTOR_MID_SLOPE = 0.08
const DISTANCE_FACTOR_MID_MIN = 0.82
const DISTANCE_FACTOR_DEEP_SLOPE = 0.06
const DISTANCE_FACTOR_DEEP_MIN = 0.42
// 直射光暴露时各因子 clamp 边界
const DIRECT_SUN_FACING_CLAMP = [0.35, 1.1]
const DIRECT_SUN_WINDOW_CLAMP = [0.55, 1.2]
// 评分阈值与权重
const SCORE_FULL = 100
const SCORE_SEVERE_THRESHOLD = 40
const SCORE_MODERATE_THRESHOLD = 65
const UNDERLIGHT_PENALTY_WEIGHT = 120
const OVER_PENALTY_FALLBACK = 45
const SCORE_CLAMP_RANGE = [0, 100]
// UV 系数公式参数（参考 UV=8 为基准）
const UV_REFERENCE = 8
const UV_FACTOR_SLOPE = 0.35
const UV_FACTOR_CLAMP = [0.75, 1.15]
// 日照充足判定比例（sunshineHours 覆盖天数过半时采用均值）
const SUNSHINE_COVERAGE_RATIO = 0.5

module.exports = {
  DEFAULT_PROFILE,
  WEATHER_SUN_FACTOR,
  FACTORS,
  OVER_PENALTY,
  DIRECT_SUN_EXPOSURE_BASE_HOURS,
  DIRECT_SUN_POSITION_EXPOSURE,
  DIRECT_SUN_BLOCKED_WINDOWS,
  WEATHER_FACTOR_UNKNOWN,
  DAYLIGHT_FALLBACK_HOURS,
  DIRECT_SUN_BOOST_FACTOR,
  DIRECT_SUN_ATTENUATION_FACTOR,
  DISTANCE_FACTOR_NEAR_MAX,
  DISTANCE_FACTOR_MID_BOUNDARY,
  DISTANCE_FACTOR_MID_SLOPE,
  DISTANCE_FACTOR_MID_MIN,
  DISTANCE_FACTOR_DEEP_SLOPE,
  DISTANCE_FACTOR_DEEP_MIN,
  DIRECT_SUN_FACING_CLAMP,
  DIRECT_SUN_WINDOW_CLAMP,
  SCORE_FULL,
  SCORE_SEVERE_THRESHOLD,
  SCORE_MODERATE_THRESHOLD,
  UNDERLIGHT_PENALTY_WEIGHT,
  OVER_PENALTY_FALLBACK,
  SCORE_CLAMP_RANGE,
  UV_REFERENCE,
  UV_FACTOR_SLOPE,
  UV_FACTOR_CLAMP,
  SUNSHINE_COVERAGE_RATIO
}
