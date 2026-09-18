import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import Module from 'node:module'

// data_mode=unit_fake; test_kind=runtime_contract
const require = createRequire(import.meta.url)
const originalLoad = Module._load
const sqlCalls = []
const expectedInsertCount = 6
const rawRecordIndex = 1
const normalizedRecordIndex = 2
const identityRecordIndex = 4
const noValue = 0
const hasValue = 1
const matchedScore = 3.5

Module._load = function loadWithCloudbaseStub(request, parent, isMain) {
  if (request === './cloudbase') {
    return {
      models: {
        $runSQL: async (sql, params) => {
          sqlCalls.push({ sql, params })
        }
      }
    }
  }
  return originalLoad.call(this, request, parent, isMain)
}

const {
  persistIdentifyRuntimeArtifacts
} = require('../../../../../cloudfunctions/layer/utils/identify-runtime.js')

const baseInput = {
  sessionId: 'identify-runtime-null-contract',
  openid: 'openid-identify-runtime-null-contract',
  imageUrl: 'https://example.test/plant.jpg',
  provider: 'baidu',
  recognizedName: '吊兰',
  recognizedType: 'plant',
  confidence: 0.92,
  rawPayload: { result: [{ name: '吊兰', score: 0.92 }] },
  candidateMatches: [],
  primaryCandidate: null,
  taxonomyMatchStatus: 'unresolved',
  identityResolutionStatus: 'unresolved',
  inputSlotType: 'unknown'
}

await persistIdentifyRuntimeArtifacts(baseInput)

assert.equal(sqlCalls.length, expectedInsertCount)
const rawRecordCall = sqlCalls[rawRecordIndex]
assert.doesNotMatch(rawRecordCall.sql, /\{\{userDeclaredOrganConfidence\}\}/)
assert.doesNotMatch(rawRecordCall.sql, /\{\{promptVersion\}\}/)
assert.doesNotMatch(rawRecordCall.sql, /\{\{latencyMs\}\}/)
assert.doesNotMatch(rawRecordCall.sql, /\{\{errorCode\}\}/)
assert.match(rawRecordCall.sql, /NULL, \{\{sourceModelProvider\}\}/)
assert.match(rawRecordCall.sql, /\{\{callStatus\}\}, NULL, NULL, CURRENT_TIMESTAMP/)

const normalizedRecordCall = sqlCalls[normalizedRecordIndex]
assert.doesNotMatch(normalizedRecordCall.sql, /\{\{userDeclaredOrganConfidence\}\}/)
assert.doesNotMatch(normalizedRecordCall.sql, /\{\{primaryOrganConfidence\}\}/)
assert.doesNotMatch(normalizedRecordCall.sql, /\{\{top1StabilityScore\}\}/)
assert.doesNotMatch(normalizedRecordCall.sql, /\{\{top3StabilityScore\}\}/)

const unresolvedIdentityCall = sqlCalls[identityRecordIndex]
assert.match(
  unresolvedIdentityCall.sql,
  /CASE\s+WHEN \{\{matchScoreHasValue\}\} = 1 THEN \{\{matchScoreValue\}\}\s+ELSE NULL\s+END/
)
assert.equal(unresolvedIdentityCall.params.matchScoreHasValue, noValue)
assert.equal(unresolvedIdentityCall.params.matchScoreValue, noValue)

sqlCalls.length = 0
await persistIdentifyRuntimeArtifacts({
  ...baseInput,
  sessionId: 'identify-runtime-number-contract',
  primaryCandidate: {
    canonicalName: '吊兰',
    plantIdentityId: 'plant-1',
    matchAlias: '吊兰',
    matchType: 'alias_exact',
    matchScore: matchedScore
  },
  taxonomyMatchStatus: 'matched',
  identityResolutionStatus: 'resolved'
})

assert.equal(sqlCalls[identityRecordIndex].params.matchScoreHasValue, hasValue)
assert.equal(sqlCalls[identityRecordIndex].params.matchScoreValue, matchedScore)

Module._load = originalLoad
process.stdout.write('identify runtime nullable SQL tests passed\n')
