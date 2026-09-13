'use strict'

const { normalizeSymptomCandidate } = require('./visual-contract')
const { normalizeCaptureRegion } = require('./capture-region-normalizer')

const LEAF_ANOMALY_SIGN_TO_SYMPTOM = Object.freeze({
  uniform_yellow: {
    symptomKey: 'leaf_yellowing',
    displayNameCn: '叶片均匀黄化'
  },
  patchy_yellow: {
    symptomKey: 'yellowing_patchy',
    displayNameCn: '叶片斑状黄化'
  },
  droop_wilt: {
    symptomKey: 'leaf_droop',
    displayNameCn: '叶片下垂'
  }
})

function confidenceAttributes(confidenceBand = 'medium') {
  const normalizedBand = String(confidenceBand || 'medium').trim().toLowerCase()
  if (normalizedBand === 'high') {
    return {
      strength_level: 'strong',
      confidence_band: 'high',
      admission_readiness: 'ready'
    }
  }
  if (normalizedBand === 'low') {
    return {
      strength_level: 'weak',
      confidence_band: 'low',
      admission_readiness: 'retain_only'
    }
  }
  return {
    strength_level: 'medium',
    confidence_band: 'medium',
    admission_readiness: 'cautious'
  }
}

// leaf_anomaly_sign 是模型已经确认的可见事实。full profile 下，将它规范化为
// 既有通用视觉证据；不会合成 mode_candidates，也不会覆盖模型显式给出的症状候选。
function appendCanonicalGeneralVisualCandidates({
  symptomCandidates = [],
  visualDiscriminators = [],
  diagnosisProfile = 'full',
  regionRef = ''
} = {}) {
  const candidates = Array.isArray(symptomCandidates) ? symptomCandidates : []
  if (String(diagnosisProfile || 'full').trim().toLowerCase() === 'pest') {
    return candidates
  }

  const candidatesByKey = new Map(
    candidates
      .filter(item => item?.symptom_key)
      .map(item => [String(item.symptom_key).trim(), item])
  )
  const normalizedRegionRef = normalizeCaptureRegion(regionRef)

  for (const discriminator of Array.isArray(visualDiscriminators) ? visualDiscriminators : []) {
    if (String(discriminator?.dimension_key || '').trim().toLowerCase() !== 'leaf_anomaly_sign') {
      continue
    }
    const mapping =
      LEAF_ANOMALY_SIGN_TO_SYMPTOM[
        String(discriminator?.value_key || '').trim().toLowerCase()
      ]
    if (!mapping || candidatesByKey.has(mapping.symptomKey)) {
      continue
    }

    const candidate = normalizeSymptomCandidate({
      symptom_key: mapping.symptomKey,
      display_name_cn: mapping.displayNameCn,
      ...confidenceAttributes(discriminator?.confidence_band),
      visibility_scope: 'organ',
      region_ref: normalizedRegionRef,
      supporting_region_note:
        String(discriminator?.visible_basis_cn || '').trim() ||
        `结构化视觉判读：${mapping.displayNameCn}。`
    })
    if (candidate) {
      candidatesByKey.set(mapping.symptomKey, candidate)
    }
  }

  return Array.from(candidatesByKey.values()).slice(0, 8)
}

module.exports = {
  appendCanonicalGeneralVisualCandidates
}
