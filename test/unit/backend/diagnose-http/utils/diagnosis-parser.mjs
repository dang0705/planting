import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  parseLLMVisualResult
} = require('../../../../../cloudfunctions/diagnose-http/utils/diagnosis-parser.js')
const {
  evidenceGroupForKey,
  resolveDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/domain/diagnosis-mode-router.js')
const {
  attachDiagnosisModeRoute
} = require('../../../../../cloudfunctions/diagnose-http/services/visual-mode-route-service.js')

const runtimePayload = JSON.stringify({
  normalized_organ: 'leaf',
  image_quality_grade: 'good',
  analyzability: 'high',
  symptom_candidates: ['silver_streaks', 'patchy_browning'],
  out_of_pool_symptom_candidates: ['black_fecal_spots'],
  route_hints: [],
  visual_discriminators: [],
  missing_info_for_path: [],
  suggested_question_capture: [],
  capture_region: 'leaf_upper_surface',
  mode_candidates: [
    { mode: 'thrips', confidence: 0.85, region_ref: 'leaf_upper_surface' },
    { mode: 'spider_mite', confidence: 0.25, region_ref: 'leaf_upper_surface' }
  ],
  region_ref: 'leaf_upper_surface'
})

const parsed = parseLLMVisualResult(runtimePayload, { diagnosisProfile: 'pest' })
assert.deepEqual(
  parsed.symptom_candidates.map(item => item.symptom_key),
  ['silver_streaks', 'patchy_browning', 'black_fecal_spots']
)
for (const candidate of parsed.symptom_candidates) {
  assert.equal(candidate.strength_level, 'medium')
  assert.equal(candidate.confidence_band, 'medium')
  assert.equal(candidate.admission_readiness, 'retain_only')
}
assert.deepEqual(parsed.out_of_pool_symptom_candidates, [
  {
    raw_visual_name_cn: '',
    raw_visual_name_en: 'black_fecal_spots',
    closest_symptom_key_hint: 'black_fecal_spots',
    reason: 'not_in_ai_visual_pool'
  }
])
assert.equal(
  parsed.normalization_notes.includes('provider_string_symptom_candidate_preserved_conservatively'),
  true
)
assert.equal(
  parsed.normalization_notes.includes('locked_pest_evidence_recovered_conservatively'),
  true
)
assert.deepEqual(parsed.mode_candidates, [
  { mode: 'thrips', confidence: 0.85, region_ref: 'leaf_upper_surface' },
  { mode: 'spider_mite', confidence: 0.25, region_ref: 'leaf_upper_surface' }
])

const compactCandidate = parseLLMVisualResult(
  JSON.stringify({
    normalized_organ: 'leaf',
    image_quality_grade: 'good',
    analyzability: 'high',
    capture_region: 'leaf_upper_surface',
    region_ref: 'leaf_upper_surface',
    mode_candidates: [],
    symptom_candidates: [
      {
        symptom_key: 'silver_scarring',
        strength_level: 'strong',
        confidence_band: 'high'
      }
    ],
    out_of_pool_symptom_candidates: [],
    route_hints: []
  }),
  { diagnosisProfile: 'pest' }
).symptom_candidates[0]
assert.deepEqual(compactCandidate, {
  symptom_key: 'silver_scarring',
  display_name_cn: 'silver_scarring',
  strength_level: 'strong',
  confidence_band: 'high',
  visibility_scope: 'organ',
  supporting_region_note: '',
  admission_readiness: 'ready'
})

for (const candidate of [
  { strength_level: 'medium', confidence_band: 'high' },
  { strength_level: 'strong', confidence_band: 'medium' },
  { strength_level: 'strong', confidence_band: 'low' }
]) {
  const normalized = parseLLMVisualResult(
    JSON.stringify({
      symptom_candidates: [
        { symptom_key: 'silver_streaks', admission_readiness: 'ready', ...candidate }
      ]
    }),
    { diagnosisProfile: 'pest' }
  ).symptom_candidates[0]
  assert.equal(normalized.admission_readiness, 'cautious')
}

const legacyCandidate = parseLLMVisualResult(
  JSON.stringify({
    symptom_candidates: [
      {
        symptom_key: 'silver_scarring',
        display_name_cn: '银白擦伤',
        strength_level: 'strong',
        confidence_band: 'high',
        visibility_scope: 'local',
        supporting_region_note: '叶面局部可见',
        admission_readiness: 'ready'
      }
    ]
  })
).symptom_candidates[0]
assert.equal(legacyCandidate.display_name_cn, '银白擦伤')
assert.equal(legacyCandidate.visibility_scope, 'local')
assert.equal(legacyCandidate.supporting_region_note, '叶面局部可见')
assert.equal(legacyCandidate.admission_readiness, 'ready')

const routedAggregate = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: parsed.symptom_candidates.map(item => ({
      ...item,
      primary_support_image_id: 'diag_1784601675332_ciokbxcc'
    })),
    admission_records: parsed.symptom_candidates.map(item => ({
      object_type: 'symptom',
      object_key: item.symptom_key,
      admission_result: 'explanation_retained',
      visual_normalized_image_result_id: `normalized_${item.symptom_key}`,
      candidate: {
        ...item,
        primary_support_image_id: 'diag_1784601675332_ciokbxcc'
      }
    }))
  },
  successfulResults: [
    {
      imageId: 'diag_1784601675332_ciokbxcc',
      normalizedResult: parsed
    }
  ]
})
const conservativeRoute = routedAggregate.diagnosis_mode_route_result
assert.equal(conservativeRoute.nextAction, 'direct_result')
assert.deepEqual(conservativeRoute.directMatches, [])
assert.deepEqual(
  conservativeRoute.confirmationCandidates.map(item => item.modeKey),
  ['thrips']
)
assert.deepEqual(conservativeRoute.confirmationCandidates[0].matchedEvidence, [])
assert.deepEqual(
  conservativeRoute.confirmationCandidates[0].candidateEvidence.map(item => item.evidenceGroup),
  ['silver_scarring', 'black_fecal_spots']
)

