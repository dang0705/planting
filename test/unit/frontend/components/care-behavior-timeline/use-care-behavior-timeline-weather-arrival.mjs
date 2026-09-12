import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// data_mode=unit_fake; test_kind=source_contract
// 独立问诊的天气请求晚于时间轴初次渲染时，日期格仍必须按新天气显示指标。
const sourcePath = fileURLToPath(
  new URL(
    '../../../../../src/components/care-behavior-timeline/useCareBehaviorTimeline.js',
    import.meta.url
  )
)
const source = await readFile(sourcePath, 'utf8')
const componentSource = await readFile(
  fileURLToPath(new URL('../../../../../src/components/CareBehaviorTimeline.vue', import.meta.url)),
  'utf8'
)
const questionPackageSource = await readFile(
  fileURLToPath(
    new URL('../../../../../src/subpackages/diagnosis/question-package.vue', import.meta.url)
  ),
  'utf8'
)
const questionFlowSource = await readFile(
  fileURLToPath(
    new URL(
      '../../../../../src/subpackages/diagnosis/question-package/question-flow.js',
      import.meta.url
    )
  ),
  'utf8'
)
const questionWeatherWindowSource = await readFile(
  fileURLToPath(
    new URL(
      '../../../../../src/subpackages/diagnosis/question-package/question-weather-window.js',
      import.meta.url
    )
  ),
  'utf8'
)
const careWeatherWindowSource = await readFile(
  fileURLToPath(
    new URL('../../../../../src/utils/care-behavior-weather-window.js', import.meta.url)
  ),
  'utf8'
)
const careWeatherWindowNoticeSource = careWeatherWindowSource
const questionEnvironmentSource = await readFile(
  fileURLToPath(
    new URL(
      '../../../../../src/subpackages/diagnosis/question-package/question-environment.js',
      import.meta.url
    )
  ),
  'utf8'
)
const weatherApiSource = await readFile(
  fileURLToPath(new URL('../../../../../src/api/weather.js', import.meta.url)),
  'utf8'
)
const cellItemStart = source.indexOf('const cellItems = computed(() =>')

assert.ok(cellItemStart >= 0, '时间轴必须生成日期格显示状态')

const cellItemSource = source.slice(cellItemStart, cellItemStart + 2400)
assert.match(cellItemSource, /const weather = weatherByDate\.value\[item\.date\] \|\| \{\}/)
assert.match(
  cellItemSource,
  /hasWeatherMetrics: Boolean\(\s*state\.temperatureText \|\|\s*state\.humidityText \|\|\s*weather\.temperatureText \|\|\s*weather\.humidityText\s*\)/
)
assert.match(
  cellItemSource,
  /temperatureText: state\.temperatureText \|\| weather\.temperatureText \|\| ''/
)
assert.match(cellItemSource, /humidityText: state\.humidityText \|\| weather\.humidityText \|\| ''/)
assert.match(
  source,
  /props\.weatherByDate,[\s\S]*props\.environmentWeatherWindow,[\s\S]*collectWeatherSources\(props\.question, timeline\)/,
  '时间轴必须优先读取页面已解析的按日期天气映射'
)
assert.match(
  componentSource,
  /environmentWeatherWindow: \{ type: Object, default: null \}/,
  '时间轴组件必须保留完整天气窗口入参'
)
assert.match(
  questionPackageSource,
  /:weather-by-date="environmentWeatherByDate"/,
  '独立问诊页必须将按日期天气映射直接传给时间轴'
)
assert.match(
  questionPackageSource,
  /useQuestionPackageContext\(\{[\s\S]*payload,[\s\S]*result,[\s\S]*routeOptions/,
  '独立问诊页必须把 draft payload 传给标题上下文，不能在分包页渲染时读取 undefined'
)
assert.match(
  questionPackageSource,
  /v-else-if="isQuestionStatePreparing"/,
  '天气加载期间不得显示没有问题的空状态'
)
assert.match(
  questionPackageSource,
  /:items="questionStack"/,
  '分步容器必须只使用提交用的原始题目列表'
)
assert.match(questionPackageSource, /正在准备问诊…/, '加载提示必须向用户说明当前状态')
assert.match(
  questionFlowSource,
  /questionStack\.value = nextQuestions[\s\S]*refreshEnvironmentWeatherWindowForCareBehavior\([\s\S]*\.then\(\(\) => \{[\s\S]*buildCareBehaviorTimelineByQuestionIdMap\(nextQuestions\)/,
  '天气窗口必须异步填充，不能阻塞独立问诊步骤首次挂载'
)

assert.match(
  questionWeatherWindowSource,
  /function hydrateEnvironmentWeatherWindow\(weatherWindow = null\)/,
  '问诊分包必须只接受带有效日期记录的天气窗口'
)
assert.match(
  careWeatherWindowNoticeSource,
  /最近 10 天的天气记录暂未准备好，养护记录仍可继续填写。/,
  '历史天气不可用时必须给用户明确且可继续操作的提示'
)
assert.match(
  careWeatherWindowNoticeSource,
  /最近 10 天有部分天气记录缺失，日期仍可继续填写。/,
  'partial 历史天气必须明确提示缺失日期，不能静默当作完整窗口'
)
assert.match(
  careWeatherWindowSource,
  /historicalDays\.length < 10/,
  '不足十天的历史窗口必须进入用户可见的降级提示'
)
assert.match(
  careWeatherWindowSource,
  /currentWeatherSource === 'day_latest_sample'[\s\S]*currentWeatherDate === todayDate/,
  '时间线不得把未确认日期的 currentWeather 合并到今天'
)
assert.match(
  careWeatherWindowSource,
  /currentWeather\?\.obsTime[\s\S]*currentWeather\?\.updatedAt/,
  '时间线必须支持从 currentWeather 的观测时间推导日期'
)
assert.match(
  questionWeatherWindowSource,
  /resolveEnvironmentWeatherWindowNotice/,
  '诊断与浇水提醒必须复用同一套天气窗口提示文案'
)
assert.match(
  questionEnvironmentSource,
  /return toDateString\(new Date\(\)\)/,
  '独立问诊无题目日期时必须使用本地日历日，不能在零点后退回 UTC 前一天'
)
assert.match(
  questionWeatherWindowSource,
  /resolveCareBehaviorWeatherLocation\(userStore\.location \|\| \{\}\)/,
  '独立问诊必须直接使用当前用户真实定位请求天气窗口'
)
assert.match(
  questionWeatherWindowSource,
  /forceRefresh: true,[\s\S]*timeout: 8_000/,
  '独立问诊不得等待遗留同 key 查询；必须使用有上限的真实天气请求'
)
assert.match(
  weatherApiSource,
  /forceRefresh = false,[\s\S]*timeout[\s\S]*requestHttpFunction\('weather-http\/weather\/environment-context'/,
  '天气 API 必须为独立问诊保留绕过查询队列的真实 HTTP 请求通道'
)
assert.match(
  questionWeatherWindowSource,
  /const independentLocation = userPlantId[\s\S]*resolveDiagnosisCareLocation/,
  '用户植物诊断仍必须保留植物养护地点解析路径'
)
assert.match(
  questionFlowSource,
  /isQuestionStatePreparing\.value = true[\s\S]*finally \{[\s\S]*isQuestionStatePreparing\.value = false/,
  '问诊准备状态必须在成功和失败后都能收束'
)

console.log('care behavior timeline late weather arrival contract passed')
