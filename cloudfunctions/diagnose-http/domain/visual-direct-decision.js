'use strict'

const {
  DIAGNOSIS_MODE_REGISTRY,
  GENERAL_VISUAL_RULES,
  PEST_VISUAL_RULES
} = require('./diagnosis-mode-registry')
const {
  DIRECT_CONCLUSION_CONFIDENCE,
  normalizeKey,
  normalizeModeCandidates,
  unique
} = require('./diagnosis-mode-helpers')
const {
  normalizeAnalyzability,
  normalizeOrgan,
  normalizeText,
  areOrgansCompatible
} = require('../utils/visual-contract')

const DIRECTABLE_PACKAGE_KINDS = new Set(['visual_direct_only', 'dynamic_specific_pest'])
const WILDCARD_ORGANS = new Set(['unknown', 'other', 'whole_plant'])

function modeVisualRule(modeKey = '') {
  return (
    PEST_VISUAL_RULES.find(item => item.modeKey === modeKey) ||
    GENERAL_VISUAL_RULES.find(item => item.modeKey === modeKey) ||
    null
  )
}

function isDirectableMode(modeKey = '') {
  return DIRECTABLE_PACKAGE_KINDS.has(DIAGNOSIS_MODE_REGISTRY[modeKey]?.questionPackageKind)
}

function modeFamily(modeKey = '') {
  return DIAGNOSIS_MODE_REGISTRY[modeKey]?.category === 'pest' ? 'pest' : 'general'
}

function resolveModelOrgan(result = {}) {
  const normalized = result?.normalizedResult || result || {}
  return normalizeOrgan(
    normalized.model_detected_organ || normalized.modelDetectedOrgan || normalized.normalized_organ,
    'unknown'
  )
}

function buildSourceContext(result = {}) {
  const normalized = result?.normalizedResult || result || {}
  return {
    imageId: normalizeText(result?.imageId || normalized.image_id || normalized.imageId || ''),
    sourceRecordId: normalizeText(
      result?.visualNormalizedImageResultId || normalized.visual_normalized_image_result_id || ''
    ),
    visualRawImageRecordId: normalizeText(
      result?.visualRawImageRecordId || normalized.visual_raw_image_record_id || ''
    ),
    inputSlotType: normalizeOrgan(
      result?.inputSlotType || normalized.input_organ_hint || normalized.inputSlotType,
      'unknown'
    ),
    modelOrgan: resolveModelOrgan(result),
    analyzability: normalizeAnalyzability(normalized.analyzability, 'medium'),
    organConflictFlag: Number(normalized.organ_conflict_flag || 0) ? 1 : 0,
    captureRegion: normalizeText(
      normalized.region_ref || normalized.capture_region || result?.captureRegion || '',
      'unknown'
    )
  }
}

function guardHighConfidenceCandidate(candidate = {}, source = {}, diagnosisProfile = 'full') {
  const modeKey = normalizeKey(candidate?.modeKey || candidate?.mode || '')
  const entry = DIAGNOSIS_MODE_REGISTRY[modeKey]
  const reasons = []
  const profile = normalizeKey(diagnosisProfile) === 'pest' ? 'pest' : 'full'

  if (!entry || entry.enabled !== true) {
    reasons.push('mode_not_enabled')
  } else if (!entry.allowedProfiles.includes(profile)) {
    reasons.push('mode_not_allowed_for_profile')
  }
  if (source.analyzability === 'low') {
    reasons.push('image_analyzability_low')
  }
  if (source.organConflictFlag) {
    reasons.push('organ_conflict')
  }

  const inputOrgan = normalizeOrgan(source.inputSlotType, 'unknown')
  const modelOrgan = normalizeOrgan(source.modelOrgan, 'unknown')
  if (!WILDCARD_ORGANS.has(inputOrgan) && !areOrgansCompatible(inputOrgan, modelOrgan)) {
    reasons.push(modelOrgan === 'unknown' ? 'model_organ_unresolved' : 'input_model_organ_mismatch')
  }

  const rule = modeVisualRule(modeKey)
  if (rule && !WILDCARD_ORGANS.has(modelOrgan) && !rule.organKeys.includes(modelOrgan)) {
    reasons.push('mode_organ_mismatch')
  }

  return {
    modeKey,
    confidence: Number(candidate?.confidence || 0),
    regionRef: normalizeText(candidate?.regionRef || candidate?.region_ref || '', source.captureRegion),
    imageId: source.imageId,
    sourceRecordId: source.sourceRecordId,
    visualRawImageRecordId: source.visualRawImageRecordId,
    inputSlotType: inputOrgan,
    modelOrgan,
    analyzability: source.analyzability,
    organConflictFlag: source.organConflictFlag,
    packageKind: entry?.questionPackageKind || '',
    directable: isDirectableMode(modeKey),
    guardStatus: reasons.length ? 'blocked' : 'passed',
    guardReasons: reasons
  }
}

