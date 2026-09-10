import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// data_mode=unit_fake; test_kind=source_contract
// 首次进入独立问诊时，问题栈已经就绪也必须主动拉取历史天气，不能只等后续状态变化。
const sourcePath = fileURLToPath(
  new URL(
    '../../../../../../src/subpackages/diagnosis/question-package/question-flow.js',
    import.meta.url
  )
)
const source = await readFile(sourcePath, 'utf8')

const weatherWindowWatchStart = source.indexOf('userStore.location?.latitude')
assert.ok(weatherWindowWatchStart >= 0, '问题包必须监听独立诊断天气的定位与问题栈')

const weatherWindowWatch = source.slice(weatherWindowWatchStart, weatherWindowWatchStart + 900)
assert.ok(
  weatherWindowWatch.includes('refreshEnvironmentWeatherWindowForCareBehavior('),
  '问题包首次准备时必须触发历史天气刷新'
)
assert.ok(
  weatherWindowWatch.includes('{ immediate: true }'),
  '问题包天气刷新 watcher 必须在首次挂载立即执行'
)

console.log('question-flow-weather-bootstrap tests passed')
