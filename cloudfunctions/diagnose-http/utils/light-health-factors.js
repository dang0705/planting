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

module.exports = {
  DEFAULT_PROFILE,
  WEATHER_SUN_FACTOR,
  FACTORS,
  OVER_PENALTY,
  DIRECT_SUN_EXPOSURE_BASE_HOURS,
  DIRECT_SUN_POSITION_EXPOSURE,
  DIRECT_SUN_BLOCKED_WINDOWS
}
