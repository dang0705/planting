// data_mode=unit_fake; test_kind=source_contract.
// Expected 来源：用户反馈的可观察行为 + 现有浇水建议流程合同。
// 底部“继续查看建议”点击后，必须把当前盆土证据交给真实页面编排，
// 继续调用既有 watering-advisor 请求；不能依赖嵌套 slot/scroll-view 中
// 可能拿不到实例的组件 ref，导致点击无响应。
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const read = relative => fs.readFileSync(path.join(process.cwd(), relative), 'utf8')
const page = read('src/subpackages/care/watering-advisor/watering-advisor.vue')
const stage = read('src/components/watering/WateringSoilEvidenceStage.vue')

assert.match(
  page,
  /<WateringSoilEvidenceStage[\s\S]*:continue-request="soilEvidenceContinueRequest"/u,
  '底部按钮必须通过响应式指令请求盆土组件提交证据'
)
assert.match(
  page,
  /function continueSoilEvidence\(\)\s*\{[\s\S]{0,180}soilEvidenceContinueRequest\.value\s*\+=\s*1/u,
  '底部按钮点击必须发出一次提交指令'
)
assert.match(
  stage,
  /continueRequest:\s*\{\s*type:\s*Number,\s*default:\s*0\s*\}/u,
  '盆土组件必须接收提交指令'
)
assert.match(
  stage,
  /watch\(\s*\(\)\s*=>\s*props\.continueRequest[\s\S]{0,220}continueWithEvidence\(\)/u,
  '盆土组件收到提交指令后必须执行真实证据交接'
)
assert.match(page, /fetchAdhocPlannerResult\(/u)
assert.match(page, /fetchUserPlantWateringPlanner\(/u)

console.log('watering advisor soil evidence submit command contract passed')
