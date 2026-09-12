import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const runnerPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/diagnosis-start-runner.js')
const dependencyStubs = new Map([
  [
    require.resolve('../../../../../cloudfunctions/diagnose-http/mappers/diagnosis-rule-adapter.js'),
    { adaptObservedSymptoms: items => items }
  ],
  [
    require.resolve('../../../../../cloudfunctions/diagnose-http/services/session-service.js'),
    { buildSessionId: () => 'diag_anonymous_start' }
  ],
  [
    require.resolve('../../../../../cloudfunctions/diagnose-http/utils/visual-batch-id.js'),
    {
      resolveLatestVisualCallBatchId: (response, plantContext) =>
        response?.latestVisualCallBatchId || plantContext?.latestVisualCallBatchId || ''
    }
  ]
])
const originalModules = new Map()
const captured = {
  diagnosisRounds: [],
  persistenceCalls: [],
  pestRouteCalls: [],
  plantRepositoryQueries: 0,
  visualExtractions: []
}
let visualAggregateResult = null

for (const [modulePath, exports] of dependencyStubs) {
  originalModules.set(modulePath, require.cache[modulePath])
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports
  }
}

const diagnosisEnginePath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-engine.js')
const requestNormalizersPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/request-normalizers.js')
const visualRuntimePath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/visual-runtime.js')
const pestOrchestratorPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/pest-visual-orchestrator.js')

for (const modulePath of [
  diagnosisEnginePath,
  requestNormalizersPath,
  visualRuntimePath,
  pestOrchestratorPath
]) {
  originalModules.set(modulePath, require.cache[modulePath])
}

require.cache[diagnosisEnginePath] = {
  id: diagnosisEnginePath,
  filename: diagnosisEnginePath,
  loaded: true,
  exports: {
    runDiagnosisRound: async options => {
      captured.diagnosisRounds.push(options)
      if (!options.lockedPlantContext) {
        captured.plantRepositoryQueries += 1
        if (options.plantId === 'missing_catalog') {
          throw new Error('植物不存在或无权限访问')
        }
      }
      return {
        diagnosisSessionId: options.sessionId,
        roundId: 'round_1',
        questionRequired: true,
        questions: [],
        plantContext: options.lockedPlantContext || {
          userPlantId: options.userPlantId,
          plantId: options.plantId,
          identityResolutionStatus: 'matched'
        }
      }
    }
  }
}
require.cache[requestNormalizersPath] = {
  id: requestNormalizersPath,
  filename: requestNormalizersPath,
  loaded: true,
  exports: {
    resolveRequestClientContext: payload => ({
      ...(payload?.clientContext || {}),
      entrySource: payload?.clientContext?.entrySource || payload?.entrySource || '',
      diagnosisProfile:
        payload?.clientContext?.diagnosisProfile || payload?.diagnosisProfile || 'full'
    }),
    resolveVisualImageInputs: payload => (Array.isArray(payload?.images) ? payload.images : [])
  }
}
require.cache[visualRuntimePath] = {
  id: visualRuntimePath,
  filename: visualRuntimePath,
  loaded: true,
  exports: {
    emitStartVisualEvent: () => {},
    extractVisualSymptomsSafely: async options => {
      captured.visualExtractions.push(options)
      return {
        diagnosisText: 'visual result',
        observedSymptoms: [{ symptomKey: 'leaf_spot' }],
        visualCallBatchId: 'visbatch_anonymous',
        visualBatchTrace: null,
        aggregateResult: visualAggregateResult
      }
    },
    persistRoundResult: async options => {
      captured.persistenceCalls.push(options)
    }
  }
}
require.cache[pestOrchestratorPath] = {
  id: pestOrchestratorPath,
  filename: pestOrchestratorPath,
  loaded: true,
  exports: {
    buildPestRouteResponse: async options => {
      captured.pestRouteCalls.push(options)
      if (!visualAggregateResult) {
        return null
      }
      return {
        diagnosisSessionId: options.sessionId,
        roundId: 'round_1',
        routePrimaryAction: 'request_followup_capture',
        sessionStatus: 'awaiting_retake',
        outcomeType: 'uncertain',
        questionRequired: false,
        retakeRequest: { requestedCaptureRegion: 'leaf_lower_surface' },
        plantContext: options.plantContext
      }
    }
  }
}

delete require.cache[runnerPath]

