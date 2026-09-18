import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

const require = createRequire(import.meta.url)
const originalLoad = Module._load
let rows = []
let latestSql = ''
let sharedSoilVisualLoaded = false
let lookupError = null

Module._load = function loadSoilEvidenceDependencies(request, parent, isMain) {
  if (request === '/opt/utils/cloudbase') {
    return {
      models: {
        $runSQL: async sql => {
          latestSql = String(sql)
          if (lookupError) {
            throw lookupError
          }
          return { data: { executeResultList: rows } }
        }
      },
      getCloudBase: () => ({})
    }
  }
  if (request === '../utils/llm') {
    return { callLLMDiagnose: async () => ({}) }
  }
  if (request === '../utils/watering-soil-prompt') {
    return { buildWateringSoilPromptPayload: () => ({}) }
  }
  if (request === '/opt/utils/watering-soil-visual') {
    sharedSoilVisualLoaded = true
    return { SOIL_EVIDENCE_TTL_MS: 24 * 60 * 60 * 1000 }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const service = require(
  '../../../../../cloudfunctions/diagnose-http/services/watering-soil-visual-service.js'
)
Module._load = originalLoad

assert.equal(sharedSoilVisualLoaded, true)

rows = []
const noReusableImage = await service._test.resolveRecentDiagnosisTarget({
  openid: 'user-1',
  plantId: 7
})
assert.equal(noReusableImage, null)
assert.match(latestSql, /raw\.input_slot_type = 'soil'/u)
assert.match(latestSql, /raw\.file_id IS NOT NULL/u)
assert.match(latestSql, /INTERVAL 24 HOUR/u)
assert.match(latestSql, /raw\.session_id COLLATE utf8mb4_unicode_ci/u)
assert.match(latestSql, /raw\._openid COLLATE utf8mb4_unicode_ci/u)
assert.match(latestSql, /normalized\.primary_organ_type = 'soil'/u)
assert.match(latestSql, /normalized\.clarity_level = 'high'/u)
assert.match(latestSql, /normalized\.organ_conflict_flag = 0/u)

lookupError = new Error('simulated reuse lookup failure')
const fallbackToNewPhoto = await service._test.resolveRecentDiagnosisTarget({
  openid: 'user-1',
  plantId: 7
})
assert.equal(fallbackToNewPhoto, null)
lookupError = null

rows = [{ visual_raw_image_record_id: 'raw-1', file_id: 'cloud://soil-1' }]
const reusableImage = await service._test.resolveRecentDiagnosisTarget({
  openid: 'user-1',
  plantId: 7
})
assert.deepEqual(reusableImage, {
  source: 'recent_diagnosis',
  fileId: 'cloud://soil-1',
  plantId: 7,
  diagnosisRawImageRecordId: 'raw-1',
  sourceLabel: '使用最近诊断盆土图'
})

const nonSoil = service._test.parseModelReview(
  '{"accepted":false,"surfaceState":"uncertain","standingWater":"uncertain","visibility":"unusable","confidence":0,"visibleBasisCn":""}'
)
assert.equal(nonSoil.accepted, false)
assert.equal(nonSoil.visibility, 'unusable')
assert.equal(service._test.parseModelReview('not-json'), null)
assert.equal(service._test.toSqlDateTime('2026-09-15T13:00:01.999Z'), '2026-09-15 13:00:01')
assert.throws(() => service._test.toSqlDateTime('not-a-date'), /失效时间无效/u)

const debugAudit = service._test.buildFrontendDebugAudit({
  result: {
    promptAudit: {
      providerId: 'cloudbase',
      modelId: 'qwen3.5-flash',
      promptText: '固定前缀\n请只判断盆土。',
      imageInputTransport: 'url'
    },
    usage: { inputTokens: 120, outputTokens: 24, totalTokens: 144 },
    text: '{"accepted":true}'
  },
  parsed: { accepted: true, surfaceState: 'moist' },
  review: {
    surfaceState: 'moist',
    standingWater: 'no',
    confidence: 0.88,
    visibleBasisCn: '土表颜色较深。'
  }
})
assert.deepEqual(debugAudit, {
  providerId: 'cloudbase',
  modelId: 'qwen3.5-flash',
  promptText: '固定前缀\n请只判断盆土。',
  tokenUsage: { inputTokens: 120, outputTokens: 24, totalTokens: 144 },
  imageInputTransport: 'url',
  modelReturnText: '{"accepted":true}',
  parsedReview: { accepted: true, surfaceState: 'moist' },
  finalReview: {
    surfaceState: 'moist',
    standingWater: 'no',
    confidence: 0.88,
    visibleBasisCn: '土表颜色较深。',
    needsManualConfirmation: true
  }
})

console.log('watering soil diagnosis reuse tests passed')
