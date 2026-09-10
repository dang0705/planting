import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// data_mode=unit_fake; test_kind=source_contract
const source = readFileSync('src/subpackages/diagnosis/question-package.vue', 'utf8')

assert.match(
  source,
  /id="diagnose-question-package-page"[\s\S]*?h-\[calc\(100vh-var\(--app-header-height\)\)\][\s\S]*?<scroll-view[\s\S]*?id="diagnose-question-package-page-scroll"[\s\S]*?scroll-y[\s\S]*?:scroll-top="questionPageScrollTop"/,
  'the question package must own one constrained vertical scroll container'
)
assert.match(
  source,
  /<ButtonStepTrack[\s\S]*?v-if="!isCareBehaviorWateringTimelineQuestion\(currentQuestion\)"[\s\S]*?:fill="false"[\s\S]*?item-class="relative overflow-x-hidden"/,
  'the step track must not own the watering timeline component'
)
assert.match(
  source,
  /<\/ButtonStepTrack>[\s\S]*?<view[\s\S]*?v-else[\s\S]*?<CareBehaviorTimeline[\s\S]*?:key="`\$\{getQuestionId\(currentQuestion\)\}-\$\{activeQuestionIndex\}`"/,
  'the active watering timeline must render outside the step-track slot with a fresh active-step identity'
)
assert.match(
  source,
  /async function resetActiveQuestionPageScroll\(\)[\s\S]*?questionPageScrollTop\.value = QUESTION_PAGE_SCROLL_RESET_PULSE[\s\S]*?await nextTick\(\)[\s\S]*?questionPageScrollTop\.value = 0[\s\S]*?watch\(activeQuestionIndex, resetActiveQuestionPageScroll, \{ flush: 'sync' \}\)/,
  'a question switch must reset the page scroll before the horizontal step is patched'
)
assert.doesNotMatch(
  source,
  /<scroll-view\s*\n\s*v-if="question && shouldRenderQuestionContent|getQuestionScrollTop|getQuestionScrollViewKey/,
  'the page must not rely on a per-question nested scroll container or stale inner scroll state'
)

console.log('question-package scroll reset contract passed')