const c3ThripsPayload = JSON.stringify({
  normalized_organ: 'leaf',
  image_quality_grade: 'good',
  analyzability: 'high',
  capture_region: 'leaf_upper_surface',
  region_ref: 'leaf_upper_surface',
  symptom_candidates: [
    {
      symptom_key: 'stippling',
      strength_level: 'weak',
      confidence_band: 'medium'
    }
  ],
  mode_candidates: [{ mode: 'thrips', confidence: 0.95, region_ref: 'leaf_upper_surface' }],
  visual_discriminators: [
    {
      dimension_key: 'insect_body_presence',
      value_key: 'present',
      confidence_band: 'high'
    },
    {
      dimension_key: 'insect_body_shape',
      value_key: 'slender',
      confidence_band: 'high'
    },
    {
      dimension_key: 'insect_body_location',
      value_key: 'leaf_upper',
      confidence_band: 'high'
    }
  ]
})
const c3ThripsParsed = parseLLMVisualResult(c3ThripsPayload, { diagnosisProfile: 'pest' })
const c3ThripsVisible = c3ThripsParsed.symptom_candidates.find(
  item => item.symptom_key === 'thrips_visible'
)
assert.deepEqual(c3ThripsVisible, {
  symptom_key: 'thrips_visible',
  display_name_cn: '可见细长虫体',
  strength_level: 'strong',
  confidence_band: 'high',
  visibility_scope: 'local',
  supporting_region_note: '局部区域可见清晰细长虫体。',
  admission_readiness: 'ready'
})

const c3RoutedAggregate = attachDiagnosisModeRoute({
  diagnosisProfile: 'pest',
  aggregateResult: {
    aggregate_analyzability: 'high',
    aggregated_symptom_candidates: c3ThripsParsed.symptom_candidates.map(item => ({
      ...item,
      primary_support_image_id: 'diag_c3_thrips',
      primary_capture_region: 'leaf_upper_surface'
    })),
    admission_records: c3ThripsParsed.symptom_candidates.map(item => ({
      object_type: 'symptom',
      object_key: item.symptom_key,
      admission_result:
        item.admission_readiness === 'ready' ? 'formally_admitted' : 'explanation_retained',
      visual_normalized_image_result_id: `normalized_${item.symptom_key}`,
      candidate: {
        ...item,
        primary_support_image_id: 'diag_c3_thrips',
        primary_capture_region: 'leaf_upper_surface'
      }
    }))
  },
  successfulResults: [
    {
      imageId: 'diag_c3_thrips',
      normalizedResult: c3ThripsParsed
    }
  ]
})
assert.equal(c3RoutedAggregate.route_primary_action, 'direct_result')
assert.deepEqual(
  c3RoutedAggregate.diagnosis_mode_route_result.directMatches.map(item => item.modeKey),
  ['thrips']
)
assert.deepEqual(
  c3RoutedAggregate.diagnosis_mode_route_result.directMatches[0].matchedEvidence.map(item => [
    item.imageId,
    item.regionRef
  ]),
  [['diag_c3_thrips', 'leaf_upper_surface']]
)

