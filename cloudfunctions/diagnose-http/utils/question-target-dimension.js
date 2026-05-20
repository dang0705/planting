'use strict'

const QUESTION_TARGET_DIMENSIONS = {
  VISUAL_PRESENCE: 'visual_presence',
  SURFACE_RESIDUE: 'surface_residue',
  SURFACE_STICKINESS: 'surface_stickiness',
  TISSUE_MOISTURE: 'tissue_moisture',
  TISSUE_INTEGRITY: 'tissue_integrity',
  STRUCTURAL_CAUSE: 'structural_cause',
  PEST_TRACE_TYPE: 'pest_trace_type',
  EDEMA_BUMP_STAGE: 'edema_bump_stage',
  LEAF_TUNNEL_PATTERN: 'leaf_tunnel_pattern',
  POWDER_PATTERN: 'powder_pattern',
  YELLOWING_PRIMARY_CLUE_GATE: 'yellowing_primary_clue_gate',
  YELLOWING_CARE_AREA_GATE: 'yellowing_care_area_gate',
  YELLOWING_DISEASE_TRACE_GATE: 'yellowing_disease_trace_gate',
  YELLOWING_LEAF_AGE_PATTERN: 'yellowing_leaf_age_pattern',
  YELLOWING_DISTRIBUTION_PATTERN: 'yellowing_distribution_pattern',
  WATERING_FREQUENCY_CONTEXT: 'watering_frequency_context',
  LIGHT_CHANGE_CONTEXT: 'light_change_context',
  FERTILIZATION_GROWTH_CONTEXT: 'fertilization_growth_context',
  AIRFLOW_HUMIDITY_CONTEXT: 'airflow_humidity_context',
  YELLOWING_PROGRESSION_SPEED: 'yellowing_progression_speed',
  LESION_HALO: 'lesion_halo',
  LESION_WATER_SOAKING: 'lesion_water_soaking',
  PROGRESSION: 'progression',
  HOST_CONFIRMATION: 'host_confirmation',
  UNDERSIDE_PRESENCE: 'underside_presence',
  DISTRIBUTION_SCOPE: 'distribution_scope',
  ROOT_ZONE_CONTEXT: 'root_zone_context',
  SUBSTRATE_MOISTURE: 'substrate_moisture',
  LIGHT_EXPOSURE: 'light_exposure',
  WATERING_CONTEXT: 'watering_context',
  FERTILIZATION_CONTEXT: 'fertilization_context',
  STABILITY: 'stability'
}

const QUESTION_ROUTING_SCOPES = {
  SYMPTOM_CONFIRMATION: 'symptom_confirmation',
  DIFFERENTIAL_PROBE: 'differential_probe',
  CONTEXT_PROBE: 'context_probe'
}

const QUESTION_ROLES = {
  GATE: 'gate',
  DIFFERENTIAL_PROBE: 'differential_probe',
  CONTEXT_METRIC: 'context_metric',
  SYMPTOM_CONFIRMATION: 'symptom_confirmation',
  VISUAL_FACT_REVIEW: 'visual_fact_review'
}

const QUESTION_EFFECT_MODES = {
  ROUTE_GATE: 'route_gate',
  SCORE_ADJUSTMENT: 'score_adjustment',
  EVIDENCE_ADMISSION: 'evidence_admission',
  CONTEXT_FEATURE: 'context_feature',
  VISUAL_FACT_REVIEW: 'visual_fact_review'
}

const QUESTION_TARGET_DIMENSION_LABELS = {
  [QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE]: '视觉存在',
  [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE]: '表面附着/可擦落',
  [QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS]: '表面黏腻/蜜露感',
  [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]: '组织湿软/水渍感',
  [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY]: '组织完整性/是否缺损',
  [QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE]: '结构损伤成因分流',
  [QUESTION_TARGET_DIMENSIONS.PEST_TRACE_TYPE]: '刺吸式害虫痕迹类型分流',
  [QUESTION_TARGET_DIMENSIONS.EDEMA_BUMP_STAGE]: '水肿鼓包阶段分流',
  [QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN]: '潜叶道形态分流',
  [QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN]: '白色粉层分布分流',
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE]: '黄叶首要线索分流',
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE]: '黄叶养护方向分流',
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE]: '黄叶病斑/霉层线索分流',
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_LEAF_AGE_PATTERN]: '黄叶新老叶分流',
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN]: '黄叶分布模式分流',
  [QUESTION_TARGET_DIMENSIONS.WATERING_FREQUENCY_CONTEXT]: '浇水周期/盆土干湿背景',
  [QUESTION_TARGET_DIMENSIONS.LIGHT_CHANGE_CONTEXT]: '光照变化背景',
  [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_GROWTH_CONTEXT]: '施肥/生长背景',
  [QUESTION_TARGET_DIMENSIONS.AIRFLOW_HUMIDITY_CONTEXT]: '通风/空气湿度背景',
  [QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED]: '黄叶进展速度',
  [QUESTION_TARGET_DIMENSIONS.LESION_HALO]: '病斑黄晕/边缘晕圈',
  [QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING]: '病斑边缘水渍/半透明感',
  [QUESTION_TARGET_DIMENSIONS.PROGRESSION]: '进展性',
  [QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION]: '宿主/养护确认',
  [QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE]: '叶背/隐蔽部位',
  [QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE]: '分布范围',
  [QUESTION_TARGET_DIMENSIONS.ROOT_ZONE_CONTEXT]: '根区/异味/根系状态',
  [QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE]: '盆土湿度/排水背景',
  [QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE]: '光照/暴晒背景',
  [QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT]: '浇水/干湿背景',
  [QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT]: '施肥/营养背景',
  [QUESTION_TARGET_DIMENSIONS.STABILITY]: '稳定性'
}

