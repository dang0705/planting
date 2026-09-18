import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { formatDiagnosisResponse } = require('../../../../../cloudfunctions/diagnose-http/domain/result-formatter.js')

const repeatedAdvice = '先保持当前养护稳定，避免在证据不足时做大幅调整。'
const response = formatDiagnosisResponse({
  sessionId: 'diag_result_formatter_uncertain_dedup',
  stage: 'final',
  lowConfidence: {
    isLowConfidence: true,
    reasons: ['visual_confidence_low'],
    advice: [
      '当前证据仍不够稳定，建议补查叶背、根部、盆土状态，必要时重新开始诊断。',
      repeatedAdvice
    ]
  },
  questionRequired: false,
  stopDecision: {
    outcomeLocked: 'uncertain',
    stopReason: 'route_conservative_uncertain',
    stopReasonDetail: 'route_conservative_no_routes',
    uncertainLegalityReason: 'route_conservative'
  }
})

assert.equal(response.outcomeType, 'uncertain')
assert.deepEqual(response.nextSteps.map(item => item.text), [
  '当前证据仍不够稳定，建议补查叶背、根部、盆土状态，必要时重新开始诊断。',
  repeatedAdvice
])

const outOfPoolResponse = formatDiagnosisResponse({
  sessionId: 'diag_out_of_pool_user_copy',
  stage: 'final',
  lowConfidence: {
    isLowConfidence: true,
    reasons: ['out_of_pool_no_mapping'],
    outOfPoolObservation: {
      observationText: '内部模型观察文本，不应直接面向用户显示'
    }
  },
  questionRequired: false,
  stopDecision: {
    outcomeLocked: 'uncertain',
    stopReason: 'uncertain_output_ready',
    uncertainLegalityReason: 'out_of_pool_no_mapping'
  }
})
assert.match(outOfPoolResponse.finalResult.summary, /暂时无法判断具体原因/)
assert.doesNotMatch(JSON.stringify(outOfPoolResponse), /内部模型观察文本|模型原始观察|outOfPoolObservation/)
