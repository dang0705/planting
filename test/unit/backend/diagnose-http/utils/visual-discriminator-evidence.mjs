import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  appendCanonicalGeneralVisualCandidates
} = require('../../../../../cloudfunctions/diagnose-http/utils/visual-discriminator-evidence.js')

const uniformYellow = appendCanonicalGeneralVisualCandidates({
  symptomCandidates: [],
  visualDiscriminators: [
    {
      dimension_key: 'leaf_anomaly_sign',
      value_key: 'uniform_yellow',
      confidence_band: 'high',
      visible_basis_cn: '叶片整体呈明显黄化。'
    }
  ],
  diagnosisProfile: 'full',
  regionRef: 'leaf_upper_surface'
})

assert.deepEqual(uniformYellow, [
  {
    symptom_key: 'leaf_yellowing',
    display_name_cn: '叶片均匀黄化',
    strength_level: 'strong',
    confidence_band: 'high',
    visibility_scope: 'organ',
    region_ref: 'leaf_upper_surface',
    supporting_region_note: '叶片整体呈明显黄化。',
    admission_readiness: 'ready'
  }
])

const explicitCandidate = {
  symptom_key: 'leaf_yellowing',
  confidence_band: 'medium',
  strength_level: 'medium',
  admission_readiness: 'cautious'
}
assert.deepEqual(
  appendCanonicalGeneralVisualCandidates({
    symptomCandidates: [explicitCandidate],
    visualDiscriminators: [
      {
        dimension_key: 'leaf_anomaly_sign',
        value_key: 'uniform_yellow',
        confidence_band: 'high'
      }
    ],
    diagnosisProfile: 'full'
  }),
  [explicitCandidate]
)

assert.deepEqual(
  appendCanonicalGeneralVisualCandidates({
    symptomCandidates: [],
    visualDiscriminators: [
      {
        dimension_key: 'leaf_anomaly_sign',
        value_key: 'droop_wilt',
        confidence_band: 'medium'
      }
    ],
    diagnosisProfile: 'pest'
  }),
  []
)

console.log('visual discriminator evidence tests passed')