function evaluateImageModelDirectDecision(result = {}, diagnosisProfile = 'full') {
  const normalized = result?.normalizedResult || result || {}
  const source = buildSourceContext(result)
  const candidates = normalizeModeCandidates(normalized.mode_candidates || normalized.modeCandidates)
  const highCandidates = candidates.filter(
    item => Number(item.confidence) >= DIRECT_CONCLUSION_CONFIDENCE
  )
  const candidateDecisions = highCandidates.map(candidate =>
    guardHighConfidenceCandidate(candidate, source, diagnosisProfile)
  )
  const acceptedCandidates = candidateDecisions.filter(item => item.guardStatus === 'passed')
  const blockedCandidates = candidateDecisions.filter(item => item.guardStatus === 'blocked')
  const acceptedModeKeys = unique(acceptedCandidates.map(item => item.modeKey))
  const directableModeKeys = unique(
    acceptedCandidates.filter(item => item.directable).map(item => item.modeKey)
  )
  const fixedPackageModeKeys = unique(
    acceptedCandidates.filter(item => !item.directable).map(item => item.modeKey)
  )

  return {
    evaluated: true,
    imageId: source.imageId,
    sourceRecordId: source.sourceRecordId,
    inputSlotType: source.inputSlotType,
    modelOrgan: source.modelOrgan,
    analyzability: source.analyzability,
    organConflictFlag: source.organConflictFlag,
    highConfidenceCandidates: candidateDecisions,
    acceptedCandidates,
    blockedCandidates,
    acceptedModeKeys,
    directableModeKeys,
    fixedPackageModeKeys,
    hasBlockedHighConfidenceCandidate: blockedCandidates.length > 0,
    status: acceptedCandidates.length
      ? 'accepted'
      : blockedCandidates.length
        ? 'blocked'
        : 'not_candidate'
  }
}

function buildSecondaryVisualCandidates(results = [], acceptedCandidateKeys = new Set()) {
  return (Array.isArray(results) ? results : []).flatMap(result => {
    const normalized = result?.normalizedResult || {}
    const source = buildSourceContext(result)
    return normalizeModeCandidates(normalized.mode_candidates || normalized.modeCandidates)
      .map(candidate => ({
        ...candidate,
        imageId: candidate.imageId || source.imageId,
        sourceRecordId: candidate.sourceRecordId || source.sourceRecordId,
        inputSlotType:
          candidate.inputSlotType && candidate.inputSlotType !== 'unknown'
            ? candidate.inputSlotType
            : source.inputSlotType,
        modelOrgan:
          candidate.modelOrgan && candidate.modelOrgan !== 'unknown'
            ? candidate.modelOrgan
            : source.modelOrgan,
        analyzability: candidate.analyzability || source.analyzability,
        organConflictFlag: candidate.organConflictFlag || source.organConflictFlag,
        regionRef:
          candidate.regionRef && candidate.regionRef !== 'unknown'
            ? candidate.regionRef
            : source.captureRegion,
        role:
          Number(candidate.confidence) >= DIRECT_CONCLUSION_CONFIDENCE
            ? 'blocked_high_confidence_candidate'
            : 'secondary_visual_candidate'
      }))
      .filter(candidate => {
        const identity = `${candidate.imageId}::${candidate.modeKey}::${candidate.regionRef}`
        return !acceptedCandidateKeys.has(identity)
      })
  })
}

