// 聚焦测试：验证“我的植物”浇水规划只使用已保存盆型，查看建议前先完成盆型落库。
// 独立浇水建议仍可使用临时盆型，但不能把临时输入混入用户植物规划。
// 静态源码断言 + 纯函数行为断言，不依赖 cloudbase 运行环境
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

let passed = 0
let failed = 0

function test(name, fn) {
  try {
    fn()
    console.log(`✓ ${name}`)
    passed++
  } catch (error) {
    console.log(`✗ ${name}: ${error.message}`)
    failed++
  }
}

console.log('='.repeat(60))
console.log('Watering Planner potProfile persistence boundary 测试开始')
console.log('='.repeat(60))

// ---- 1. 后端 app.js 静态断言：我的植物规划只读服务端盆型 ----
const appSource = readFileSync('cloudfunctions/plant-user-http/app.js', 'utf8')
const plannerBranchIdx = appSource.indexOf("path.includes('/watering-planner')")
assert.ok(plannerBranchIdx > 0, '未找到 /watering-planner 处理分支')
const nextBranchIdx = appSource.indexOf('path.includes(', plannerBranchIdx + 10)
const plannerBlock =
  nextBranchIdx > 0
    ? appSource.slice(plannerBranchIdx, nextBranchIdx)
    : appSource.slice(plannerBranchIdx, plannerBranchIdx + 10_000)

test('app.js 我的植物规划使用服务端已保存盆型', () => {
  assert.match(plannerBlock, /potProfile: strategy\.potProfile \|\| null/)
  assert.doesNotMatch(plannerBlock, /request\.body\.potProfile/)
})

test('app.js 独立浇水建议仍明确接收临时盆型', () => {
  const advisorBranchIdx = appSource.indexOf("path.includes('/watering-advisor')")
  assert.ok(advisorBranchIdx > 0, '未找到 /watering-advisor 处理分支')
  assert.match(
    appSource.slice(advisorBranchIdx, plannerBranchIdx),
    /potProfile: request\.body\.potProfile \|\| null/
  )
})

test('app.js shadow candidate 计算与正式规划使用同一服务端盆型', () => {
  const candidateMatches = appSource.match(/candidatePlan = buildWateringPlanner\(\{[\s\S]*?\}\)/)
  assert.ok(candidateMatches, '未找到 candidatePlan buildWateringPlanner 调用')
  assert.match(candidateMatches[0], /potProfile: strategy\.potProfile \|\| null/)
})

test('app.js 规划分支不把客户端临时盆型写回植物', () => {
  assert.doesNotMatch(
    plannerBlock,
    /await updateUserPlantInstance/,
    'watering-planner 分支不得在计算时写回主表'
  )
})

// ---- 2. 前端：保存盆型后才发起规划请求 ----
const optionsSource = readFileSync(
  'src/pages/index/components/watering-reminder-options.js',
  'utf8'
)
const inputFlowSource = readFileSync(
  'src/pages/index/components/useWateringReminderInputFlow.js',
  'utf8'
)
const plannerSource = readFileSync(
  'src/pages/index/components/useWateringReminderPlanner.js',
  'utf8'
)
const persistenceLeafSource = readFileSync(
  'test/e2e/automator/care/watering/reminder-pot-profile/persistence.mjs',
  'utf8'
)

test('查看浇水建议前先调用当前植物盆型保存接口', () => {
  const saveIdx = inputFlowSource.indexOf('await plantStore.savePotProfile')
  const plannerIdx = inputFlowSource.indexOf('await fetchPlanner()', saveIdx)
  assert.ok(saveIdx >= 0, '未找到查看建议前的盆型保存调用')
  assert.ok(plannerIdx > saveIdx, '盆型保存必须发生在 planner 请求之前')
})

test('我的植物规划请求默认不携带临时 potProfile 覆盖', () => {
  const fetchIdx = plannerSource.indexOf('fetchWateringPlannerResult({')
  assert.ok(fetchIdx >= 0, '未找到用户植物 planner 请求调用')
  const fetchBlock = plannerSource.slice(fetchIdx, plannerSource.indexOf('\n      })', fetchIdx))
  assert.doesNotMatch(fetchBlock, /potProfile/)
})

test('正式 Automator 覆盖拖拽、PATCH、planner 与重新打开回显', () => {
  assert.match(persistenceLeafSource, /ensurePotProfileByDrag: true/)
  assert.match(persistenceLeafSource, /potProfileSaveRequests/)
  assert.match(persistenceLeafSource, /PATCH 返回的用户植物已回显相同盆型/)
  assert.match(persistenceLeafSource, /保存后的 planner 返回可用浇水量范围/)
  assert.match(persistenceLeafSource, /重新进入盆型步骤后显示已保存的盆型拖拽节点/)
})

// ---- 3. 独立浇水建议仍使用临时盆型 ----
const advisorSource = readFileSync(
  'src/subpackages/care/watering-advisor/watering-advisor.vue',
  'utf8'
)

test('watering-advisor 的独立路径调用 planner 时传入临时盆型', () => {
  assert.match(advisorSource, /fetchAdhocPlannerResult\(/)
  assert.match(advisorSource, /potProfile:\s*payload/)
})

// ---- 4. 前端 PotProfileFormCore.vue 静态断言：initialProfile null 时重置 ----
const coreSource = readFileSync('src/components/pot-profile/PotProfileFormCore.vue', 'utf8')
const resultCardSource = readFileSync(
  'src/pages/index/components/WateringReminderResultCard.vue',
  'utf8'
)

test('PotProfileFormCore initialProfile watcher 在 null 时也触发重置', () => {
  const watcherMatch = coreSource.match(
    /watch\(\s*\(\) => props\.initialProfile,\s*profile => \{[\s\S]*?\}\s*\)/
  )
  assert.ok(watcherMatch, '未找到 initialProfile watcher')
  assert.doesNotMatch(
    watcherMatch[0],
    /if \(profile\)\s*\{/,
    'watcher 不得有 if(profile) 守卫，否则 null 时不会重置到默认值'
  )
  assert.match(
    watcherMatch[0],
    /applyPotProfile\(profile\)/,
    'watcher 必须直接调用 applyPotProfile(profile)'
  )
})

test('PotProfileFormCore applyPotProfile 在 null 入参时重置到 DEFAULT_FORM', () => {
  const applyMatch = coreSource.match(/function applyPotProfile[\s\S]*?\n}/)
  assert.ok(applyMatch, '未找到 applyPotProfile 函数')
  assert.match(applyMatch[0], /DEFAULT_FORM/, 'applyPotProfile 必须引用 DEFAULT_FORM 进行重置')
})

test('水量结果提供稳定 Automator id，且不改变展示文案', () => {
  assert.match(resultCardSource, /id="watering-reminder-result-amount"/)
  assert.match(resultCardSource, /\{\{ amountBottleText \}\}/)
})

console.log('\n' + '='.repeat(60))
console.log(`✓ 通过: ${passed}`)
console.log(`✗ 失败: ${failed}`)
console.log('='.repeat(60))

if (failed > 0) {
  process.exit(1)
}
