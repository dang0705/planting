'use strict'

/**
 * 光照分类模型的唯一因子表。
 * 所有数值都必须随 formulaVersion 一起审计，消费者不得另建系数。
 */

const FORMULA_VERSION = 'light_exposure_v2'
const CALCULATION_MODE = 'categorical'

const NATURAL_LIGHT_TYPES = Object.freeze({
  direct: Object.freeze({ label: '直射光', baseIndex: 1.0 }),
  bright_diffuse: Object.freeze({ label: '明亮散射光', baseIndex: 0.65 }),
  weak_diffuse: Object.freeze({ label: '较弱散射光', baseIndex: 0.35 }),
  almost_none: Object.freeze({ label: '几乎无自然光', baseIndex: 0.1 })
})

const ENTRY_METHODS = Object.freeze({
  through_glass: Object.freeze({ label: '阳光透过窗玻璃', modifier: 0.9 }),
  open_environment: Object.freeze({ label: '开放环境', modifier: 1.0 })
})

const WEATHER_MODIFIERS = Object.freeze({
  direct: Object.freeze({ intercept: 0.45, slope: 0.55 }),
  bright_diffuse: Object.freeze({ intercept: 0.75, slope: 0.25 }),
  weak_diffuse: Object.freeze({ intercept: 0.85, slope: 0.15 }),
  almost_none: Object.freeze({ intercept: 1.0, slope: 0 })
})

const LIGHT_REQUIREMENT_RANGES = Object.freeze({
  full_sun: Object.freeze({ label: '全日照', min: 0.8, max: 1.0 }),
  partial_sun: Object.freeze({ label: '半日照', min: 0.6, max: 0.85 }),
  full_or_partial_sun: Object.freeze({ label: '全日照/半日照', min: 0.65, max: 0.95 }),
  bright_diffuse: Object.freeze({ label: '明亮散射光', min: 0.5, max: 0.75 }),
  shade_tolerant: Object.freeze({ label: '耐阴', min: 0.25, max: 0.55 }),
  unknown: Object.freeze({ label: '无法识别', min: 0.45, max: 0.75 })
})

const STRONG_LIGHT_THRESHOLD = 0.75
const WEAK_LIGHT_THRESHOLD = 0.35
const LIGHT_FACTOR_MAX_ADJUST = 0.12

module.exports = {
  FORMULA_VERSION,
  CALCULATION_MODE,
  NATURAL_LIGHT_TYPES,
  ENTRY_METHODS,
  WEATHER_MODIFIERS,
  LIGHT_REQUIREMENT_RANGES,
  STRONG_LIGHT_THRESHOLD,
  WEAK_LIGHT_THRESHOLD,
  LIGHT_FACTOR_MAX_ADJUST
}
