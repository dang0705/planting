#!/usr/bin/env node
// 日历入口在 MVP 已隐藏；本用例仅为后续恢复入口时保留，不参与当前 catalog。
import { runBusinessCoverageLeaf } from '../_shared/business-coverage-live.mjs'

runBusinessCoverageLeaf({
  scenario: 'calendarWeatherAndSolar',
  catalogId: 'calendar.weather_and_solar_term_summary'
}).catch(error => {
  console.error('[e2e] fatal error:', error?.message || error)
  process.exitCode = 1
})
