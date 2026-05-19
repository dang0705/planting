'use strict'

const {
  QUESTION_TARGET_DIMENSIONS,
  normalizeQuestionTargetDimension,
  inferObservedVisualCoveredDimensions
} = require('./question-target-dimension')
const { collectBridgeTargetSymptomKeys } = require('./question-symptom-bridge')
const {
  DIAGNOSIS_DIRECTION_DEFINITIONS,
  ROOT_ZONE_STRONG_SYMPTOM_KEYS
} = require('../constants/diagnosis-direction-definitions')
const {
  buildObservedEvidenceIndex,
  buildDerivedEvidenceIndex,
  buildVisualCandidateIndex,
  buildRouteHintIndex,
  computeDirectionConfidence,
  clamp01
} = require('./diagnosis-direction-indexes')
const { debugLog } = require('./common')

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeStringList(values = []) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map(item => normalizeText(item, ''))
        .filter(Boolean)
    )
  )
}

function resolveDiagnosisDirectionProblemKeys(
  definition = {},
  {
    matchedSymptomKeys = [],
    matchedPatternKeys = [],
    matchedCandidateSymptomKeys = [],
    matchedCandidatePatternKeys = [],
    observedSymptomKeys = []
  } = {}
) {
  const directionKey = normalizeText(definition?.directionKey || '', '')
  const matchedSymptomSet = new Set(
    normalizeStringList([...matchedSymptomKeys, ...matchedCandidateSymptomKeys])
  )
  const matchedPatternSet = new Set(
    normalizeStringList([...matchedPatternKeys, ...matchedCandidatePatternKeys])
  )
  const observedSymptomKeySet = new Set(normalizeStringList(observedSymptomKeys))

  if (directionKey === 'yellowing_direction') {
    const resolvedProblemKeys = new Set(normalizeStringList(definition?.candidateProblemKeys || []))
    const hasRootZoneStrongSignal = Array.from(ROOT_ZONE_STRONG_SYMPTOM_KEYS).some(symptomKey =>
      observedSymptomKeySet.has(symptomKey)
    )

    if (hasRootZoneStrongSignal) {
      ;['root_rot', 'crown_rot', 'soft_rot', 'root_stress', 'overwatering'].forEach(problemKey =>
        resolvedProblemKeys.add(problemKey)
      )
    }

    return Array.from(resolvedProblemKeys)
  }

  if (directionKey === 'pest_direction') {
    const includesChewingSignals =
      ['chewed_edges', 'holes_in_leaf', 'skeletonized_leaves'].some(symptomKey =>
        matchedSymptomSet.has(symptomKey)
      ) ||
      ['chew', 'holes', 'skeletonization'].some(patternKey => matchedPatternSet.has(patternKey))
    const includesMinerSignals =
      matchedSymptomSet.has('tunnels_in_leaf') || matchedPatternSet.has('tunnels')
    const includesSuckingSignals =
      [
        'yellow_speckling',
        'fine_webbing',
        'sticky_honeydew',
        'silver_streaks',
        'aphids_visible',
        'white_flies',
        'scale_shells',
        'sooty_mold',
        'black_mold_growth'
      ].some(symptomKey => matchedSymptomSet.has(symptomKey)) ||
      ['webbing', 'speckling', 'sticky'].some(patternKey => matchedPatternSet.has(patternKey))
    const includesSoilGnatSignals = matchedSymptomSet.has('small_flies_soil')

    const resolvedProblemKeys = new Set()
    if (includesSuckingSignals) {
      ;[
        'spider_mites',
        'whiteflies',
        'aphids',
        'scale_insects',
        'thrips',
        'sooty_mold_associated_pests'
      ].forEach(problemKey => resolvedProblemKeys.add(problemKey))
    }
    if (includesSoilGnatSignals) {
      resolvedProblemKeys.add('fungus_gnat')
    }
    if (includesChewingSignals) {
      ;['chewing_insects', 'caterpillars', 'snails_slugs', 'beetles'].forEach(problemKey =>
        resolvedProblemKeys.add(problemKey)
      )
    }
    if (includesMinerSignals) {
      resolvedProblemKeys.add('leaf_miners')
    }

    return resolvedProblemKeys.size
      ? Array.from(resolvedProblemKeys)
      : normalizeStringList(definition?.candidateProblemKeys || [])
  }

  if (directionKey === 'mold_direction') {
    const includesSootySignals = ['sooty_mold', 'black_mold_growth', 'sticky_honeydew'].some(
      symptomKey => matchedSymptomSet.has(symptomKey)
    )
    const includesPowderSignals =
      matchedSymptomSet.has('powder_white') || matchedPatternSet.has('powder')
    const includesLesionSignals =
      ['black_spots_spreading', 'brown_spots_halo', 'irregular_blotches'].some(symptomKey =>
        matchedSymptomSet.has(symptomKey)
      ) || ['spots', 'blotch', 'blotches'].some(patternKey => matchedPatternSet.has(patternKey))

    const resolvedProblemKeys = new Set()
    if (includesPowderSignals) {
      resolvedProblemKeys.add('powdery_mildew')
    }
    if (includesLesionSignals) {
      ;['fungal_leaf_spot', 'bacterial_leaf_spot'].forEach(problemKey =>
        resolvedProblemKeys.add(problemKey)
      )
    }
    if (includesSootySignals) {
      ;['sooty_mold_associated_pests', 'whiteflies', 'aphids', 'scale_insects'].forEach(problemKey =>
        resolvedProblemKeys.add(problemKey)
      )
    }

    return resolvedProblemKeys.size
      ? Array.from(resolvedProblemKeys)
      : normalizeStringList(definition?.candidateProblemKeys || [])
  }

  return normalizeStringList(definition?.candidateProblemKeys || [])
}

