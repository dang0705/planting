'use strict'

function normalizeLocationKey(value = '') {
  return String(value || '').trim().toLowerCase()
}

function filterPromptSymptomsByLocation(symptomRows = [], locationKeys = []) {
  const normalizedLocationKeys = Array.from(
    new Set(
      (Array.isArray(locationKeys) ? locationKeys : [])
        .map(item => normalizeLocationKey(item))
        .filter(Boolean)
    )
  )

  if (!normalizedLocationKeys.length) {
    return Array.isArray(symptomRows) ? symptomRows : []
  }

  const filteredRows = (Array.isArray(symptomRows) ? symptomRows : []).filter(item =>
    normalizedLocationKeys.includes(normalizeLocationKey(item?.locationKey))
  )

  return filteredRows
}

module.exports = {
  normalizeLocationKey,
  filterPromptSymptomsByLocation
}
