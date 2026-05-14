'use strict'

function normalizeText(value = '') {
  return String(value || '').trim()
}

const OBSERVED_SYMPTOM_BRIDGE_TARGETS = {
  sooty_mold: ['sticky_honeydew'],
  black_mold_growth: ['sticky_honeydew'],
  black_spots_spreading: ['water_soaked_spots', 'brown_spots_halo'],
  brown_spots_halo: ['water_soaked_spots', 'black_spots_spreading'],
  uniform_yellowing: ['leaf_yellowing'],
  yellow_lower_leaves: ['leaf_yellowing'],
  yellow_new_leaves: ['leaf_yellowing'],
  interveinal_chlorosis: ['leaf_yellowing'],
  leaf_yellowing: []
}

function collectBridgeTargetSymptomKeys(symptomKeys = []) {
  const collected = new Set()

  for (const symptomKey of Array.isArray(symptomKeys) ? symptomKeys : []) {
    const normalizedSymptomKey = normalizeText(symptomKey)
    if (!normalizedSymptomKey) {continue}

    for (const bridgedSymptomKey of OBSERVED_SYMPTOM_BRIDGE_TARGETS[normalizedSymptomKey] || []) {
      const normalizedBridgedSymptomKey = normalizeText(bridgedSymptomKey)
      if (normalizedBridgedSymptomKey) {
        collected.add(normalizedBridgedSymptomKey)
      }
    }
  }

  return Array.from(collected)
}

module.exports = {
  OBSERVED_SYMPTOM_BRIDGE_TARGETS,
  collectBridgeTargetSymptomKeys
}