const persistedC3ThripsPayload = JSON.stringify({
  normalized_organ: 'flower',
  image_quality_grade: 'good',
  analyzability: 'high',
  capture_region: 'other_local',
  region_ref: 'other_local',
  symptom_candidates: [
    {
      symptom_key: 'stippling',
      strength_level: 'weak',
      confidence_band: 'medium'
    }
  ],
  mode_candidates: [{ mode: 'thrips', confidence: 0.95, region_ref: 'other_local' }],
  visual_discriminators: [
    {
      dimension_key: 'insect_body_presence',
      value_key: 'present',
      confidence_band: 'high'
    },
    {
      dimension_key: 'insect_body_shape',
      value_key: 'slender',
      confidence_band: 'high'
    },
    {
      dimension_key: 'insect_body_location',
      value_key: 'leaf_upper',
      confidence_band: 'medium'
    }
  ]
})

for (const diagnosisProfile of ['pest', 'full']) {
  const persistedC3Parsed = parseLLMVisualResult(persistedC3ThripsPayload, { diagnosisProfile })
  const persistedC3ThripsVisible = persistedC3Parsed.symptom_candidates.find(
    item => item.symptom_key === 'thrips_visible'
  )
  assert.equal(persistedC3ThripsVisible?.strength_level, 'strong')
  assert.equal(persistedC3ThripsVisible?.confidence_band, 'high')
  assert.equal(persistedC3ThripsVisible?.admission_readiness, 'ready')

  const persistedC3Route = attachDiagnosisModeRoute({
    diagnosisProfile,
    aggregateResult: {
      aggregate_analyzability: 'high',
      aggregated_symptom_candidates: persistedC3Parsed.symptom_candidates.map(item => ({
        ...item,
        primary_support_image_id: `diag_c3_thrips_${diagnosisProfile}`,
        primary_capture_region: 'other_local'
      })),
      admission_records: persistedC3Parsed.symptom_candidates.map(item => ({
        object_type: 'symptom',
        object_key: item.symptom_key,
        admission_result:
          item.admission_readiness === 'ready' ? 'formally_admitted' : 'explanation_retained',
        visual_normalized_image_result_id: `normalized_${item.symptom_key}_${diagnosisProfile}`,
        candidate: {
          ...item,
          primary_support_image_id: `diag_c3_thrips_${diagnosisProfile}`,
          primary_capture_region: 'other_local'
        }
      }))
    },
    successfulResults: [
      {
        imageId: `diag_c3_thrips_${diagnosisProfile}`,
        normalizedResult: persistedC3Parsed
      }
    ]
  })
  assert.equal(persistedC3Route.route_primary_action, 'direct_result')
  assert.deepEqual(
    persistedC3Route.diagnosis_mode_route_result.directMatches.map(item => item.modeKey),
    ['thrips']
  )
}

