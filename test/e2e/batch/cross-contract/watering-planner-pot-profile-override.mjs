// 聚焦测试：验证 /user-plants/watering-planner 的 potProfile 可选覆盖逻辑
// 合同 docs/ACTIVE_CONTRACTS.md §7.2.1：request.body.potProfile 优先，未传时回退 strategy.potProfile (DB)
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
console.log('Watering Planner potProfile Override 测试开始')
console.log('='.repeat(60))

// ---- 1. 后端 app.js 静态断言：override 优先、未传回退 DB ----
const appSource = readFileSync('cloudfunctions/plant-user-http/app.js', 'utf8')

test('app.js 定义 potProfileOverride 并优先使用 request.body.potProfile', () => {
  assert.match(appSource, /const potProfileOverride = request\.body\.potProfile \|\| null/)
  assert.match(appSource, /potProfile: potProfileOverride \|\| strategy\.potProfile \|\| null/)
})

test('app.js override 逻辑必须出现在 /watering-planner 处理块内', () => {
  const plannerBranchIdx = appSource.indexOf("path.includes('/watering-planner')")
  assert.ok(plannerBranchIdx > 0, '未找到 /watering-planner 处理分支')
  const overrideIdx = appSource.indexOf('const potProfileOverride')
  assert.ok(overrideIdx > plannerBranchIdx, 'potProfileOverride 必须在 /watering-planner 分支内')
})

test('app.js 在 shadow candidate 计算中也使用同一 override', () => {
  const candidateMatches = appSource.match(/candidatePlan = buildWateringPlanner\(\{[\s\S]*?\}\)/)
  assert.ok(candidateMatches, '未找到 candidatePlan buildWateringPlanner 调用')
  assert.match(candidateMatches[0], /potProfile: potProfileOverride/)
})

test('app.js 不在 /watering-planner 路径写回 user_plant_instances', () => {
  // 合同要求：potProfile 覆盖仅用于本次计算，不落库
  // 仅检查 /watering-planner 分支块本身（到下一个 path.includes 分支为止）
  const plannerBranchIdx = appSource.indexOf("path.includes('/watering-planner')")
  const nextBranchIdx = appSource.indexOf('path.includes(', plannerBranchIdx + 10)
  const plannerBlock =
    nextBranchIdx > 0
      ? appSource.slice(plannerBranchIdx, nextBranchIdx)
      : appSource.slice(plannerBranchIdx, plannerBranchIdx + 3000)
  assert.doesNotMatch(
    plannerBlock,
    /await updateUserPlantInstance/,
    'watering-planner 分支不得调用 updateUserPlantInstance 写回主表'
  )
})

// ---- 2. 前端 watering-reminder-options.js 静态断言：可选 potProfile 入参 ----
const optionsSource = readFileSync(
  'src/pages/index/components/watering-reminder-options.js',
  'utf8'
)

test('buildWateringPlannerRequestPayload 接受可选 potProfile 并条件加入 payload', () => {
  assert.match(
    optionsSource,
    /export function buildWateringPlannerRequestPayload\(\{[\s\S]*?potProfile = null[\s\S]*?\}\)/
  )
  assert.match(
    optionsSource,
    /if \(potProfile\) \{[\s\S]*?payload\.potProfile = potProfile[\s\S]*?\}/
  )
})

test('fetchWateringPlannerResult 透传 potProfile 给 payload 构造', () => {
  assert.match(
    optionsSource,
    /export async function fetchWateringPlannerResult\(\{[\s\S]*?potProfile = null[\s\S]*?\}\)/
  )
  assert.match(
    optionsSource,
    /buildWateringPlannerRequestPayload\(\{[\s\S]*?potProfile[\s\S]*?\}\)/
  )
})

// ---- 3. 前端 watering-advisor.vue 静态断言：我的植物路径传入 potProfile ----
const advisorSource = readFileSync('src/pages/watering-advisor/watering-advisor.vue', 'utf8')

test('watering-advisor 我的植物路径调用 fetchWateringPlannerResult 时传入 potProfile', () => {
  assert.match(
    advisorSource,
    /const isUserPlant = Boolean\(selectedCatalogPlant\.value\?\.userPlantId\)/
  )
  const isUserPlantIdx = advisorSource.indexOf('const isUserPlant = Boolean')
  const fetchIdx = advisorSource.indexOf('fetchWateringPlannerResult', isUserPlantIdx)
  assert.ok(fetchIdx > isUserPlantIdx, '我的植物路径未调用 fetchWateringPlannerResult')
  const blockEnd = advisorSource.indexOf('} else {', fetchIdx)
  const block = advisorSource.slice(fetchIdx, blockEnd)
  assert.match(block, /potProfile:\s*payload/, '我的植物路径必须传入 potProfile: payload')
})

// ---- 4. 前端 PotProfileFormCore.vue 静态断言：initialProfile null 时重置 ----
const coreSource = readFileSync('src/components/pot-profile/PotProfileFormCore.vue', 'utf8')

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

// ---- 5. 纯函数行为断言：buildWateringPlannerRequestPayload 覆盖语义 ----
// 注：watering-reminder-options.js 依赖 @/api/http（UniApp 构建期别名），无法在纯 Node 环境 import。
// 改用源码静态断言验证条件加入逻辑（上方 test 已覆盖 if(potProfile){payload.potProfile=...}）
test('buildWateringPlannerRequestPayload 源码包含条件加入 potProfile 的逻辑', () => {
  assert.match(
    optionsSource,
    /if \(potProfile\) \{[\s\S]*?payload\.potProfile = potProfile[\s\S]*?\}/,
    '必须在 potProfile truthy 时加入 payload，未传时不包含 potProfile 键'
  )
})

test('buildWateringPlannerRequestPayload 默认参数 potProfile = null（首页兼容）', () => {
  // 默认值为 null 确保 WateringReminderSheet 不传此参数时 payload 不含 potProfile
  assert.match(
    optionsSource,
    /export function buildWateringPlannerRequestPayload\(\{[\s\S]*?potProfile = null[\s\S]*?\}\)/
  )
})

console.log('\n' + '='.repeat(60))
console.log(`✓ 通过: ${passed}`)
console.log(`✗ 失败: ${failed}`)
console.log('='.repeat(60))

if (failed > 0) {
  process.exit(1)
}
