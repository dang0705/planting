import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

/**
 * 前端 D0 注入契约测试：
 * 验证三个浇水 planner 入口的前端代码正确传递 locationKey/timezone，
 * 以及 normalizeEnvironmentWeatherWindowPayload 截断 forecastDays 至 14 项（D+1..D+14）。
 *
 * 契约要点：
 *   - forecastDays 数组前端只传 D+1..D+14（14 项），D0 由后端从 day file latestSample 注入
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
const advisorSource = readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')
const advisorWeatherSource = readFileSync(
  'src/pages/watering-advisor/useWateringAdvisorWeather.js',
  'utf8'
)

/* ============================================================
 * 1. src/api/weather.js: normalizeEnvironmentWeatherWindowPayload 截断 forecastDays
 * ============================================================ */

assert.match(
  weatherApiSource,
  /MAX_ARRAY_FORECAST_DAYS_TO_KEEP\s*=\s*14/,
  'weather.js 应定义 MAX_ARRAY_FORECAST_DAYS_TO_KEEP = 14'
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
  /forecastDays: normalizedForecastDays\.slice\(0, MAX_ARRAY_FORECAST_DAYS_TO_KEEP\)/,
  'normalizeEnvironmentWeatherWindowPayload 应将 forecastDays 截断为 14 项'
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
 *    传递 locationKey/timezone 给 fetchWateringPlannerResult
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
  /fetchWateringPlannerResult\(\{[\s\S]*?locationKey: plannerLocationKey\.value,[\s\S]*?timezone: 'Asia\/Shanghai'/,
  'watering-advisor fetchWateringPlannerResult 应传入 locationKey 和 timezone'
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
