import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(
  new URL('../../../../src/components/DiagnosisFeedbackCard.vue', import.meta.url),
  'utf8'
)
assert.match(source, /submitDiagnosisFeedback/)
assert.match(source, /isHelpful/)
assert.match(source, /isAccurate/)
assert.match(source, /diagnosis-feedback.*submit|\$\{idPrefix\}-submit/)
assert.match(source, /提交反馈/)
console.log('diagnosis feedback component contract passed')
