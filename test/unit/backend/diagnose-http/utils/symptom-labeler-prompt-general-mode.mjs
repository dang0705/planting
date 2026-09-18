import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

// data_mode=unit_fake：这里用最小词典验证动态尾部的模式/器官矩阵，不替代真实模型验收。
const require = createRequire(import.meta.url)
const symptomRepositoryPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/repositories/symptom-repository.js')
const promptPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js')
const originalSymptomRepository = require.cache[symptomRepositoryPath]
const originalPromptModule = require.cache[promptPath]

const symptomDictionary = [
  { symptomKey: 'leaf_test_symptom', locationKey: 'leaf' },
  { symptomKey: 'stem_test_symptom', locationKey: 'stem' },
  { symptomKey: 'flower_test_symptom', locationKey: 'flower' },
  { symptomKey: 'soil_test_symptom', locationKey: 'soil' },
  { symptomKey: 'root_test_symptom', locationKey: 'root' },
  { symptomKey: 'plant_test_symptom', locationKey: 'plant' },
  { symptomKey: 'whole_plant_test_symptom', locationKey: 'whole_plant' }
]

function splitPrompt(payload) {
  const marker = '[Dynamic Task]'
  const markerIndex = payload.promptText.indexOf(marker)
  assert.notEqual(markerIndex, -1)
  return {
    staticPrefix: payload.promptText.slice(0, markerIndex).trim(),
    dynamicTail: payload.promptText.slice(markerIndex + marker.length).trim()
  }
}

function parseTask(dynamicTail) {
  const taskLine = dynamicTail.split('\n')[0]
  assert.match(taskLine, /^task=.+。$/)
  return JSON.parse(taskLine.slice('task='.length, -1))
}

require.cache[symptomRepositoryPath] = {
  id: symptomRepositoryPath,
  filename: symptomRepositoryPath,
  loaded: true,
  exports: { getPromptSymptomDictionary: async () => symptomDictionary }
}
delete require.cache[promptPath]

try {
  const {
    buildSymptomLabelerPromptPayload
  } = require('../../../../../cloudfunctions/diagnose-http/utils/symptom-labeler-prompt.js')
  const slots = [
    'leaf',
    'stem',
    'flower',
    'root',
    'root_crown',
    'soil',
    'whole_plant',
    'fruit',
    'other',
    'unknown'
  ]
  const generalMappingSlots = new Set(['leaf', 'stem', 'root_crown', 'whole_plant', 'other'])
  const yellowOrDroopRouteSlots = new Set(['leaf', 'whole_plant', 'other'])
  const allPestEvidenceScopeSlots = new Set(['whole_plant', 'other'])
  let staticPrefix = ''
  let staticPrefixHash = ''

  for (const diagnosisProfile of ['full', 'pest']) {
    for (const inputSlotType of slots) {
      const payload = await buildSymptomLabelerPromptPayload({
        imageContext: {
          diagnosisProfile,
          inputSlotType,
          inputSlotOrder: 4,
          totalImageCount: 6,
          captureRegion: 'unknown'
        }
      })
      const prompt = splitPrompt(payload)
      const task = parseTask(prompt.dynamicTail)

      if (!staticPrefix) {
        staticPrefix = prompt.staticPrefix
        staticPrefixHash = payload.debugMeta.promptCacheStaticPrefixHash
      }
      assert.equal(prompt.staticPrefix, staticPrefix)
      assert.equal(payload.debugMeta.promptCacheStaticPrefixHash, staticPrefixHash)
      assert.deepEqual(task, { profile: diagnosisProfile, image: { slot: inputSlotType } })
      assert.doesNotMatch(
        prompt.dynamicTail,
        /"order"|"total"|"region":"unknown"|"round":"initial"/
      )
      assert.match(
        prompt.dynamicTail,
        /先查【虫害映射】再查黄化\/下垂，可并存。满足虫害映射即填对应 pest mode_candidates\+正式 evidence key；不得被 yellow_leaf\/wilting_droop 替代或漏填。无清晰证据不猜。/
      )

      if (diagnosisProfile === 'pest') {
        assert.doesNotMatch(prompt.dynamicTail, /【通用映射】/)
        assert.doesNotMatch(prompt.dynamicTail, /^full：/m)
        assert.match(prompt.dynamicTail, /^pest：/m)
        if (allPestEvidenceScopeSlots.has(inputSlotType)) {
          assert.match(
            prompt.dynamicTail,
            /allowed_symptom_keys=静态全局词典中的全部虫害可见证据键。/
          )
        } else {
          assert.doesNotMatch(
            prompt.dynamicTail,
            /allowed_symptom_keys=静态全局词典中的全部虫害可见证据键。/
          )
        }
      } else {
        if (generalMappingSlots.has(inputSlotType)) {
          assert.match(prompt.dynamicTail, /【通用映射】/)
        } else {
          assert.doesNotMatch(prompt.dynamicTail, /【通用映射】/)
        }
        if (yellowOrDroopRouteSlots.has(inputSlotType)) {
          assert.match(prompt.dynamicTail, /^full：/m)
        } else {
          assert.doesNotMatch(prompt.dynamicTail, /^full：/m)
        }
      }
    }
  }

  const followupPayload = await buildSymptomLabelerPromptPayload({
    imageContext: {
      diagnosisProfile: 'full',
      analysisRound: 'followup',
      inputSlotType: 'leaf',
      captureRegion: 'leaf_upper_surface',
      requestedCaptureRegion: 'leaf_lower_surface',
      priorAdmittedEvidenceDigest: 'leaf_yellowing',
      unresolvedEvidenceGroups: ['yellowing_extent']
    }
  })
  assert.deepEqual(parseTask(splitPrompt(followupPayload).dynamicTail), {
    profile: 'full',
    round: 'followup',
    image: { slot: 'leaf', region: 'leaf_upper_surface' },
    requested_region: 'leaf_lower_surface',
    prior_evidence: 'leaf_yellowing',
    unresolved: ['yellowing_extent']
  })
} finally {
  if (originalSymptomRepository) {
    require.cache[symptomRepositoryPath] = originalSymptomRepository
  } else {
    delete require.cache[symptomRepositoryPath]
  }
  if (originalPromptModule) {
    require.cache[promptPath] = originalPromptModule
  } else {
    delete require.cache[promptPath]
  }
}

console.log('symptom labeler dynamic prompt matrix tests passed')
