import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import Module from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '../..')
const originalResolveFilename = Module._resolveFilename

Module._resolveFilename = function resolveLocalLayerPath(request, parent, isMain, options) {
  if (typeof request === 'string' && request.startsWith('/opt/utils/')) {
    const localLayerModule = path.join(
      projectRoot,
      'cloudfunctions/layer/utils',
      `${request.slice('/opt/utils/'.length)}.js`
    )
    return originalResolveFilename.call(this, localLayerModule, parent, isMain, options)
  }
  if (request === '/opt/configs') {
    return originalResolveFilename.call(
      this,
      path.join(projectRoot, 'cloudfunctions/layer/configs/index.js'),
      parent,
      isMain,
      options
    )
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const {
  buildSyntheticFollowUpOptionMappings
} = require('../../cloudfunctions/diagnose-http/utils/synthetic-follow-up')

const RUNTIME_SYNTHETIC_EFFECT_CASES = [
  {
    symptomKey: 'leaf_yellowing',
    symptomCn: '叶片发黄',
    locationKey: 'leaf',
    dimensions: [
      'yellowing_primary_clue_gate',
      'yellowing_care_area_gate',
      'yellowing_disease_trace_gate',
      'pest_trace_type',
      'yellowing_leaf_age_pattern',
      'yellowing_distribution_pattern',
      'watering_frequency_context',
      'light_change_context',
      'fertilization_growth_context',
      'yellowing_progression_speed'
    ]
  },
  {
    symptomKey: 'holes_in_leaf',
    symptomCn: '叶片有孔洞',
    locationKey: 'leaf',
    patternKey: 'structural_damage',
    dimensions: ['structural_cause']
  },
  {
    symptomKey: 'chewed_edges',
    symptomCn: '叶片边缘有缺口',
    locationKey: 'leaf',
    patternKey: 'structural_damage',
    dimensions: ['structural_cause']
  },
  {
    symptomKey: 'skeletonized_leaves',
    symptomCn: '叶片被啃成网状',
    locationKey: 'leaf',
    patternKey: 'structural_damage',
    dimensions: ['structural_cause']
  },
  {
    symptomKey: 'yellow_speckling',
    symptomCn: '叶片有密集黄点',
    locationKey: 'leaf',
    patternKey: 'speckling',
    dimensions: ['pest_trace_type', 'surface_stickiness']
  },
  {
    symptomKey: 'stippling',
    symptomCn: '叶片有细密失绿点',
    locationKey: 'leaf',
    patternKey: 'speckling',
    dimensions: ['pest_trace_type', 'surface_stickiness']
  },
  {
    symptomKey: 'silver_streaks',
    symptomCn: '叶片有银白擦伤状痕迹',
    locationKey: 'leaf',
    patternKey: 'streaking',
    dimensions: ['pest_trace_type']
  },
  {
    symptomKey: 'fine_webbing',
    symptomCn: '叶片有细网',
    locationKey: 'leaf',
    patternKey: 'webbing',
    dimensions: ['pest_trace_type']
  },
  {
    symptomKey: 'sticky_honeydew',
    symptomCn: '叶片有黏液或蜜露',
    locationKey: 'leaf',
    patternKey: 'sticky_residue',
    dimensions: ['pest_trace_type', 'surface_stickiness']
  },
  {
    symptomKey: 'edema',
    symptomCn: '叶片有水肿样突起',
    locationKey: 'leaf',
    patternKey: 'bump',
    dimensions: ['edema_bump_stage']
  },
  {
    symptomKey: 'blister_like_bumps',
    symptomCn: '叶片有鼓包',
    locationKey: 'leaf',
    patternKey: 'bump',
    dimensions: ['edema_bump_stage']
  },
  {
    symptomKey: 'powder_white',
    symptomCn: '叶片有白色粉层',
    locationKey: 'leaf',
    patternKey: 'powder',
    dimensions: ['powder_pattern']
  },
  {
    symptomKey: 'black_spots_spreading',
    symptomCn: '叶片黑斑扩散',
    locationKey: 'leaf',
    patternKey: 'spot',
    dimensions: ['lesion_halo', 'lesion_water_soaking']
  },
  {
    symptomKey: 'brown_spots_halo',
    symptomCn: '叶片褐斑带黄晕',
    locationKey: 'leaf',
    patternKey: 'spot',
    dimensions: ['lesion_halo', 'lesion_water_soaking']
  },
  {
    symptomKey: 'tunnels_in_leaf',
    symptomCn: '叶片有线状潜道',
    locationKey: 'leaf',
    patternKey: 'tunnel',
    dimensions: ['leaf_tunnel_pattern']
  }
]

function buildObservedProbeQuestionKey(symptomKey, targetDimension) {
  return `q_observed_probe__${symptomKey}__${targetDimension}`
}

function hasResolvedRuntimeEffect(mapping = {}) {
  const directEffects = Array.isArray(mapping.directProblemAdjustments)
    ? mapping.directProblemAdjustments
    : []
  if (directEffects.some(item => {
    const problemKey = String(item?.problemKey || '').trim()
    const scoreDelta = Number(item?.scoreDelta || 0)
    return problemKey && Number.isFinite(scoreDelta) && scoreDelta !== 0
  })) {
    return true
  }

  const symptomKey = String(mapping.mapsToSymptomKey || '').trim()
  const value = Number(mapping.value || 0)
  const strength = Number(mapping.associationStrength || 0)
  return Boolean(symptomKey && (value !== 0 || strength > 0))
}

function isExplicitNeutralOption(mapping = {}) {
  const optionKey = String(mapping.optionKey || '').trim()
  return optionKey === 'unknown'
}

function main() {
  const symptomDictionary = RUNTIME_SYNTHETIC_EFFECT_CASES.map(item => ({
    symptomKey: item.symptomKey,
    symptomCn: item.symptomCn,
    locationKey: item.locationKey,
    patternKey: item.patternKey || ''
  }))
  const questionKeys = RUNTIME_SYNTHETIC_EFFECT_CASES.flatMap(item =>
    item.dimensions.map(dimension => buildObservedProbeQuestionKey(item.symptomKey, dimension))
  )
  const optionMappings = buildSyntheticFollowUpOptionMappings(questionKeys, symptomDictionary)
  const missingEffects = optionMappings.filter(item =>
    !isExplicitNeutralOption(item) && !hasResolvedRuntimeEffect(item)
  )

  assert.deepEqual(
    missingEffects.map(item => `${item.questionKey}::${item.optionKey}`),
    [],
    'runtime synthetic follow-up options must either have an effective symptom mapping/direct problem adjustment or be explicit unknown'
  )

  console.log(JSON.stringify({
    ok: true,
    checkedQuestionCount: questionKeys.length,
    checkedOptionCount: optionMappings.length
  }))
}

main()
