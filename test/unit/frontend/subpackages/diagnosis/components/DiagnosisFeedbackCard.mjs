import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(
  new URL(
    '../../../../../../src/subpackages/diagnosis/components/DiagnosisFeedbackCard.vue',
    import.meta.url
  ),
  'utf8'
)
assert.match(source, /submitDiagnosisFeedback/)
assert.match(source, /isHelpful/)
assert.match(source, /isAccurate/)
assert.match(source, /diagnosis-feedback.*submit|\$\{idPrefix\}-submit/)
assert.match(source, /提交反馈/)
assert.match(source, /statusMessage\.value = '提交失败，请稍后重试。'/)
assert.doesNotMatch(source, /statusMessage\.value = error\?\.message/)
console.log('diagnosis feedback component contract passed')