const GENERIC_OBSERVED_PROBE_DIRECT_EVIDENCE_DIMENSIONS = new Set([
  QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
  QUESTION_TARGET_DIMENSIONS.PROGRESSION,
  QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
  QUESTION_TARGET_DIMENSIONS.UNDERSIDE_PRESENCE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_DISTRIBUTION_PATTERN,
  QUESTION_TARGET_DIMENSIONS.YELLOWING_PROGRESSION_SPEED
])

const QUESTION_TARGET_DIMENSION_OVERRIDES = {
  q_black_spots_spreading_confirm: QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE,
  q_brown_spots_halo_confirm: QUESTION_TARGET_DIMENSIONS.LESION_HALO,
  q_fungal_brown_spots_halo: QUESTION_TARGET_DIMENSIONS.LESION_HALO,
  q_bacterial_halo: QUESTION_TARGET_DIMENSIONS.LESION_HALO,
  q_holes_in_leaf_confirm: QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
  q_chewed_edges_confirm: QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
  q_skeletonized_leaves_confirm: QUESTION_TARGET_DIMENSIONS.STRUCTURAL_CAUSE,
  q_tunnels_in_leaf_confirm: QUESTION_TARGET_DIMENSIONS.LEAF_TUNNEL_PATTERN,
  q_powder_white_visible: QUESTION_TARGET_DIMENSIONS.POWDER_PATTERN,
  q_sooty_mold_confirm: QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
  q_black_mold_growth_confirm: QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
  q_aphids_sooty_mold: QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
  q_scale_sooty_mold: QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
  q_whiteflies_sooty_mold: QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
  q_sticky_honeydew_confirm: QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
  q_aphids_sticky_honeydew: QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
  q_scale_honeydew: QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
  q_whiteflies_honeydew: QUESTION_TARGET_DIMENSIONS.SURFACE_STICKINESS,
  q_bacterial_water_soaked: QUESTION_TARGET_DIMENSIONS.LESION_WATER_SOAKING,
  q_root_rot_bad_smell: QUESTION_TARGET_DIMENSIONS.ROOT_ZONE_CONTEXT,
  q_root_rot_black_roots: QUESTION_TARGET_DIMENSIONS.ROOT_ZONE_CONTEXT,
  q_root_rot_mushy_roots: QUESTION_TARGET_DIMENSIONS.ROOT_ZONE_CONTEXT,
  q_root_rot_wet_soil_wilt: QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
  q_gnat_soil_stays_wet: QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
  q_blackened_stem_base_bad_root_smell: QUESTION_TARGET_DIMENSIONS.ROOT_ZONE_CONTEXT,
  q_stem_collapse_poor_drainage: QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
  q_leaf_yellowing_new_growth_bias: QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
  q_iron_new_leaves_yellow: QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
  q_iron_not_old_first: QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
  q_nitrogen_old_leaves_yellow: QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
  q_nitrogen_uniform_yellow: QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
  q_leaf_bleaching_sunburn_patch: QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
  q_underwater_dry_wilt: QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
  q_leaf_yellowing_light_background: QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
  q_leaf_yellowing_watering_background: QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
  q_leaf_yellowing_fertilization_background: QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT,
  q_yellowing_patchy_yellow_speckling: QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE,
  q_spider_stippling_visible: QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE,
  q_whiteflies_yellow_or_silver: QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE,
  q_black_spots_surface_layer_check: QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE,
  q_black_spots_tissue_moisture_check: QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE
}