try {
  const { runStartDiagnosis } = require(runnerPath)
  const anonymousResult = await runStartDiagnosis({
    payload: {
      clientContext: { entrySource: 'diagnose_tab', diagnosisProfile: 'full' },
      images: [{ imageRef: 'cloud://anonymous-leaf', inputSlotType: 'leaf' }]
    },
    openid: 'openid_anonymous'
  })

  assert.equal(captured.diagnosisRounds.length, 1)
  assert.equal(captured.plantRepositoryQueries, 0)
  assert.equal(captured.diagnosisRounds[0].plantId, null)
  assert.equal(captured.diagnosisRounds[0].userPlantId, null)
  assert.deepEqual(captured.diagnosisRounds[0].lockedPlantContext, {
    userPlantId: null,
    plantId: null,
    plantDisplayName: '未知植物',
    plantIdentityId: '',
    identityResolutionStatus: 'unresolved',
    latestVisualCallBatchId: '',
    genus: '',
    family: '',
    category: '',
    watering: null,
    fertilization: null,
    sunning: null,
    ventilation: null,
    temperatureMin: null,
    temperatureMax: null,
    humidityMin: null,
    humidityMax: null,
    careAuditStatus: '',
    varianceLevel: ''
  })
  assert.equal(captured.visualExtractions[0].llmOptions.plantContext.plantId, null)
  assert.equal(captured.persistenceCalls.length, 1)
  assert.equal(captured.persistenceCalls[0].plantContext.identityResolutionStatus, 'unresolved')
  assert.equal(captured.persistenceCalls[0].plantContext.plantId, null)
  assert.equal(anonymousResult.plantId, '')
  assert.equal(anonymousResult.plantCatalogId, null)
  assert.equal(anonymousResult.response.plantContext.plantId, null)

  visualAggregateResult = {
    visual_call_batch_id: 'visbatch_anonymous',
    diagnosis_mode_route_result: { nextAction: 'request_followup_capture' }
  }
  const diagnosisRoundCountBeforeRetakeRoute = captured.diagnosisRounds.length
  const anonymousRetakeResult = await runStartDiagnosis({
    payload: {
      clientContext: { entrySource: 'diagnose_tab', diagnosisProfile: 'pest' },
      images: [{ imageRef: 'cloud://anonymous-leaf-back', inputSlotType: 'leaf' }]
    },
    openid: 'openid_anonymous'
  })
  assert.equal(captured.diagnosisRounds.length, diagnosisRoundCountBeforeRetakeRoute)
  assert.equal(captured.plantRepositoryQueries, 0)
  assert.equal(captured.pestRouteCalls.length, 1)
  assert.equal(captured.pestRouteCalls[0].plantContext.identityResolutionStatus, 'unresolved')
  assert.equal(captured.pestRouteCalls[0].plantContext.plantId, null)
  assert.equal(
    captured.pestRouteCalls[0].plantContext.latestVisualCallBatchId,
    'visbatch_anonymous'
  )
  assert.equal(captured.persistenceCalls.at(-1).response.sessionStatus, 'awaiting_retake')
  assert.equal(captured.persistenceCalls.at(-1).plantContext.plantId, null)
  assert.equal(anonymousRetakeResult.plantCatalogId, null)
  assert.equal(
    anonymousRetakeResult.response.retakeRequest.requestedCaptureRegion,
    'leaf_lower_surface'
  )

  visualAggregateResult = null

  const diagnosisRoundCountBeforeMissingPlant = captured.diagnosisRounds.length
  await assert.rejects(
    () =>
      runStartDiagnosis({
        payload: { clientContext: { entrySource: 'plant_card' } },
        openid: 'openid_owner'
      }),
    error => error?.statusCode === 400 && /缺少 userPlantId 或 plantCatalogId/.test(error.message)
  )
  assert.equal(captured.diagnosisRounds.length, diagnosisRoundCountBeforeMissingPlant)

  const persistenceCountBeforeWrongPlant = captured.persistenceCalls.length
  await assert.rejects(
    () =>
      runStartDiagnosis({
        payload: {
          clientContext: { entrySource: 'plant_card' },
          plantCatalogId: 'missing_catalog',
          observedSymptoms: [{ symptomKey: 'leaf_spot' }]
        },
        openid: 'openid_owner'
      }),
    /植物不存在或无权限访问/
  )
  assert.equal(captured.plantRepositoryQueries, 1)
  assert.equal(captured.persistenceCalls.length, persistenceCountBeforeWrongPlant)

  console.log('diagnosis start runner tests passed')
} finally {
  delete require.cache[runnerPath]
  for (const [modulePath, originalModule] of originalModules) {
    if (originalModule) {
      require.cache[modulePath] = originalModule
    } else {
      delete require.cache[modulePath]
    }
  }
}