function buildDiagnosisDirections({
  observedEvidenceSet = [],
  derivedEvidenceSet = [],
  visualCandidateSymptoms = [],
  routeHints = [],
  round = 1
} = {}) {
  const { symptomConfidenceMap, symptomEvidenceKeysMap } = buildObservedEvidenceIndex(
    observedEvidenceSet
  )
  const { patternConfidenceMap, patternDerivedEvidenceIdsMap } = buildDerivedEvidenceIndex(
    derivedEvidenceSet
  )
  const {
    symptomConfidenceMap: candidateSymptomConfidenceMap,
    patternConfidenceMap: candidatePatternConfidenceMap
  } = buildVisualCandidateIndex(visualCandidateSymptoms)
  const { routeHintScoreMap, routeHintReasonMap } = buildRouteHintIndex(routeHints)

  return DIAGNOSIS_DIRECTION_DEFINITIONS.map(definition => {
    const matchedSymptomKeys = definition.symptomKeys.filter(symptomKey =>
      symptomConfidenceMap.has(symptomKey)
    )
    const matchedPatternKeys = definition.patternKeys.filter(patternKey =>
      patternConfidenceMap.has(patternKey)
    )
    const matchedCandidateSymptomKeys = definition.symptomKeys.filter(symptomKey =>
      candidateSymptomConfidenceMap.has(symptomKey)
    )
    const matchedCandidatePatternKeys = definition.patternKeys.filter(patternKey =>
      candidatePatternConfidenceMap.has(patternKey)
    )
    const matchedRouteHintTypes = (Array.isArray(definition.routeHintTypes)
      ? definition.routeHintTypes
      : []
    ).filter(routeHintType => routeHintScoreMap.has(routeHintType))
    if (
      !matchedSymptomKeys.length &&
      !matchedPatternKeys.length &&
      !matchedCandidateSymptomKeys.length &&
      !matchedCandidatePatternKeys.length &&
      !matchedRouteHintTypes.length
    ) {
      return null
    }
    const evidenceConfidence = computeDirectionConfidence({
      matchedSymptomKeys,
      matchedPatternKeys,
      symptomConfidenceMap,
      patternConfidenceMap
    })
    const candidateConfidence = computeDirectionConfidence({
      matchedSymptomKeys: matchedCandidateSymptomKeys,
      matchedPatternKeys: matchedCandidatePatternKeys,
      symptomConfidenceMap: candidateSymptomConfidenceMap,
      patternConfidenceMap: candidatePatternConfidenceMap
    })
    const routeHintConfidence = matchedRouteHintTypes.reduce(
      (best, routeHintType) => Math.max(best, Number(routeHintScoreMap.get(routeHintType) || 0)),
      0
    )
    const confidence = evidenceConfidence > 0
      ? evidenceConfidence
      : candidateConfidence > 0
        ? clamp01(candidateConfidence * 0.78)
        : clamp01(routeHintConfidence * 0.92)
    const status = evidenceConfidence >= 0.72
      ? 'leading'
      : evidenceConfidence > 0
        ? 'candidate'
        : routeHintConfidence >= 0.82
          ? 'leading'
          : routeHintConfidence > 0
            ? 'candidate'
            : 'hint'

    const resolvedAllowedProblemKeys = resolveDiagnosisDirectionProblemKeys(definition, {
      matchedSymptomKeys,
      matchedPatternKeys,
      matchedCandidateSymptomKeys,
      matchedCandidatePatternKeys,
      observedSymptomKeys: Array.from(symptomConfidenceMap.keys())
    })

    debugLog('diagnose-http direction resolution:', {
      directionKey: definition.directionKey,
      matchedSymptomKeys,
      matchedPatternKeys,
      matchedCandidateSymptomKeys,
      matchedCandidatePatternKeys,
      allowedProblemKeys: resolvedAllowedProblemKeys
    })

    return {
      directionId: `direction_rule::${definition.directionKey}`,
      directionKey: definition.directionKey,
      categoryKey: definition.categoryKey,
      label: definition.label,
      confidence,
      status,
      matchedSymptomKeys,
      matchedPatternKeys,
      matchedCandidateSymptomKeys: normalizeStringList(matchedCandidateSymptomKeys),
      matchedRouteHintTypes: normalizeStringList(matchedRouteHintTypes),
      matchedRouteHintReasons: normalizeStringList(
        matchedRouteHintTypes.flatMap(routeHintType => routeHintReasonMap.get(routeHintType) || [])
      ),
      matchedObservedEvidenceKeys: normalizeStringList(
        matchedSymptomKeys.flatMap(symptomKey => symptomEvidenceKeysMap.get(symptomKey) || [])
      ),
      matchedDerivedEvidenceIds: normalizeStringList(
        matchedPatternKeys.flatMap(patternKey => patternDerivedEvidenceIdsMap.get(patternKey) || [])
      ),
      sourceObservedEvidenceKeys: normalizeStringList(
        matchedSymptomKeys.flatMap(symptomKey => symptomEvidenceKeysMap.get(symptomKey) || [])
      ),
      sourceDerivedEvidenceKeys: normalizeStringList(
        matchedPatternKeys.flatMap(patternKey => patternDerivedEvidenceIdsMap.get(patternKey) || [])
      ),
      bridgeTargetSymptomKeys: collectBridgeTargetSymptomKeys([
        ...matchedSymptomKeys,
        ...matchedCandidateSymptomKeys
      ]),
      coveredFactDimensions: normalizeStringList(
        [...matchedSymptomKeys, ...matchedCandidateSymptomKeys].flatMap(symptomKey =>
          inferObservedVisualCoveredDimensions({
            symptomKey
          })
        )
      ),
      preferredQuestionDimensions: normalizeStringList(definition.preferredQuestionDimensions),
      allowedProblemKeys: resolvedAllowedProblemKeys,
      candidateProblemKeys: resolvedAllowedProblemKeys,
      supportSummary: {
        matchedSymptomCount: matchedSymptomKeys.length,
        matchedPatternCount: matchedPatternKeys.length,
        confidence
      },
      outputGateHints: {
        allowConclusionOnlyByProblemKey: 1,
        requiresAuditedClosure: 1,
        shouldStayInternal: 1
      },
      tracePayload: {
        matchedSymptomKeys,
        matchedPatternKeys,
        matchedCandidateSymptomKeys: normalizeStringList(matchedCandidateSymptomKeys),
        matchedCandidatePatternKeys: normalizeStringList(matchedCandidatePatternKeys),
        matchedRouteHintTypes: normalizeStringList(matchedRouteHintTypes)
      },
      round: Math.max(1, Number(round || 1)),
      updatedAt: Date.now(),
      sourceType: 'direction_rule',
      enteredRuntime: 1,
      enteredExplanation: 1
    }
  })
    .filter(Boolean)
    .sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0))
}

