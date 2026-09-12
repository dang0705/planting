import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync('src/subpackages/diagnosis/question-package.vue', 'utf8')

assert.match(
  source,
  /v-if="questionIndex === activeQuestionIndex"[\s\S]*?:id="`diagnose-question-package-page-active-question-\$\{getQuestionId\(question\) \|\| questionIndex\}`"/,
  'only the active ButtonStepTrack item must expose the public active-question marker'
)
assert.match(
  source,
  /diagnose-question-package-page-question-shell-\$\{getQuestionId\(question\) \|\| questionIndex\}/,
  'the marker and question shell must share getQuestionId(question) || questionIndex normalization'
)
assert.match(
  source,
  /class="pointer-events-none absolute h-0 w-0 overflow-hidden"/,
  'the active-question marker must remain zero-size and non-interactive'
)
assert.doesNotMatch(
  source,
  /diagnose-question-package-page-active-question-[^`]*activeQuestionIndex/,
  'the marker id must identify the active question, not leak its private index'
)
assert.match(
  source,
  /v-if="!activeAirEnvironmentOwnsFooter"/,
  'air-environment editing must own the footer instead of duplicating the question footer'
)
assert.match(
  source,
  /completion-id="diagnose-question-package-page-next-button"/,
  'air-environment completion reuses the question package next action id'
)

console.log('question-package active-question marker contract passed')
