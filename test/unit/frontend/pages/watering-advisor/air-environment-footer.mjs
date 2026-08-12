import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(process.cwd(), 'src/pages/watering-advisor/watering-advisor.vue'),
  'utf8'
)

// 空气环境编辑态由 AirEnvironmentAssessment 自己承载底部动作；页面级动作只在
// 已有摘要且没有打开编辑器时出现，避免两个 footer 同时占位或重复推进流程。
assert.match(
  source,
  /activeStep === AIR_ENVIRONMENT_STEP[\s\S]*?isUserPlant[\s\S]*?showSavedAirEnvironmentSummary[\s\S]*?!airEnvironmentEditorOpen/
)
assert.match(source, /id-prefix="watering-advisor-air-environment"[\s\S]*?footer-position="fixed"/)
assert.match(
  source,
  /id-prefix="watering-advisor-air-environment"[\s\S]*?layout-mode="single-page"/
)
assert.match(source, /id-prefix="watering-advisor-air-environment"[\s\S]*?height-mode="content"/)

console.log('watering advisor air-environment footer contract tests passed')
