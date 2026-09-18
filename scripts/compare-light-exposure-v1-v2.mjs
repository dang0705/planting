#!/usr/bin/env node

import { createRequire } from 'node:module'
import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { computeLightExposure } = require('../cloudfunctions/layer/utils/light-exposure')
const { migrateLegacyLightEnvironment } = require('../cloudfunctions/layer/utils/light-exposure-normalize')
const { resolveLightFactor } = require('../cloudfunctions/layer/utils/transpiration')

const LEGACY_FACTORS = Object.freeze({
  facing: Object.freeze({ south: 1, north: 0.45, balcony: 1.1, no_window: 0.05 }),
  windowType: Object.freeze({ standard: 1, floor_to_ceiling: 1.15, grow_light: 0.92, no_window: 0.05 }),
  position: Object.freeze({ window_side: 1, middle: 0.72, deep: 0.42 })
})

const LEGACY_STRONG_HOURS = 6
const LEGACY_WEAK_HOURS = 3
const MAX_LIGHT_ADJUSTMENT = 0.12
const DEFAULT_SUNSHINE_HOURS = 8

const CASES = Object.freeze([
  {
    id: 'direct_glass',
    legacy: {
      facing: 'south',
      windowType: 'standard',
      position: 'window_side',
      hasDirectSun: true,
      distance: 0.5
    },
    v2: {
      schemaVersion: 2,
      naturalLightType: 'direct',
      entryMethod: 'through_glass',
      hasSupplementalLight: false,
      captureSource: 'user'
    }
  },
  {
    id: 'bright_diffuse_glass',
    legacy: {
      facing: 'south',
      windowType: 'standard',
      position: 'window_side',
      hasDirectSun: false,
      distance: 1
    },
    v2: {
      schemaVersion: 2,
      naturalLightType: 'bright_diffuse',
      entryMethod: 'through_glass',
      hasSupplementalLight: false,
      captureSource: 'user'
    }
  },
  {
    id: 'weak_diffuse_glass',
    legacy: {
      facing: 'north',
      windowType: 'standard',
      position: 'middle',
      hasDirectSun: false,
      distance: 2.5
    },
    v2: {
      schemaVersion: 2,
      naturalLightType: 'weak_diffuse',
      entryMethod: 'through_glass',
      hasSupplementalLight: false,
      captureSource: 'user'
    }
  },
  {
    id: 'almost_none_with_supplement',
    legacy: {
      facing: 'no_window',
      windowType: 'grow_light',
      position: 'deep',
      hasDirectSun: false,
      distance: 5
    },
    v2: {
      schemaVersion: 2,
      naturalLightType: 'almost_none',
      entryMethod: null,
      hasSupplementalLight: true,
      captureSource: 'user'
    }
  }
])

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function round(value, digits = 3) {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function legacyDistanceFactor(distance) {
  if (distance <= 1) {
    return 1
  }
  if (distance <= 3) {
    return clamp(1 - (distance - 1) * 0.08, 0.82, 1)
  }
  return clamp(0.82 - (distance - 3) * 0.06, 0.42, 0.82)
}

function legacyExposureHours(input, weatherLightFactor) {
  const facing = LEGACY_FACTORS.facing[input.facing] ?? 0.65
  const windowType = LEGACY_FACTORS.windowType[input.windowType] ?? 0.9
  const position = LEGACY_FACTORS.position[input.position] ?? 0.7
  const direct = input.hasDirectSun ? 1.08 : 0.92
  const distance = legacyDistanceFactor(Number(input.distance || 0))
  const indirectHours =
    DEFAULT_SUNSHINE_HOURS * weatherLightFactor * facing * windowType * position * direct * distance
  const directHours = input.hasDirectSun
    ? 2.3 * clamp(facing, 0.35, 1.1) * clamp(windowType, 0.55, 1.2) * distance
    : 0
  return indirectHours + directHours
}

function legacyLightFactor(input, weatherLightFactor) {
  const hours = legacyExposureHours(input, weatherLightFactor)
  if (hours >= LEGACY_STRONG_HOURS) {
    return round(1 - MAX_LIGHT_ADJUSTMENT * Math.min(1, (hours - LEGACY_STRONG_HOURS) / 4), 2)
  }
  if (hours < LEGACY_WEAK_HOURS) {
    return round(
      1 +
        MAX_LIGHT_ADJUSTMENT *
          Math.min(1, (LEGACY_WEAK_HOURS - hours) / LEGACY_WEAK_HOURS),
      2
    )
  }
  return 1
}

function buildReport(weatherLightFactor = 0.8) {
  const cases = CASES.map(item => {
    const v1Factor = legacyLightFactor(item.legacy, weatherLightFactor)
    const exposure = computeLightExposure({
      userLightContext: item.v2,
      weatherLightFactor,
      weatherLightConfidence: 'medium'
    })
    const v2Factor = resolveLightFactor(item.v2, [], {
      weatherLightFactor,
      weatherLightConfidence: 'medium'
    })
    const migrated = migrateLegacyLightEnvironment(item.legacy)
    return {
      id: item.id,
      v1: {
        legacyEquivalentHours: round(legacyExposureHours(item.legacy, weatherLightFactor)),
        lightIntervalFactor: v1Factor
      },
      v2: {
        estimatedExposureIndex: exposure.estimatedExposureIndex,
        confidence: exposure.confidence,
        lightIntervalFactor: v2Factor
      },
      migrationNaturalLightType: migrated?.naturalLightType || null,
      intervalFactorDelta: round(v2Factor - v1Factor, 2),
      withinExistingLightBoundary:
        v2Factor >= 1 - MAX_LIGHT_ADJUSTMENT &&
        v2Factor <= 1 + MAX_LIGHT_ADJUSTMENT &&
        Math.abs(v2Factor - v1Factor) <= MAX_LIGHT_ADJUSTMENT
    }
  })
  return {
    reportVersion: 'light_exposure_v1_v2_comparison_1',
    weatherLightFactor,
    note: 'V1 hours are replay-only legacy outputs; V2 index is categorical and not an hour conversion.',
    cases,
    summary: {
      total: cases.length,
      withinExistingLightBoundary: cases.filter(item => item.withinExistingLightBoundary).length,
      maximumAbsoluteIntervalFactorDelta: Math.max(
        ...cases.map(item => Math.abs(item.intervalFactorDelta))
      ),
      passed: cases.every(item => item.withinExistingLightBoundary)
    }
  }
}

const outputArg = process.argv.find(argument => argument.startsWith('--output='))
const report = buildReport()
if (outputArg) {
  const outputPath = resolve(outputArg.slice('--output='.length))
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}
console.log(JSON.stringify(report, null, 2))
if (!report.summary.passed) {
  process.exitCode = 1
}

export { buildReport }
