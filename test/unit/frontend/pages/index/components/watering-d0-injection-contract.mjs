import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * 前端 D0 注入契约测试：
 * 验证三个浇水 planner 入口的前端代码正确传递 locationKey/timezone，
 * 以及 normalizeEnvironmentWeatherWindowPayload 保留缓存 D0 + D+1..D+14。
 *
 * 契约要点：
 *   - forecastDays 数组前端传 D0..D+14（最多 15 项），D0 必须来自天气缓存
 *   - locationKey 统一从 plant.careLocation.locationKey 读取
 *   - timezone 默认 Asia/Shanghai
 *   - WateringReminderSheet.vue 与 watering-advisor.vue 均需传 locationKey/timezone
 */

const weatherApiSource = readFileSync('src/api/weather.js', 'utf8')
const optionsSource = readFileSync(
  'src/pages/index/components/watering-reminder-options.js',
  'utf8'
)
const sheetSource = readFileSync('src/pages/index/components/WateringReminderSheet.vue', 'utf8')
const sheetPlannerSource = readFileSync(
  'src/pages/index/components/useWateringReminderPlanner.js',
  'utf8'
)
const advisorSource = readFileSync(
  'src/subpackages/care/watering-advisor/watering-advisor.vue',
  'utf8'
)
const advisorWeatherSource = readFileSync(
  'src/subpackages/care/watering-advisor/useWateringAdvisorWeather.js',
  'utf8'
)

/* ============================================================
 * 1. src/api/weather.js: normalizeEnvironmentWeatherWindowPayload 保留缓存 D0
 * ============================================================ */

assert.match(
  weatherApiSource,
  /MAX_ARRAY_FORECAST_DAYS_TO_KEEP\s*=\s*15/,
  'weather.js 应定义 MAX_ARRAY_FORECAST_DAYS_TO_KEEP = 15'
)

assert.match(
  weatherApiSource,
  /forecast_days: forecastDaysSnake/,
  'normalizeEnvironmentWeatherWindowPayload 应解构 forecast_days（snake_case）'
)

assert.match(
  weatherApiSource,
  /forecastDays: forecastDaysCamel/,
  'normalizeEnvironmentWeatherWindowPayload 应解构 forecastDays（camelCase）'
)

assert.match(
  weatherApiSource,
  /const isCachedD0 = day =>/,
  'normalizeEnvironmentWeatherWindowPayload 应识别天气缓存 D0'
)

assert.match(
  weatherApiSource,
  /const normalizedForecastDays = cachedD0\s*\?\s*\[cachedD0, \.\.\.futureForecastDays\]/,
  'normalizeEnvironmentWeatherWindowPayload 应将缓存 D0 放在未来预报之前'
)

assert.match(
  weatherApiSource,
  /forecastDays: normalizedForecastDays\.slice\(0, MAX_ARRAY_FORECAST_DAYS_TO_KEEP\)/,
  'normalizeEnvironmentWeatherWindowPayload 应将 D0..D+14 截断为最多 15 项'
)

/* ============================================================
 * 2. watering-reminder-options.js: buildWateringPlannerRequestPayload 包含 locationKey/timezone
 * ============================================================ */

