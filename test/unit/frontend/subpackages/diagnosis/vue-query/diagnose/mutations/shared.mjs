import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(
  'src/subpackages/diagnosis/vue-query/diagnose/mutations/shared.js',
  'utf8'
)
  .replace(/import\s+\{[\s\S]*?\}\s+from\s+'@\/utils\/care-behavior-timeline\.js'\s*\n/, '')
  .replaceAll('export function ', 'function ')

const { buildDiagnosisAnswerMutationPayload } = new Function(
  'extractCareBehaviorSidecar',
  'hasMeaningfulCareBehaviorTimeline',
  'normalizeCareBehaviorTimeline',
  `${source}\nreturn { buildDiagnosisAnswerMutationPayload }`
)(
  () => null,
  () => false,
  value => value
)

const questionKey = 'q_wilting_droop__air_environment'
const input = {
  airExchange: {
    source: 'fresh_air',
    windowDirectionCount: null,
    windowOpenFrequency: null
  },
  canopyOpenness: 'open',
  deviceAirflow: {
    mode: 'direct',
    sources: ['fresh_air'],
    directSources: ['fresh_air'],
    sourceModes: { fresh_air: 'direct' }
  }
}
const snapshot = {
  input,
  source: 'temporary',
  profileUpdatedAt: '',
  locationBinding: { careLocationId: '', locationKey: '' }
}

const payload = buildDiagnosisAnswerMutationPayload({
  diagnosisSessionId: 'diag_air_mutation',
  roundId: 'round_1',
  answers: [{ questionKey, optionKey: 'air_environment_recorded' }],
  airEnvironmentByQuestionId: { [questionKey]: input },
  airEnvironmentSnapshotsByQuestionId: { [questionKey]: snapshot }
})

assert.deepEqual(payload.airEnvironmentByQuestionId, { [questionKey]: input })
assert.deepEqual(payload.airEnvironmentSnapshotsByQuestionId, { [questionKey]: snapshot })
