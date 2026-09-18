// data_mode=unit_fake; test_kind=source_contract.
/* oxlint-disable no-console -- contract runner emits a concise terminal result. */
// Expected 来源：用户截图与描述中的两个可观察结果：
// 1) “我已摸到超过盆深 1/3”与“盆土状态”必须是同一组连续确认；
// 2) environment-weather-window 返回的 historicalDays/forecastDays 必须传到日历组件，
//    且在进入盆土确认前开始准备，不能只在最终建议页才请求。
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = relative => readFileSync(relative, 'utf8')
const interior = read('src/components/watering/WateringSoilInteriorCheck.vue')
const stage = read('src/components/watering/WateringSoilEvidenceStage.vue')
const page = read('src/subpackages/care/watering-advisor/watering-advisor.vue')

assert.match(interior, /watering-soil-interior-check__manual-group/u)
assert.match(interior, /watering-soil-interior-check__detail-title">盆土状态</u)
assert.match(interior, /:environment-weather-window="props\.environmentWeatherWindow"/u)
assert.match(stage, /environmentWeatherWindow: \{ type: Object, default: null \}/u)
assert.match(stage, /:environment-weather-window="props\.environmentWeatherWindow"/u)
assert.match(page, /const wateringAdvisorWeatherWindow = computed\(\(\) =>/u)
assert.match(page, /:environment-weather-window="wateringAdvisorWeatherWindow"/u)
assert.match(page, /async function prepareSoilCalendarWeather\(\)/u)
assert.match(
  page,
  /if \(evidenceId && !previousEvidenceId\) \{[\s\S]{0,120}prepareSoilCalendarWeather\(\)\.catch/u
)

console.log('watering advisor soil status and calendar weather contract passed')