assert.match(
  optionsSource,
  /export function buildWateringPlannerRequestPayload\(\{[\s\S]*?locationKey = '',[\s\S]*?timezone = 'Asia\/Shanghai'/,
  'buildWateringPlannerRequestPayload 应接受 locationKey 和 timezone 参数'
)

assert.match(
  optionsSource,
  /locationKey: String\(locationKey \|\| ''\)\.trim\(\)/,
  'buildWateringPlannerRequestPayload 应将 locationKey 加入 payload'
)

assert.match(
  optionsSource,
  /timezone: String\(timezone \|\| 'Asia\/Shanghai'\)\.trim\(\) \|\| 'Asia\/Shanghai'/,
  'buildWateringPlannerRequestPayload 应将 timezone 加入 payload，默认 Asia/Shanghai'
)

/* ============================================================
 * 3. watering-reminder-options.js: fetchWateringPlannerResult 传递 locationKey/timezone
 * ============================================================ */

assert.match(
  optionsSource,
  /export async function fetchWateringPlannerResult\(\{[\s\S]*?locationKey = '',[\s\S]*?timezone = 'Asia\/Shanghai'/,
  'fetchWateringPlannerResult 应接受 locationKey 和 timezone 参数'
)

assert.match(
  optionsSource,
  /body: buildWateringPlannerRequestPayload\(\{[\s\S]*?locationKey,[\s\S]*?timezone[\s\S]*?\}\)/,
  'fetchWateringPlannerResult 应将 locationKey/timezone 传给 buildWateringPlannerRequestPayload'
)

/* ============================================================
 * 4. watering-reminder-options.js: buildAdhocPlannerRequestPayload 包含 locationKey/timezone
 * ============================================================ */

assert.match(
  optionsSource,
  /export function buildAdhocPlannerRequestPayload\(\{[\s\S]*?locationKey = '',[\s\S]*?timezone = 'Asia\/Shanghai'/,
  'buildAdhocPlannerRequestPayload 应接受 locationKey 和 timezone 参数'
)

assert.match(
  optionsSource,
  /export async function fetchAdhocPlannerResult\(\{[\s\S]*?locationKey = '',[\s\S]*?timezone = 'Asia\/Shanghai'/,
  'fetchAdhocPlannerResult 应接受 locationKey 和 timezone 参数'
)

/* ============================================================
 * 5. useWateringReminderPlanner.js (extracted from WateringReminderSheet.vue):
 *    传递 locationKey/timezone 给用户植物 Planner，并把空气环境覆盖值一起传入
 * ============================================================ */

assert.match(
  sheetPlannerSource,
  /const plannerLocationKey = computed\(\(\) => \{[\s\S]*?props\.plant\?\.careLocation\?\.locationKey/,
  'useWateringReminderPlanner 应定义 plannerLocationKey computed，从 plant.careLocation.locationKey 读取'
)

assert.match(
  sheetPlannerSource,
  /const plannerTimezone = computed/,
  'useWateringReminderPlanner 应定义 plannerTimezone computed'
)

assert.match(
  sheetPlannerSource,
  /fetchWateringPlannerResult\(\{[\s\S]*?locationKey: plannerLocationKey\.value,[\s\S]*?timezone: plannerTimezone\.value/,
  'useWateringReminderPlanner fetchPlanner 应传入 plannerLocationKey 和 plannerTimezone'
)

assert.match(
  sheetPlannerSource,
  /airEnvironmentOverride: props\.plant\?\.airEnvironment\?\.input \|\| null/,
  'useWateringReminderPlanner fetchPlanner 应复用已保存的空气环境输入'
)

assert.match(
  sheetSource,
  /useWateringReminderPlanner\(\{ props, userStore, selectedWateringEventsForPlanner \}\)/,
  'WateringReminderSheet 应通过 useWateringReminderPlanner 组合天气/planner 逻辑'
)

/* ============================================================
 * 6. watering-advisor.vue + useWateringAdvisorWeather.js (extracted):
 *    传递 locationKey/timezone 给 fetch 函数
 * ============================================================ */

assert.match(
  advisorWeatherSource,
  /const weatherLocationKey = ref\(''\)/,
  'useWateringAdvisorWeather 应定义 weatherLocationKey ref'
)

assert.match(
  advisorWeatherSource,
  /const plannerLocationKey = computed/,
  'useWateringAdvisorWeather 应定义 plannerLocationKey computed'
)

assert.match(
  advisorWeatherSource,
  /userPlant\?\.careLocation\?\.locationKey \|\| userPlant\?\.locationKey/,
  'useWateringAdvisorWeather plannerLocationKey 应从 userPlant.careLocation.locationKey 读取'
)

assert.match(
  advisorSource,
  /fetchUserPlantWateringPlanner\(\{[\s\S]*?airEnvironmentOverride,[\s\S]*?locationKey: plannerLocationKey\.value,[\s\S]*?timezone: 'Asia\/Shanghai'/,
  'watering-advisor 用户植物 Planner 应传入空气环境、locationKey 和 timezone'
)

assert.match(
  advisorSource,
  /fetchAdhocPlannerResult\(\{[\s\S]*?locationKey: plannerLocationKey\.value,[\s\S]*?timezone: 'Asia\/Shanghai'/,
  'watering-advisor fetchAdhocPlannerResult 应传入 locationKey 和 timezone'
)

assert.match(
  advisorWeatherSource,
  /weatherLocationKey\.value = String\([\s\S]*?window\?\.locationKey/,
  'useWateringAdvisorWeather loadWeatherDays 应从 weather window 提取 locationKey'
)

assert.match(
  advisorSource,
  /useWateringAdvisorWeather\(\{ selectedCatalogPlant, plantStore, userStore \}\)/,
  'watering-advisor 应通过 useWateringAdvisorWeather 组合天气加载逻辑'
)

console.log('✓ frontend D0 injection contract tests passed')
