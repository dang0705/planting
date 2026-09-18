import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { resolveSpecificPestAnswerResult } = require(
  '../../../../../cloudfunctions/diagnose-http/app/specific-pest-answer-resolver.js'
)
const { buildNonPestDirectResult } = require(
  '../../../../../cloudfunctions/diagnose-http/app/non-pest-direct-result.js'
)

const profile = {
  actionProfileKey: 'action_spider_mite_guidance',
  actionItems: [
    {
      id: 'act_test_kill_mite_01',
      categoryId: 'pest_kill_treatment',
      stage: 'today',
      methodId: 'foliar_spray',
      text: '确认红蜘蛛后按标签进行杀虫/杀螨处理。',
      sourceRefIds: ['umn-spider-mites']
    },
    {
      id: 'act_test_safety_01',
      categoryId: 'treatment_safety',
      stage: 'avoid',
      methodId: 'avoid_mixing_products',
      text: '不要混用药剂。',
      sourceRefIds: ['umn-spider-mites']
    }
  ]
}

const pestResult = resolveSpecificPestAnswerResult({
  sessionId: 'diag_test',
  questionPackage: {
    candidateModes: ['spider_mite'],
    hiddenPrefilledEvidence: [],
    packageQuestions: []
  },
  actionProfilesByMode: new Map([['spider_mite', profile]])
})
assert.equal(pestResult.visibleOutcomes[0].actionProfileKey, 'action_spider_mite_guidance')
assert.equal(pestResult.visibleOutcomes[0].actionItems[0].categoryId, 'pest_kill_treatment')
assert.equal(pestResult.visibleOutcomes[0].actionItems[0].categoryNameCn, '杀虫/杀螨处理')
assert.equal(pestResult.visibleOutcomes[0].avoidActionItems[0].categoryId, 'treatment_safety')

const diseaseProfile = {
  actionProfileKey: 'action_powdery_mildew_guidance',
  actionItems: [
    {
      id: 'act_test_kill_disease_01',
      categoryId: 'disease_kill_treatment',
      stage: 'today',
      methodId: 'foliar_spray',
      text: '确认白粉病后按标签进行杀菌处理。',
      sourceRefIds: ['ucipm-powdery-mildew']
    }
  ]
}
const diseaseResult = buildNonPestDirectResult({
  modeKeys: ['powdery_mildew'],
  routeResult: { normalizedModeCandidates: [{ modeKey: 'powdery_mildew', confidence: 0.99 }] },
  actionProfilesByMode: new Map([['powdery_mildew', diseaseProfile]])
})
assert.equal(diseaseResult.visibleOutcomes[0].actionItems[0].categoryNameCn, '杀菌处理')

console.log('direct action guidance tests passed')