const QUESTION_ROUTING_SCOPE_OVERRIDES = {
  q_black_spots_spreading_confirm: QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION,
  q_brown_spots_halo_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_fungal_brown_spots_halo: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_bacterial_halo: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_holes_in_leaf_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_chewed_edges_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_skeletonized_leaves_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_tunnels_in_leaf_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_powder_white_visible: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_sooty_mold_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_black_mold_growth_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_aphids_sooty_mold: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_scale_sooty_mold: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_whiteflies_sooty_mold: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_sticky_honeydew_confirm: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_aphids_sticky_honeydew: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_scale_honeydew: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_whiteflies_honeydew: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_bacterial_water_soaked: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_root_rot_bad_smell: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_root_rot_black_roots: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_root_rot_mushy_roots: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_root_rot_wet_soil_wilt: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_gnat_soil_stays_wet: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_blackened_stem_base_bad_root_smell: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_stem_collapse_poor_drainage: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_leaf_yellowing_new_growth_bias: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_iron_new_leaves_yellow: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_iron_not_old_first: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_nitrogen_old_leaves_yellow: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_nitrogen_uniform_yellow: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_leaf_bleaching_sunburn_patch: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_underwater_dry_wilt: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_leaf_yellowing_light_background: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_leaf_yellowing_watering_background: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_leaf_yellowing_fertilization_background: QUESTION_ROUTING_SCOPES.CONTEXT_PROBE,
  q_yellowing_patchy_yellow_speckling: QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION,
  q_spider_stippling_visible: QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION,
  q_whiteflies_yellow_or_silver: QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION,
  q_black_spots_surface_layer_check: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE,
  q_black_spots_tissue_moisture_check: QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
}

const OBSERVED_VISUAL_COVERED_DIMENSION_BY_SYMPTOM_KEY = {
  sooty_mold: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  black_mold_growth: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  powder_white: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  sticky_honeydew: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  black_spots_spreading: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  brown_spots_halo: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  irregular_blotches: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  chewed_edges: [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY],
  holes_in_leaf: [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY],
  skeletonized_leaves: [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY],
  water_soaked_spots: [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE],
  water_soaked_stem: [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE],
  soft_stem: [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]
}

const OBSERVED_VISUAL_COVERED_DIMENSION_BY_PATTERN_KEY = {
  mold: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  powder: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  spots: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  blotch: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  blotches: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  honeydew: [QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE],
  chew: [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY],
  holes: [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY],
  skeletonization: [QUESTION_TARGET_DIMENSIONS.TISSUE_INTEGRITY],
  soaked: [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE],
  soft: [QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE]
}

function normalizeText(value = '', fallback = '') {
  const normalized = String(value || '').trim()
  return normalized || fallback
}

function normalizeQuestionTargetDimension(value = '', fallback = QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_TARGET_DIMENSIONS).includes(normalized)
    ? normalized
    : fallback
}

function normalizeQuestionRoutingScope(value = '', fallback = QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_ROUTING_SCOPES).includes(normalized)
    ? normalized
    : fallback
}

function normalizeQuestionRole(value = '', fallback = QUESTION_ROLES.SYMPTOM_CONFIRMATION) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_ROLES).includes(normalized)
    ? normalized
    : fallback
}

function normalizeQuestionEffectMode(value = '', fallback = QUESTION_EFFECT_MODES.EVIDENCE_ADMISSION) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_EFFECT_MODES).includes(normalized)
    ? normalized
    : fallback
}

function inferQuestionTargetDimension(questionKey = '', targetSymptomKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (normalizedQuestionKey && QUESTION_TARGET_DIMENSION_OVERRIDES[normalizedQuestionKey]) {
    return QUESTION_TARGET_DIMENSION_OVERRIDES[normalizedQuestionKey]
  }

  const normalizedTargetSymptomKey = normalizeText(targetSymptomKey)
  if (normalizedTargetSymptomKey === 'water_soaked_spots') {
    return QUESTION_TARGET_DIMENSIONS.TISSUE_MOISTURE
  }
  if (normalizedTargetSymptomKey === 'sooty_mold') {
    return QUESTION_TARGET_DIMENSIONS.SURFACE_RESIDUE
  }

  return QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
}

function inferQuestionRole(targetDimension = '', routingScope = '') {
  const normalizedDimension = normalizeQuestionTargetDimension(targetDimension, '')
  const normalizedScope = normalizeQuestionRoutingScope(routingScope, '')
  if (
    [
      QUESTION_TARGET_DIMENSIONS.YELLOWING_PRIMARY_CLUE_GATE,
      QUESTION_TARGET_DIMENSIONS.YELLOWING_CARE_AREA_GATE,
      QUESTION_TARGET_DIMENSIONS.YELLOWING_DISEASE_TRACE_GATE
    ].includes(normalizedDimension)
  ) {
    return QUESTION_ROLES.GATE
  }
  if (normalizedDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return QUESTION_ROLES.SYMPTOM_CONFIRMATION
  }
  if (normalizedScope === QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE) {
    return QUESTION_ROLES.DIFFERENTIAL_PROBE
  }
  if (normalizedScope === QUESTION_ROUTING_SCOPES.CONTEXT_PROBE) {
    return QUESTION_ROLES.CONTEXT_METRIC
  }
  return QUESTION_ROLES.SYMPTOM_CONFIRMATION
}

