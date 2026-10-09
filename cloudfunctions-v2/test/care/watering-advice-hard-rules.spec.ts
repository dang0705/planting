import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  OPEN_METEO_REQUEST_WINDOW_DAYS,
  WATERING_BASELINE_POLICY_VERSION,
  resolveOpenMeteoRequestWindow
} from '../../src/care/watering/watering-advice-hard-rules.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data（L1）。Expected：watering-advice-wiring-plan.md 裁决 5/6 与配置目录硬规则
 * `care.lighting.open_meteo_request_window_days`、`care.watering.baseline_policy_version`（读取真实目录 JSON）。
 */
const day = 86_400_000
const now = Date.UTC(2026, 9, 9, 4)
const catalog = JSON.parse(readFileSync(join(findProjectRoot(), 'docs/backend-v2/architecture/configuration-variable-catalog.json'), 'utf8')) as {
  variables: Array<{ id: string; status: string; currentValue: unknown }>
}
const entry = (id: string) => catalog.variables.find(variable => variable.id === id)

describe('浇水建议硬规则', () => {
  it('H1/H2 常量与配置目录 hard_rule 一致', () => {
    expect(entry('care.lighting.open_meteo_request_window_days')).toMatchObject({ status: 'hard_rule', currentValue: { maxPastDays: 92, maxForecastDays: 16 } })
    expect(OPEN_METEO_REQUEST_WINDOW_DAYS).toEqual({ maxPastDays: 92, maxForecastDays: 16 })
    expect(entry('care.watering.baseline_policy_version')).toMatchObject({ status: 'hard_rule', currentValue: 'v1' })
    expect(WATERING_BASELINE_POLICY_VERSION).toBe('v1')
  })
  it('H1 回看起点取最早证据，按天向上取整；预报恒为 16 天', () => {
    expect(resolveOpenMeteoRequestWindow({ nowMs: now, evidenceTimesMs: [now - 3.5 * day, null, now - day] })).toEqual({ pastDays: 4, forecastDays: 16 })
    expect(resolveOpenMeteoRequestWindow({ nowMs: now, evidenceTimesMs: [now - 2 * day] })).toEqual({ pastDays: 2, forecastDays: 16 })
  })
  it('H1 无证据 → 回看 0 天；证据就在当下 → 0 天', () => {
    expect(resolveOpenMeteoRequestWindow({ nowMs: now, evidenceTimesMs: [null, null] })).toEqual({ pastDays: 0, forecastDays: 16 })
    expect(resolveOpenMeteoRequestWindow({ nowMs: now, evidenceTimesMs: [now] })).toEqual({ pastDays: 0, forecastDays: 16 })
  })
  it('H1 早于 92 天截断到 92', () => {
    expect(resolveOpenMeteoRequestWindow({ nowMs: now, evidenceTimesMs: [now - 200 * day] })).toEqual({ pastDays: 92, forecastDays: 16 })
    expect(resolveOpenMeteoRequestWindow({ nowMs: now, evidenceTimesMs: [now - 92 * day - 1] })).toEqual({ pastDays: 92, forecastDays: 16 })
  })
})
