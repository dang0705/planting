import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const pageSource = fs.readFileSync(path.join(repoRoot, 'src/pages/airflow/index.vue'), 'utf8')
const pagesConfig = JSON.parse(fs.readFileSync(path.join(repoRoot, 'src/pages.json'), 'utf8'))

// 1. 路由只是完整空气环境组件的容器，不拆出独立的室内/室外页面
const airflowPage = pagesConfig.pages.find(item => item.path === 'pages/airflow/index')
assert.ok(airflowPage, 'airflow page must be registered in pages.json')
assert.equal(airflowPage.style.navigationBarTitleText, '空气环境评估')

// 2. 使用现有 Layout；独立模式标题为“空气环境评估”，植物编辑模式切换为“空气环境”。
assert.match(pageSource, /import Layout from '@\/Layout\.vue'/)
assert.match(pageSource, /pageTitle/)

// 3. 页面调用完整组件，并以完整空气环境合同校验完成状态
assert.match(
  pageSource,
  /import AirEnvironmentAssessment from '@\/components\/AirEnvironmentAssessment\.vue'/
)
assert.match(pageSource, /<AirEnvironmentAssessment/)
assert.match(pageSource, /layout-mode="single-page"/)
assert.match(pageSource, /createInitialAirEnvironmentInput/)
assert.match(pageSource, /:completion-label="[\s\S]*'完成'/)
assert.match(pageSource, /footer-position="fixed"/)
assert.match(pageSource, /<AirEnvironmentAssessment[\s\S]*?v-else-if="!result"/)
assert.match(pageSource, /airflow-submit-button/)
assert.match(pageSource, /@complete="handleComplete"/)
assert.match(pageSource, /height-mode="content"/)
assert.match(pageSource, /plantId/)
assert.match(pageSource, /returnTo/)
assert.match(pageSource, /plant-air-environment-complete-button/)
assert.match(pageSource, /plant-environment-saved/)

// 4. 完成后展示完整空气环境的中性摘要，不暴露等级/优劣/建议
assert.match(pageSource, /describeAirEnvironmentInput/)
assert.match(pageSource, /id="airflow-result-summary"/)
assert.match(pageSource, /记录完成/)
assert.doesNotMatch(
  pageSource,
  /resolveAirExchangeEvidence|getAirExchangeLevelLabel|AIR_EXCHANGE_LEVEL_LABELS|RESULT_HINTS/
)
assert.doesNotMatch(pageSource, /较充分|偏少|换气情况评估|增加开门开窗频率/)

// 5. 重置按钮存在
assert.match(pageSource, /id="airflow-reset-button"/)

// 6. 提交按钮 id
assert.match(pageSource, /airflow-submit-button/)

// 7. 结果摘要 id
assert.match(pageSource, /id="airflow-result-summary"/)

// 8. 完整组件以 id-prefix='airflow' 使用
assert.match(pageSource, /'airflow'/)

// 9. 页面文字不暴露内部算法
assert.doesNotMatch(
  pageSource,
  /airExchangeEvidence|level=high|level=medium|level=low|airExchangeLevel/
)

// 10. 植物编辑模式复用当前用户植物和空气环境持久化链路；独立模式仍不展示内部算法。
assert.match(pageSource, /useUserPlantAirEnvironment/)
assert.match(pageSource, /usePlantStore/)
assert.match(pageSource, /useUserStore/)

// 11. 文案不评价“通风是否充足”、不宣称“对植物有利”
assert.doesNotMatch(pageSource, /通风是否充足|对植物有利|对大多数植物有利/)

// 12. 页面不得越过完整组件直接调用室外换气子组件
assert.doesNotMatch(pageSource, /import AirExchangeAssessment/)
assert.doesNotMatch(pageSource, /<AirExchangeAssessment/)

console.log('airflow page contract tests passed')
