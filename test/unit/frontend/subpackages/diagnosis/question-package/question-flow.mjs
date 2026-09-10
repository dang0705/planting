import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot } from '../../../../../e2e/batch/workflow/dispatch-gate-contract/helpers.mjs'

const source = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/question-package/question-flow.js'),
  'utf8'
)
const questionPageSource = fs.readFileSync(
  path.join(repoRoot, 'src/subpackages/diagnosis/question-package.vue'),
  'utf8'
)
const timelineComponentSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/CareBehaviorTimeline.vue'),
  'utf8'
)
const timelineComposableSource = fs.readFileSync(
  path.join(repoRoot, 'src/components/care-behavior-timeline/useCareBehaviorTimeline.js'),
  'utf8'
)
assert.match(source, /const submitQuestionAnswersAction = createAsyncActionGuard\(\)/)
assert.match(source, /return submitQuestionAnswersAction\.run\(/)
assert.match(source, /isSubmittingQuestionAnswer\.value = true/)
assert.match(source, /finally \{\s*isSubmittingQuestionAnswer\.value = false/)
assert.match(
  source,
  /import \{ useQuestionAirEnvironment \} from '\.\/question-air-environment\.js'/
)
assert.match(
  source,
  /if \(airEnvironment\.isAirEnvironmentQuestion\(question\)\) \{\s*return airEnvironment\.isAnswered\(/s
)
assert.match(source, /const careBehaviorTimelineResetVersionByQuestionId = ref\(\{\}\)/)
assert.match(source, /function bumpCareBehaviorTimelineResetVersion\(questionId = ''\)/)
assert.match(source, /function getCareBehaviorTimelineResetKey\(question = \{\}\)/)
assert.match(
  source,
  /if \(isUnclearAnswer\) \{\s*suppressTimelineAnswerSync\(normalizedQuestionId, true\)\s*bumpCareBehaviorTimelineResetVersion\(normalizedQuestionId\)/s
)
assert.match(
  source,
  /careBehaviorTimelineByQuestionId\.value = \{\s*\.\.\.careBehaviorTimelineByQuestionId\.value,\s*\[normalizedQuestionId\]: \{\}\s*\}/
)
assert.match(
  source,
  /isTimelineAnswerSyncSuppressed\(questionId\) &&\s*isCareBehaviorTimelineUnclearAnswer\(/s
)
assert.match(source, /function handleCareBehaviorTimelineDateSelect\(question\)/)
assert.match(
  source,
  /handleCareBehaviorTimelineDateSelect[\s\S]*suppressTimelineAnswerSync\(questionId, false\)[\s\S]*setQuestionAnswer\(questionId, ''\)/s
)
assert.match(
  source,
  /function handleCareBehaviorTimelineChange\(question, timeline = null\)[\s\S]*getQuestionId\(currentQuestion\.value\) !== questionId[\s\S]*return/s,
  '相邻隐藏题重新计算时不得用空 payload 覆盖当前题已填写的日历缓存'
)
assert.doesNotMatch(questionPageSource, /shouldShowCareBehaviorTimeline/)
assert.match(
  questionPageSource,
  /<ButtonStepTrack[\s\S]*?v-if="!isCareBehaviorWateringTimelineQuestion\(currentQuestion\)"[\s\S]*?<\/ButtonStepTrack>[\s\S]*?<CareBehaviorTimeline[\s\S]*?:question="currentQuestion"/s
)
assert.match(questionPageSource, /currentQuestion,\s*questionProgressText/)
assert.match(questionPageSource, /:reset-key="getCareBehaviorTimelineResetKey\(currentQuestion\)"/)
assert.match(
  questionPageSource,
  /@select-date="handleCareBehaviorTimelineDateSelect\(currentQuestion\)"/
)
assert.match(timelineComponentSource, /resetKey: \{ type: \[Number, String\], default: 0 \}/)
assert.match(timelineComponentSource, /defineEmits\(\['change', 'select-date'\]\)/)
assert.match(timelineComposableSource, /function resetInteractiveTimelineState\(\)/)
assert.match(timelineComposableSource, /wateringDoseByDate\.value = \{\}/)
assert.match(timelineComposableSource, /emit\('select-date', item\)/)
const timelineInitializeWatchIndex = timelineComposableSource.indexOf(
  'watch(() => [props.timeline, props.question], initializeTimelineFromProps'
)
const timelineEmitWatchIndex = timelineComposableSource.indexOf(
  'watch(timelinePayload, emitTimelineChange, { deep: true, immediate: true })'
)
assert.ok(
  timelineInitializeWatchIndex >= 0 && timelineInitializeWatchIndex < timelineEmitWatchIndex,
  '时间线重新挂载时必须先恢复父级已保存的日期，再发出 change，不能用空状态覆盖日历数据'
)
assert.match(
  timelineComposableSource,
  /dateStates\.value = nextStates[\s\S]*?syncBucketSelection\(nextStates\)[\s\S]*?emitTimelineChange\(\)/
)

console.log(
  'question flow interaction guard contracts passed data_mode=unit_fake test_kind=source_contract'
)
