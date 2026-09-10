/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  buildFrontendAnswerResponse,
  buildFrontendDiagnosisResponse
} = require('../../../../../cloudfunctions/diagnose-http/app/frontend-response.js')

const unsafeRuntimePayload = {
  diagnosisSessionId: 'diagnosis_public_1',
  resultId: 'result_public_1',
  stage: 'final',
  status: 'closed',
  routePrimaryAction: 'direct_result',
  outcomeType: 'problematic',
  routeDecisionCause: { decisionCauseText: '内部决策原因' },
  confidenceLevel: 'high',
  confidenceReasons: ['内部置信度说明'],
  needHumanReview: true,
  candidateModes: ['fungal_leaf_spot_mode'],
  provisionalModes: ['candidate_only'],
  blockedActionExplanations: ['内部动作冲突'],
  outputEligibility: { eligible: 1, judgment: 'internal' },
  diagnosticTrace: [{ eventType: 'raw_model_reply', detail: '不应公开' }],
  coreProcess: { decision: { diagnosticTrace: [{ eventType: 'raw_model_reply' }] } },
  aiDebug: [{ formattedPrompt: '内部提示词', rawTextOutput: '原始模型输出' }],
  visualBatchTrace: {
    currentVisualCallBatchId: 'batch_current',
    originVisualCallBatchId: 'batch_origin',
    supersedeApplied: 1,
    supersedeReason: 'internal_reason'
  },
  visualAggregateSummary: {
    suggestedFollowupCapture: ['补拍叶背细节'],
    aggregateQualityGrade: 'low',
    routePrimaryAction: 'internal_route'
  },
  finalResult: {
    resultId: 'result_public_1',
    problemKey: 'leaf_spot',
    displayName: '叶片斑点',
    summary: '建议先隔离观察。',
    confidenceLevel: 'high',
    visibleOutcomes: [
      {
        outcomeKey: 'iron_deficiency',
        displayNameCn: '缺铁/新叶脉间黄化',
        actionProfileKey: 'action_nutrient_support_basic',
        actionAdviceItems: ['先核对补肥情况'],
        avoidAdviceItems: ['不要一次性重肥猛补']
      }
    ]
  },
  visibleOutcomes: [
    {
      outcomeKey: 'nitrogen_deficiency',
      displayNameCn: '缺氮/长期营养不足',
      action_profile_key: 'action_nutrient_support_basic',
      actionAdviceItems: ['从低浓度少量补肥开始'],
      avoidAdviceItems: ['不要一次性重肥猛补']
    }
  ]
}

const diagnosisResponse = buildFrontendDiagnosisResponse(unsafeRuntimePayload)
const answerResponse = buildFrontendAnswerResponse(unsafeRuntimePayload)

for (const response of [diagnosisResponse, answerResponse]) {
  for (const field of [
    'routeDecisionCause',
    'confidenceLevel',
    'confidenceReasons',
    'needHumanReview',
    'candidateModes',
    'provisionalModes',
    'blockedActionExplanations',
    'outputEligibility',
    'diagnosticTrace',
    'coreProcess',
    'aiDebug'
  ]) {
    assert.equal(response[field], undefined, `公开响应不得包含 ${field}`)
  }
}

assert.equal(diagnosisResponse.finalResult.confidenceLevel, undefined)
assert.equal(
  diagnosisResponse.visibleOutcomes[0].actionProfileKey,
  'action_nutrient_support_basic'
)
assert.equal(
  answerResponse.visibleOutcomes[0].actionProfileKey,
  'action_nutrient_support_basic'
)
assert.deepEqual(diagnosisResponse.visualAggregateSummary, {
  suggestedAdditionalImageCapture: ['补拍叶背细节']
})
assert.deepEqual(diagnosisResponse.visualBatchTrace, {
  currentVisualCallBatchId: 'batch_current',
  originVisualCallBatchId: 'batch_origin',
  supersedeTargetBatchId: null,
  supersededByBatchId: null,
  supersedeApplied: 1
})

console.log('diagnosis frontend public response boundary passed data_mode=unit_fake')