function normalizePublicDiagnosisDirectionItem(item = {}) {
  const directionId = normalizeText(item?.directionId || item?.direction_id || '', '')
  if (!directionId) {return null}

  return {
    directionId,
    directionKey: normalizeText(item?.directionKey || item?.direction_key || '', ''),
    categoryKey: normalizeText(item?.categoryKey || item?.category_key || '', ''),
    label: normalizeText(item?.label || item?.labelCn || '', ''),
    confidence: Number(item?.confidence || 0),
    status: normalizeText(item?.status || '', ''),
    matchedSymptomKeys: normalizeStringList(
      item?.matchedSymptomKeys || item?.matched_symptom_keys || []
    ),
    matchedPatternKeys: normalizeStringList(
      item?.matchedPatternKeys || item?.matched_pattern_keys || []
    ),
    matchedCandidateSymptomKeys: normalizeStringList(
      item?.matchedCandidateSymptomKeys || item?.matched_candidate_symptom_keys || []
    ),
    matchedRouteHintTypes: normalizeStringList(
      item?.matchedRouteHintTypes || item?.matched_route_hint_types || []
    ),
    matchedRouteHintReasons: normalizeStringList(
      item?.matchedRouteHintReasons || item?.matched_route_hint_reasons || []
    ),
    matchedObservedEvidenceKeys: normalizeStringList(
      item?.matchedObservedEvidenceKeys || item?.matched_observed_evidence_keys || []
    ),
    matchedDerivedEvidenceIds: normalizeStringList(
      item?.matchedDerivedEvidenceIds || item?.matched_derived_evidence_ids || []
    ),
    sourceObservedEvidenceKeys: normalizeStringList(
      item?.sourceObservedEvidenceKeys || item?.source_observed_evidence_keys || []
    ),
    sourceDerivedEvidenceKeys: normalizeStringList(
      item?.sourceDerivedEvidenceKeys || item?.source_derived_evidence_keys || []
    ),
    coveredFactDimensions: normalizeStringList(
      item?.coveredFactDimensions || item?.covered_fact_dimensions || []
    ).map(targetDimension =>
      normalizeQuestionTargetDimension(
        targetDimension,
        QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
    ),
    preferredQuestionDimensions: normalizeStringList(
      item?.preferredQuestionDimensions || item?.preferred_question_dimensions || []
    ).map(targetDimension =>
      normalizeQuestionTargetDimension(
        targetDimension,
        QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
      )
    ),
    candidateProblemKeys: normalizeStringList(
      item?.candidateProblemKeys || item?.candidate_problem_keys || []
    ),
    allowedProblemKeys: normalizeStringList(
      item?.allowedProblemKeys || item?.allowed_problem_keys || item?.candidateProblemKeys || []
    ),
    supportSummary:
      item?.supportSummary && typeof item.supportSummary === 'object'
        ? {
            matchedSymptomCount: Number(item.supportSummary?.matchedSymptomCount || 0),
            matchedPatternCount: Number(item.supportSummary?.matchedPatternCount || 0),
            confidence: Number(item.supportSummary?.confidence || 0)
          }
        : null,
    outputGateHints:
      item?.outputGateHints && typeof item.outputGateHints === 'object'
        ? {
            allowConclusionOnlyByProblemKey:
              Number(item.outputGateHints?.allowConclusionOnlyByProblemKey || 0) ? 1 : 0,
            requiresAuditedClosure:
              Number(item.outputGateHints?.requiresAuditedClosure || 0) ? 1 : 0,
            shouldStayInternal:
              Number(item.outputGateHints?.shouldStayInternal || 0) ? 1 : 0
          }
        : null,
    tracePayload:
      item?.tracePayload && typeof item.tracePayload === 'object'
        ? {
            matchedSymptomKeys: normalizeStringList(item.tracePayload?.matchedSymptomKeys || []),
            matchedPatternKeys: normalizeStringList(item.tracePayload?.matchedPatternKeys || []),
            matchedCandidateSymptomKeys: normalizeStringList(
              item.tracePayload?.matchedCandidateSymptomKeys || []
            ),
            matchedCandidatePatternKeys: normalizeStringList(
              item.tracePayload?.matchedCandidatePatternKeys || []
            ),
            matchedRouteHintTypes: normalizeStringList(
              item.tracePayload?.matchedRouteHintTypes || []
            )
          }
        : null,
    round: Math.max(1, Number(item?.round || 1)),
    updatedAt: Number(item?.updatedAt || item?.updated_at || 0) || 0,
    sourceType: normalizeText(item?.sourceType || item?.source_type || 'direction_rule', 'direction_rule'),
    enteredRuntime: Number(item?.enteredRuntime ?? item?.entered_runtime ?? 0) ? 1 : 0,
    enteredExplanation: Number(item?.enteredExplanation ?? item?.entered_explanation ?? 0) ? 1 : 0
  }
}

function normalizePublicDiagnosisDirectionSet(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(item => normalizePublicDiagnosisDirectionItem(item))
    .filter(Boolean)
}

function computeDiagnosisDirectionQuestionBoost(
  question = {},
  {
    strategyProblemKey = '',
    diagnosisDirections = []
  } = {}
) {
  const targetSymptomKey = normalizeText(question?.targetSymptomKey || '', '')
  const targetDimension = normalizeQuestionTargetDimension(
    question?.targetDimension,
    QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
  )
  let bestBoost = 0

  for (const direction of Array.isArray(diagnosisDirections) ? diagnosisDirections : []) {
    let boost = 0
    const preferredQuestionDimensions = Array.isArray(direction?.preferredQuestionDimensions)
      ? direction.preferredQuestionDimensions
      : []
    const matchedSymptomKeys = Array.isArray(direction?.matchedSymptomKeys)
      ? direction.matchedSymptomKeys
      : []
    const matchedCandidateSymptomKeys = Array.isArray(direction?.matchedCandidateSymptomKeys)
      ? direction.matchedCandidateSymptomKeys
      : []
    const bridgeTargetSymptomKeys = Array.isArray(direction?.bridgeTargetSymptomKeys)
      ? direction.bridgeTargetSymptomKeys
      : []
    const candidateProblemKeys = Array.isArray(direction?.candidateProblemKeys)
      ? direction.candidateProblemKeys
      : []

    if (targetSymptomKey && matchedSymptomKeys.includes(targetSymptomKey)) {
      boost += 34
    } else if (targetSymptomKey && matchedCandidateSymptomKeys.includes(targetSymptomKey)) {
      boost += 18
    } else if (targetSymptomKey && bridgeTargetSymptomKeys.includes(targetSymptomKey)) {
      boost += 20
    }

    const preferredDimensionIndex = preferredQuestionDimensions.indexOf(targetDimension)
    if (preferredDimensionIndex >= 0) {
      boost += Math.max(0, 28 - preferredDimensionIndex * 5)
    }

    if (strategyProblemKey && candidateProblemKeys.includes(strategyProblemKey)) {
      boost += 14
    }

    const confidenceFactor = 0.55 + clamp01(direction?.confidence || 0) * 0.45
    bestBoost = Math.max(bestBoost, Math.round(boost * confidenceFactor))
  }

  return bestBoost
}

module.exports = {
  buildDiagnosisDirections,
  normalizePublicDiagnosisDirectionItem,
  normalizePublicDiagnosisDirectionSet,
  computeDiagnosisDirectionQuestionBoost
}