function inferQuestionEffectMode(questionRole = '', targetDimension = '') {
  const normalizedRole = normalizeQuestionRole(questionRole, '')
  const normalizedDimension = normalizeQuestionTargetDimension(targetDimension, '')
  if (normalizedRole === QUESTION_ROLES.GATE) {
    return QUESTION_EFFECT_MODES.ROUTE_GATE
  }
  if (normalizedRole === QUESTION_ROLES.CONTEXT_METRIC) {
    return QUESTION_EFFECT_MODES.CONTEXT_FEATURE
  }
  if (normalizedRole === QUESTION_ROLES.VISUAL_FACT_REVIEW) {
    return QUESTION_EFFECT_MODES.VISUAL_FACT_REVIEW
  }
  if (normalizedDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE) {
    return QUESTION_EFFECT_MODES.EVIDENCE_ADMISSION
  }
  return QUESTION_EFFECT_MODES.SCORE_ADJUSTMENT
}

function inferQuestionRoutingScope(questionKey = '', targetSymptomKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (normalizedQuestionKey && QUESTION_ROUTING_SCOPE_OVERRIDES[normalizedQuestionKey]) {
    return QUESTION_ROUTING_SCOPE_OVERRIDES[normalizedQuestionKey]
  }

  const targetDimension = inferQuestionTargetDimension(questionKey, targetSymptomKey)
  if (
    [
      QUESTION_TARGET_DIMENSIONS.PROGRESSION,
      QUESTION_TARGET_DIMENSIONS.HOST_CONFIRMATION,
      QUESTION_TARGET_DIMENSIONS.DISTRIBUTION_SCOPE,
      QUESTION_TARGET_DIMENSIONS.LIGHT_EXPOSURE,
      QUESTION_TARGET_DIMENSIONS.WATERING_CONTEXT,
      QUESTION_TARGET_DIMENSIONS.FERTILIZATION_CONTEXT,
      QUESTION_TARGET_DIMENSIONS.ROOT_ZONE_CONTEXT,
      QUESTION_TARGET_DIMENSIONS.SUBSTRATE_MOISTURE,
      QUESTION_TARGET_DIMENSIONS.STABILITY
    ].includes(targetDimension)
  ) {
    return QUESTION_ROUTING_SCOPES.CONTEXT_PROBE
  }
  return targetDimension === QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE
    ? QUESTION_ROUTING_SCOPES.SYMPTOM_CONFIRMATION
    : QUESTION_ROUTING_SCOPES.DIFFERENTIAL_PROBE
}

function inferObservedVisualCoveredDimensions({
  symptomKey = '',
  patternKey = ''
} = {}) {
  const coveredDimensions = new Set([QUESTION_TARGET_DIMENSIONS.VISUAL_PRESENCE])
  const normalizedSymptomKey = normalizeText(symptomKey).toLowerCase()
  const normalizedPatternKey = normalizeText(patternKey).toLowerCase()

  const symptomDimensions = OBSERVED_VISUAL_COVERED_DIMENSION_BY_SYMPTOM_KEY[normalizedSymptomKey] || []
  const patternDimensions = OBSERVED_VISUAL_COVERED_DIMENSION_BY_PATTERN_KEY[normalizedPatternKey] || []

  for (const targetDimension of [...symptomDimensions, ...patternDimensions]) {
    coveredDimensions.add(targetDimension)
  }

  return Array.from(coveredDimensions)
}

function resolveQuestionTargetDimensionLabel(targetDimension = '') {
  const normalized = normalizeQuestionTargetDimension(targetDimension)
  return QUESTION_TARGET_DIMENSION_LABELS[normalized] || QUESTION_TARGET_DIMENSION_LABELS.visual_presence
}

function isGenericObservedProbeDirectEvidenceDimension(targetDimension = '') {
  const normalized = normalizeQuestionTargetDimension(targetDimension, '')
  return GENERIC_OBSERVED_PROBE_DIRECT_EVIDENCE_DIMENSIONS.has(normalized)
}

module.exports = {
  QUESTION_TARGET_DIMENSIONS,
  QUESTION_ROUTING_SCOPES,
  QUESTION_ROLES,
  QUESTION_EFFECT_MODES,
  GENERIC_OBSERVED_PROBE_DIRECT_EVIDENCE_DIMENSIONS,
  normalizeQuestionTargetDimension,
  normalizeQuestionRoutingScope,
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionTargetDimension,
  inferQuestionRoutingScope,
  inferQuestionRole,
  inferQuestionEffectMode,
  inferObservedVisualCoveredDimensions,
  resolveQuestionTargetDimensionLabel,
  isGenericObservedProbeDirectEvidenceDimension
}
