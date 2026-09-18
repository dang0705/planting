// data_mode=unit_fake; test_kind=source_contract
// Expected 来自浇水证据合同：我的植物路径必须把视觉干燥结论传入 planner，
// 且历史浇水事件只能有一个来源，不能被空的盆土交互数组覆盖。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const planner = read('src/pages/index/components/useWateringReminderPlanner.js')
const options = read('src/pages/index/components/watering-reminder-options.js')
const advisor = read('src/subpackages/care/watering-advisor/watering-advisor.vue')

assert.match(
  planner,
  /soilMoistureOverride:\s*String\(soilEvidence\?\.value\?\.soilMoistureOverride \|\| ''\)\.trim\(\)/u,
  '用户植物规划必须收到盆土视觉/人工确认后的干湿覆盖值'
)
const plannerRequestStart = options.indexOf('export function buildWateringPlannerRequestPayload(')
const plannerRequestEnd = options.indexOf('export async function fetchWateringPlannerResult(', plannerRequestStart)
assert.ok(plannerRequestStart >= 0 && plannerRequestEnd > plannerRequestStart, '浇水规划请求构造器应存在')
assert.match(
  options.slice(plannerRequestStart, plannerRequestEnd),
  /soilMoistureOverride:\s*String\(soilMoistureOverride \|\| ''\)\.trim\(\)/u,
  '浇水规划请求构造器必须实际序列化盆土干湿覆盖值'
)

const userPlannerStart = advisor.indexOf('fetchUserPlantWateringPlanner({')
assert.ok(userPlannerStart >= 0, '用户植物规划请求应存在')
const userPlannerEnd = advisor.indexOf('\n      })', userPlannerStart)
assert.ok(userPlannerEnd > userPlannerStart, '用户植物规划请求应有明确结束位置')
const userPlannerBlock = advisor.slice(userPlannerStart, userPlannerEnd)
assert.equal(
  [...userPlannerBlock.matchAll(/^\s*wateringEvents:/gmu)].length,
  1,
  '用户植物规划请求不得重复传入 wateringEvents'
)
assert.match(
  userPlannerBlock,
  /wateringEvents:\s*selectedCatalogPlant\.value\.wateringEvents/u,
  '用户植物规划应保留服务端可核对的历史浇水事件来源'
)

console.log('watering reminder soil forwarding source-contract tests passed')
