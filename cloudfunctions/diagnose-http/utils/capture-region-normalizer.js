'use strict'

const ALLOWED_CAPTURE_REGIONS = Object.freeze([
  'whole_plant_overview',
  'leaf_upper_surface',
  'leaf_lower_surface',
  'leaf_edge',
  'new_growth',
  'stem_surface',
  'node_leaf_axil',
  'root_surface',
  'root_crown',
  'soil_surface',
  'flower',
  'fruit',
  'other_local',
  'unknown'
])

const LEGACY_CAPTURE_REGION_ALIASES = Object.freeze({
  whole_plant: 'whole_plant_overview',
  overview: 'whole_plant_overview',
  leaf_front: 'leaf_upper_surface',
  leaf_top: 'leaf_upper_surface',
  leaf_surface: 'leaf_upper_surface',
  leaf_back: 'leaf_lower_surface',
  leaf_underside: 'leaf_lower_surface',
  leaf_under_surface: 'leaf_lower_surface',
  leaf_margin: 'leaf_edge',
  leaf_axil: 'node_leaf_axil',
  stem: 'stem_surface',
  stem_node: 'node_leaf_axil',
  pot_rim: 'soil_surface',
  affected_closeup: 'other_local',
  clear_affected_area: 'other_local',
  closeup: 'other_local',
  root: 'root_surface'
})

function normalizeCaptureRegion(value = '', conservative = 'unknown') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  const aliased = LEGACY_CAPTURE_REGION_ALIASES[normalized] || normalized
  if (ALLOWED_CAPTURE_REGIONS.includes(aliased)) {
    return aliased
  }
  return ALLOWED_CAPTURE_REGIONS.includes(conservative) ? conservative : 'unknown'
}

module.exports = {
  ALLOWED_CAPTURE_REGIONS,
  LEGACY_CAPTURE_REGION_ALIASES,
  normalizeCaptureRegion
}