function buildBatchModelDirectDecision(results = [], diagnosisProfile = 'full') {
  const imageDecisions = (Array.isArray(results) ? results : [])
    .filter(result => result?.normalizedResult)
    .map(result => evaluateImageModelDirectDecision(result, diagnosisProfile))
  const acceptedCandidates = imageDecisions.flatMap(item => item.acceptedCandidates)
  const blockedCandidates = imageDecisions.flatMap(item => item.blockedCandidates)
  const organConflictSources = imageDecisions
    .filter(item => item.organConflictFlag)
    .map(item => ({
      imageId: item.imageId,
      sourceRecordId: item.sourceRecordId,
      inputSlotType: item.inputSlotType,
      modelOrgan: item.modelOrgan,
      analyzability: item.analyzability,
      organConflictFlag: item.organConflictFlag
    }))
  const hasOrganConflict = organConflictSources.length > 0
  const acceptedModeKeys = unique(acceptedCandidates.map(item => item.modeKey))
  const directableModeKeys = unique(
    acceptedCandidates.filter(item => item.directable).map(item => item.modeKey)
  )
  const fixedPackageModeKeys = unique(
    acceptedCandidates.filter(item => !item.directable).map(item => item.modeKey)
  )
  const acceptedCandidateKeys = new Set(
    acceptedCandidates.map(item => `${item.imageId}::${item.modeKey}::${item.regionRef}`)
  )
  const secondaryVisualCandidates = buildSecondaryVisualCandidates(results, acceptedCandidateKeys)
  const blockedModeKeys = unique(
    blockedCandidates
      .map(item => item.modeKey)
      .filter(modeKey => !acceptedModeKeys.includes(modeKey))
  )
  const acceptedModeFamilies = new Set(acceptedModeKeys.map(modeFamily))
  const visualConflicts =
    acceptedModeFamilies.size > 1
      ? [
          {
            conflictType: 'multiple_high_confidence_families',
            modeKeys: acceptedModeKeys,
            families: Array.from(acceptedModeFamilies),
            candidateSources: acceptedCandidates.map(item => ({
              modeKey: item.modeKey,
              imageId: item.imageId,
              regionRef: item.regionRef,
              confidence: item.confidence
            }))
          }
        ]
      : []

  return {
    evaluated: true,
    status: acceptedCandidates.length
      ? 'accepted'
      : blockedCandidates.length || hasOrganConflict
        ? 'blocked'
        : 'not_candidate',
    imageDecisions,
    highConfidenceCandidates: [...acceptedCandidates, ...blockedCandidates],
    acceptedCandidates,
    blockedCandidates,
    acceptedModeKeys,
    directableModeKeys,
    fixedPackageModeKeys,
    blockedModeKeys,
    secondaryVisualCandidates,
    visualConflicts,
    hasBlockedHighConfidenceCandidate: blockedCandidates.length > 0,
    organConflictSources,
    hasOrganConflict,
    fastPathEligible: directableModeKeys.length > 0
  }
}

module.exports = {
  DIRECTABLE_PACKAGE_KINDS,
  areOrgansCompatible,
  modeFamily,
  guardHighConfidenceCandidate,
  evaluateImageModelDirectDecision,
  buildBatchModelDirectDecision,
  _test: {
    buildSourceContext,
    modeVisualRule,
    isDirectableMode,
    buildSecondaryVisualCandidates
  }
}