for (const invalidC3Override of [
  { mode_candidates: [{ mode: 'thrips', confidence: 0.95, region_ref: 'leaf_upper_surface' }] },
  {
    mode_candidates: [{ mode: 'thrips', confidence: 0.95, region_ref: 'leaf_upper_surface' }],
    visual_discriminators: [
      {
        dimension_key: 'insect_body_presence',
        value_key: 'present',
        confidence_band: 'high'
      },
      {
        dimension_key: 'insect_body_shape',
        value_key: 'mite',
        confidence_band: 'high'
      },
      {
        dimension_key: 'insect_body_location',
        value_key: 'leaf_upper',
        confidence_band: 'high'
      }
    ]
  },
  {
    mode_candidates: [{ mode: 'thrips', confidence: 0.94, region_ref: 'leaf_upper_surface' }],
    visual_discriminators: [
      {
        dimension_key: 'insect_body_presence',
        value_key: 'present',
        confidence_band: 'high'
      },
      {
        dimension_key: 'insect_body_shape',
        value_key: 'slender',
        confidence_band: 'high'
      },
      {
        dimension_key: 'insect_body_location',
        value_key: 'leaf_upper',
        confidence_band: 'high'
      }
    ]
  },
  {
    mode_candidates: [{ mode: 'thrips', confidence: 0.95, region_ref: 'leaf_upper_surface' }],
    visual_discriminators: [
      {
        dimension_key: 'insect_body_presence',
        value_key: 'present',
        confidence_band: 'medium'
      },
      {
        dimension_key: 'insect_body_shape',
        value_key: 'slender',
        confidence_band: 'high'
      },
      {
        dimension_key: 'insect_body_location',
        value_key: 'leaf_upper',
        confidence_band: 'high'
      }
    ]
  },
  {
    mode_candidates: [{ mode: 'thrips', confidence: 0.95, region_ref: 'other_local' }],
    visual_discriminators: [
      {
        dimension_key: 'insect_body_presence',
        value_key: 'present',
        confidence_band: 'high'
      },
      {
        dimension_key: 'insect_body_shape',
        value_key: 'slender',
        confidence_band: 'medium'
      },
      {
        dimension_key: 'insect_body_location',
        value_key: 'leaf_upper',
        confidence_band: 'medium'
      }
    ]
  }
]) {
  const parsedInvalidC3 = parseLLMVisualResult(
    JSON.stringify({
      normalized_organ: 'leaf',
      image_quality_grade: 'good',
      analyzability: 'high',
      capture_region: 'leaf_upper_surface',
      region_ref: 'leaf_upper_surface',
      symptom_candidates: [
        {
          symptom_key: 'stippling',
          strength_level: 'weak',
          confidence_band: 'medium'
        }
      ],
      ...invalidC3Override
    }),
    { diagnosisProfile: 'pest' }
  )
  assert.equal(
    parsedInvalidC3.symptom_candidates.some(item => item.symptom_key === 'thrips_visible'),
    false
  )
}

assert.equal(evidenceGroupForKey('stippling'), evidenceGroupForKey('yellow_speckling'))
assert.equal(evidenceGroupForKey('silver_streaks'), evidenceGroupForKey('silver_scarring'))

function resolveThripsCombination(silverEvidenceKeys) {
  return resolveDiagnosisModeRoute({
    diagnosisProfile: 'pest',
    admittedEvidence: [
      ...silverEvidenceKeys.map(evidenceKey => ({
        evidenceKey,
        confidenceBand: 'high',
        strengthLevel: 'strong',
        imageId: 'img_thrips',
        captureRegion: 'leaf_upper_surface'
      })),
      {
        evidenceKey: 'black_fecal_spots',
        confidenceBand: 'high',
        strengthLevel: 'strong',
        imageId: 'img_thrips',
        captureRegion: 'leaf_upper_surface'
      }
    ]
  })
}

const canonicalDirectRoute = resolveThripsCombination(['silver_scarring'])
assert.equal(canonicalDirectRoute.nextAction, 'direct_result')
assert.deepEqual(
  canonicalDirectRoute.directMatches.map(item => item.modeKey),
  ['thrips']
)

const aliasDirectRoute = resolveThripsCombination(['silver_streaks'])
assert.equal(aliasDirectRoute.nextAction, 'direct_result')
assert.deepEqual(
  aliasDirectRoute.directMatches.map(item => item.modeKey),
  ['thrips']
)

const synonymDedupedRoute = resolveThripsCombination(['silver_scarring', 'silver_streaks'])
assert.equal(synonymDedupedRoute.nextAction, 'direct_result')
assert.equal(synonymDedupedRoute.directMatches[0].matchedEvidence.length, 2)
assert.deepEqual(
  synonymDedupedRoute.directMatches[0].matchedEvidence.map(item => item.evidenceGroup).sort(),
  ['black_fecal_spots', 'silver_scarring']
)
