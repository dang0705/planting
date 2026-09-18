import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/subpackages/diagnosis/question-package/AirEnvironmentQuestionInput.vue'
  ),
  'utf8'
)
const flowSource = fs.readFileSync(
  path.join(process.cwd(), 'src/subpackages/diagnosis/question-package/question-flow.js'),
  'utf8'
)
const stateSource = fs.readFileSync(
  path.join(
    process.cwd(),
    'src/subpackages/diagnosis/question-package/question-air-environment.js'
  ),
  'utf8'
)

assert.match(source, /<AirEnvironmentDualMode/)
assert.match(source, /:draft-state="draftState"/)
assert.match(source, /:external-footer="externalFooter"/)
assert.match(source, /@draft-change="value => emit\('draft-change', value\)"/)
assert.match(flowSource, /handleNextQuestion\(\)[\s\S]*airEnvironment\.completeDraft/)
assert.match(stateSource, /editKind === 'mode_switch'/)
assert.match(stateSource, /function completeDraft[\s\S]*buildQuickAirEnvironmentAssessment/)
assert.match(stateSource, /completedByQuestionId[\s\S]*draftByQuestionId/)

console.log('diagnose air-environment entry contract tests passed')
