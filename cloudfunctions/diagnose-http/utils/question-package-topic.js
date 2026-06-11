'use strict'

const QUESTION_PACKAGE_TOPICS = {
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
  YELLOWING_PRIMARY_CLUE_TOPIC: 'yellowing_primary_clue_condition',
  YELLOWING_CARE_AREA_TOPIC: 'yellowing_care_area_condition',
  YELLOWING_DISEASE_TRACE_TOPIC: 'yellowing_disease_trace_condition',
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

const QUESTION_PACKAGE_SECTIONS = {
  SYMPTOM_CONFIRMATION: 'symptom_confirmation',
  DIFFERENTIAL_PROBE: 'differential_probe',
  CONTEXT_PROBE: 'context_probe'
}

const ROUTE_PACKAGE_ROLES = {
  CONDITION: 'condition',
  DIFFERENTIAL_PROBE: 'differential_probe',
  CONTEXT_METRIC: 'context_metric',
  SYMPTOM_CONFIRMATION: 'symptom_confirmation',
  VISUAL_FACT_REVIEW: 'visual_fact_review'
}

const QUESTION_PACKAGE_EFFECTS = {
  ROUTE_CONDITION: 'route_condition',
  SCORE_ADJUSTMENT: 'score_adjustment',
  EVIDENCE_ADMISSION: 'evidence_admission',
  CONTEXT_FEATURE: 'context_feature',
  VISUAL_FACT_REVIEW: 'visual_fact_review'
}

const QUESTION_PACKAGE_TOPIC_LABELS = {
  [QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE]: '视觉存在',
  [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE]: '表面附着/可擦落',
  [QUESTION_PACKAGE_TOPICS.SURFACE_STICKINESS]: '表面黏腻/蜜露感',
  [QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE]: '组织湿软/水渍感',
  [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY]: '组织完整性/是否缺损',
  [QUESTION_PACKAGE_TOPICS.STRUCTURAL_CAUSE]: '结构损伤成因分流',
  [QUESTION_PACKAGE_TOPICS.PEST_TRACE_TYPE]: '刺吸式害虫痕迹类型分流',
  [QUESTION_PACKAGE_TOPICS.EDEMA_BUMP_STAGE]: '水肿鼓包阶段分流',
  [QUESTION_PACKAGE_TOPICS.LEAF_TUNNEL_PATTERN]: '潜叶道形态分流',
  [QUESTION_PACKAGE_TOPICS.POWDER_PATTERN]: '白色粉层分布分流',
  [QUESTION_PACKAGE_TOPICS.YELLOWING_PRIMARY_CLUE_TOPIC]: '黄叶首要线索分流',
  [QUESTION_PACKAGE_TOPICS.YELLOWING_CARE_AREA_TOPIC]: '黄叶养护方向分流',
  [QUESTION_PACKAGE_TOPICS.YELLOWING_DISEASE_TRACE_TOPIC]: '黄叶病斑/霉层线索分流',
  [QUESTION_PACKAGE_TOPICS.YELLOWING_LEAF_AGE_PATTERN]: '黄叶新老叶分流',
  [QUESTION_PACKAGE_TOPICS.YELLOWING_DISTRIBUTION_PATTERN]: '黄叶分布模式分流',
  [QUESTION_PACKAGE_TOPICS.WATERING_FREQUENCY_CONTEXT]: '浇水周期/盆土干湿背景',
  [QUESTION_PACKAGE_TOPICS.LIGHT_CHANGE_CONTEXT]: '光照变化背景',
  [QUESTION_PACKAGE_TOPICS.FERTILIZATION_GROWTH_CONTEXT]: '施肥/生长背景',
  [QUESTION_PACKAGE_TOPICS.AIRFLOW_HUMIDITY_CONTEXT]: '通风/空气湿度背景',
  [QUESTION_PACKAGE_TOPICS.YELLOWING_PROGRESSION_SPEED]: '黄叶进展速度',
  [QUESTION_PACKAGE_TOPICS.LESION_HALO]: '病斑黄晕/边缘晕圈',
  [QUESTION_PACKAGE_TOPICS.LESION_WATER_SOAKING]: '病斑边缘水渍/半透明感',
  [QUESTION_PACKAGE_TOPICS.PROGRESSION]: '进展性',
  [QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION]: '宿主/养护确认',
  [QUESTION_PACKAGE_TOPICS.UNDERSIDE_PRESENCE]: '叶背/隐蔽部位',
  [QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE]: '分布范围',
  [QUESTION_PACKAGE_TOPICS.ROOT_ZONE_CONTEXT]: '根区/异味/根系状态',
  [QUESTION_PACKAGE_TOPICS.SUBSTRATE_MOISTURE]: '盆土湿度/排水背景',
  [QUESTION_PACKAGE_TOPICS.LIGHT_EXPOSURE]: '光照/暴晒背景',
  [QUESTION_PACKAGE_TOPICS.WATERING_CONTEXT]: '浇水/干湿背景',
  [QUESTION_PACKAGE_TOPICS.FERTILIZATION_CONTEXT]: '施肥/营养背景',
  [QUESTION_PACKAGE_TOPICS.STABILITY]: '稳定性'
}

const GENERIC_OBSERVED_PROBE_DIRECT_EVIDENCE_TOPICS = new Set([
  QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE,
  QUESTION_PACKAGE_TOPICS.PROGRESSION,
  QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
  QUESTION_PACKAGE_TOPICS.UNDERSIDE_PRESENCE,
  QUESTION_PACKAGE_TOPICS.YELLOWING_PRIMARY_CLUE_TOPIC,
  QUESTION_PACKAGE_TOPICS.YELLOWING_CARE_AREA_TOPIC,
  QUESTION_PACKAGE_TOPICS.YELLOWING_DISEASE_TRACE_TOPIC,
  QUESTION_PACKAGE_TOPICS.YELLOWING_DISTRIBUTION_PATTERN,
  QUESTION_PACKAGE_TOPICS.YELLOWING_PROGRESSION_SPEED
])

const QUESTION_PACKAGE_TOPIC_OVERRIDES = {
  q_black_spots_spreading_confirm: QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE,
  q_brown_spots_halo_confirm: QUESTION_PACKAGE_TOPICS.LESION_HALO,
  q_fungal_brown_spots_halo: QUESTION_PACKAGE_TOPICS.LESION_HALO,
  q_bacterial_halo: QUESTION_PACKAGE_TOPICS.LESION_HALO,
  q_holes_in_leaf_confirm: QUESTION_PACKAGE_TOPICS.STRUCTURAL_CAUSE,
  q_chewed_edges_confirm: QUESTION_PACKAGE_TOPICS.STRUCTURAL_CAUSE,
  q_skeletonized_leaves_confirm: QUESTION_PACKAGE_TOPICS.STRUCTURAL_CAUSE,
  q_tunnels_in_leaf_confirm: QUESTION_PACKAGE_TOPICS.LEAF_TUNNEL_PATTERN,
  q_powder_white_visible: QUESTION_PACKAGE_TOPICS.POWDER_PATTERN,
  q_sooty_mold_confirm: QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
  q_black_mold_growth_confirm: QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
  q_aphids_sooty_mold: QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
  q_scale_sooty_mold: QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
  q_whiteflies_sooty_mold: QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
  q_sticky_honeydew_confirm: QUESTION_PACKAGE_TOPICS.SURFACE_STICKINESS,
  q_aphids_sticky_honeydew: QUESTION_PACKAGE_TOPICS.SURFACE_STICKINESS,
  q_scale_honeydew: QUESTION_PACKAGE_TOPICS.SURFACE_STICKINESS,
  q_whiteflies_honeydew: QUESTION_PACKAGE_TOPICS.SURFACE_STICKINESS,
  q_bacterial_water_soaked: QUESTION_PACKAGE_TOPICS.LESION_WATER_SOAKING,
  q_root_rot_bad_smell: QUESTION_PACKAGE_TOPICS.ROOT_ZONE_CONTEXT,
  q_root_rot_black_roots: QUESTION_PACKAGE_TOPICS.ROOT_ZONE_CONTEXT,
  q_root_rot_mushy_roots: QUESTION_PACKAGE_TOPICS.ROOT_ZONE_CONTEXT,
  q_root_rot_wet_soil_wilt: QUESTION_PACKAGE_TOPICS.SUBSTRATE_MOISTURE,
  q_gnat_soil_stays_wet: QUESTION_PACKAGE_TOPICS.SUBSTRATE_MOISTURE,
  q_blackened_stem_base_bad_root_smell: QUESTION_PACKAGE_TOPICS.ROOT_ZONE_CONTEXT,
  q_stem_collapse_poor_drainage: QUESTION_PACKAGE_TOPICS.SUBSTRATE_MOISTURE,
  q_leaf_yellowing_new_growth_bias: QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
  q_iron_new_leaves_yellow: QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
  q_iron_not_old_first: QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
  q_nitrogen_old_leaves_yellow: QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
  q_nitrogen_uniform_yellow: QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE,
  q_leaf_bleaching_sunburn_patch: QUESTION_PACKAGE_TOPICS.LIGHT_EXPOSURE,
  q_underwater_dry_wilt: QUESTION_PACKAGE_TOPICS.WATERING_CONTEXT,
  q_leaf_yellowing_light_background: QUESTION_PACKAGE_TOPICS.LIGHT_EXPOSURE,
  q_leaf_yellowing_watering_background: QUESTION_PACKAGE_TOPICS.WATERING_CONTEXT,
  q_leaf_yellowing_fertilization_background: QUESTION_PACKAGE_TOPICS.FERTILIZATION_CONTEXT,
  q_yellowing_patchy_yellow_speckling: QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE,
  q_spider_stippling_visible: QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE,
  q_whiteflies_yellow_or_silver: QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE,
  q_black_spots_surface_layer_check: QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE,
  q_black_spots_tissue_moisture_check: QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE
}

const QUESTION_PACKAGE_SECTION_OVERRIDES = {
  q_black_spots_spreading_confirm: QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION,
  q_brown_spots_halo_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_fungal_brown_spots_halo: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_bacterial_halo: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_holes_in_leaf_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_chewed_edges_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_skeletonized_leaves_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_tunnels_in_leaf_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_powder_white_visible: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_sooty_mold_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_black_mold_growth_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_aphids_sooty_mold: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_scale_sooty_mold: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_whiteflies_sooty_mold: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_sticky_honeydew_confirm: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_aphids_sticky_honeydew: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_scale_honeydew: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_whiteflies_honeydew: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_bacterial_water_soaked: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_root_rot_bad_smell: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_root_rot_black_roots: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_root_rot_mushy_roots: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_root_rot_wet_soil_wilt: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_gnat_soil_stays_wet: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_blackened_stem_base_bad_root_smell: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_stem_collapse_poor_drainage: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_leaf_yellowing_new_growth_bias: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_iron_new_leaves_yellow: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_iron_not_old_first: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_nitrogen_old_leaves_yellow: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_nitrogen_uniform_yellow: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_leaf_bleaching_sunburn_patch: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_underwater_dry_wilt: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_leaf_yellowing_light_background: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_leaf_yellowing_watering_background: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_leaf_yellowing_fertilization_background: QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE,
  q_yellowing_patchy_yellow_speckling: QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION,
  q_spider_stippling_visible: QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION,
  q_whiteflies_yellow_or_silver: QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION,
  q_black_spots_surface_layer_check: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE,
  q_black_spots_tissue_moisture_check: QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE
}

const OBSERVED_VISUAL_COVERED_TOPIC_BY_SYMPTOM_KEY = {
  sooty_mold: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  black_mold_growth: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  powder_white: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  sticky_honeydew: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  black_spots_spreading: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  brown_spots_halo: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  irregular_blotches: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  chewed_edges: [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY],
  holes_in_leaf: [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY],
  skeletonized_leaves: [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY],
  water_soaked_spots: [QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE],
  water_soaked_stem: [QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE],
  soft_stem: [QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE]
}

const OBSERVED_VISUAL_COVERED_TOPIC_BY_PATTERN_KEY = {
  mold: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  powder: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  spots: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  blotch: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  blotches: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  honeydew: [QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE],
  chew: [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY],
  holes: [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY],
  skeletonization: [QUESTION_PACKAGE_TOPICS.TISSUE_INTEGRITY],
  soaked: [QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE],
  soft: [QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE]
}

function normalizeText(value = '', conservative = '') {
  const normalized = String(value || '').trim()
  return normalized || conservative
}

function normalizeQuestionPackageTopic(
  value = '',
  conservative = QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_PACKAGE_TOPICS).includes(normalized) ? normalized : conservative
}

function normalizeQuestionPackageSection(
  value = '',
  conservative = QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION
) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_PACKAGE_SECTIONS).includes(normalized) ? normalized : conservative
}

function normalizeRoutePackageRole(value = '', conservative = ROUTE_PACKAGE_ROLES.SYMPTOM_CONFIRMATION) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(ROUTE_PACKAGE_ROLES).includes(normalized) ? normalized : conservative
}

function normalizeQuestionPackageEffect(
  value = '',
  conservative = QUESTION_PACKAGE_EFFECTS.EVIDENCE_ADMISSION
) {
  const normalized = normalizeText(value).toLowerCase()
  return Object.values(QUESTION_PACKAGE_EFFECTS).includes(normalized) ? normalized : conservative
}

function inferQuestionPackageTopic(questionKey = '', targetSymptomKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (normalizedQuestionKey && QUESTION_PACKAGE_TOPIC_OVERRIDES[normalizedQuestionKey]) {
    return QUESTION_PACKAGE_TOPIC_OVERRIDES[normalizedQuestionKey]
  }

  const normalizedTargetSymptomKey = normalizeText(targetSymptomKey)
  if (normalizedTargetSymptomKey === 'water_soaked_spots') {
    return QUESTION_PACKAGE_TOPICS.TISSUE_MOISTURE
  }
  if (normalizedTargetSymptomKey === 'sooty_mold') {
    return QUESTION_PACKAGE_TOPICS.SURFACE_RESIDUE
  }

  return QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
}

function inferRoutePackageRole(packageTopic = '', packageSection = '') {
  const normalizedDimension = normalizeQuestionPackageTopic(packageTopic, '')
  const normalizedScope = normalizeQuestionPackageSection(packageSection, '')
  if (
    [
      QUESTION_PACKAGE_TOPICS.YELLOWING_PRIMARY_CLUE_TOPIC,
      QUESTION_PACKAGE_TOPICS.YELLOWING_CARE_AREA_TOPIC,
      QUESTION_PACKAGE_TOPICS.YELLOWING_DISEASE_TRACE_TOPIC
    ].includes(normalizedDimension)
  ) {
    return ROUTE_PACKAGE_ROLES.CONDITION
  }
  if (normalizedDimension === QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
    return ROUTE_PACKAGE_ROLES.SYMPTOM_CONFIRMATION
  }
  if (normalizedScope === QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE) {
    return ROUTE_PACKAGE_ROLES.DIFFERENTIAL_PROBE
  }
  if (normalizedScope === QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE) {
    return ROUTE_PACKAGE_ROLES.CONTEXT_METRIC
  }
  return ROUTE_PACKAGE_ROLES.SYMPTOM_CONFIRMATION
}

function inferQuestionPackageEffect(routePackageRole = '', packageTopic = '') {
  const normalizedRole = normalizeRoutePackageRole(routePackageRole, '')
  const normalizedDimension = normalizeQuestionPackageTopic(packageTopic, '')
  if (normalizedRole === ROUTE_PACKAGE_ROLES.CONDITION) {
    return QUESTION_PACKAGE_EFFECTS.ROUTE_CONDITION
  }
  if (normalizedRole === ROUTE_PACKAGE_ROLES.CONTEXT_METRIC) {
    return QUESTION_PACKAGE_EFFECTS.CONTEXT_FEATURE
  }
  if (normalizedRole === ROUTE_PACKAGE_ROLES.VISUAL_FACT_REVIEW) {
    return QUESTION_PACKAGE_EFFECTS.VISUAL_FACT_REVIEW
  }
  if (normalizedDimension === QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE) {
    return QUESTION_PACKAGE_EFFECTS.EVIDENCE_ADMISSION
  }
  return QUESTION_PACKAGE_EFFECTS.SCORE_ADJUSTMENT
}

function inferQuestionPackageSection(questionKey = '', targetSymptomKey = '') {
  const normalizedQuestionKey = normalizeText(questionKey)
  if (normalizedQuestionKey && QUESTION_PACKAGE_SECTION_OVERRIDES[normalizedQuestionKey]) {
    return QUESTION_PACKAGE_SECTION_OVERRIDES[normalizedQuestionKey]
  }

  const packageTopic = inferQuestionPackageTopic(questionKey, targetSymptomKey)
  if (
    [
      QUESTION_PACKAGE_TOPICS.PROGRESSION,
      QUESTION_PACKAGE_TOPICS.HOST_CONFIRMATION,
      QUESTION_PACKAGE_TOPICS.DISTRIBUTION_SCOPE,
      QUESTION_PACKAGE_TOPICS.LIGHT_EXPOSURE,
      QUESTION_PACKAGE_TOPICS.WATERING_CONTEXT,
      QUESTION_PACKAGE_TOPICS.FERTILIZATION_CONTEXT,
      QUESTION_PACKAGE_TOPICS.ROOT_ZONE_CONTEXT,
      QUESTION_PACKAGE_TOPICS.SUBSTRATE_MOISTURE,
      QUESTION_PACKAGE_TOPICS.STABILITY
    ].includes(packageTopic)
  ) {
    return QUESTION_PACKAGE_SECTIONS.CONTEXT_PROBE
  }
  return packageTopic === QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE
    ? QUESTION_PACKAGE_SECTIONS.SYMPTOM_CONFIRMATION
    : QUESTION_PACKAGE_SECTIONS.DIFFERENTIAL_PROBE
}

function inferObservedVisualCoveredTopics({ symptomKey = '', patternKey = '' } = {}) {
  const coveredTopics = new Set([QUESTION_PACKAGE_TOPICS.VISUAL_PRESENCE])
  const normalizedSymptomKey = normalizeText(symptomKey).toLowerCase()
  const normalizedPatternKey = normalizeText(patternKey).toLowerCase()

  const symptomDimensions =
    OBSERVED_VISUAL_COVERED_TOPIC_BY_SYMPTOM_KEY[normalizedSymptomKey] || []
  const patternDimensions =
    OBSERVED_VISUAL_COVERED_TOPIC_BY_PATTERN_KEY[normalizedPatternKey] || []

  for (const packageTopic of [...symptomDimensions, ...patternDimensions]) {
    coveredTopics.add(packageTopic)
  }

  return Array.from(coveredTopics)
}

function resolveQuestionPackageTopicLabel(packageTopic = '') {
  const normalized = normalizeQuestionPackageTopic(packageTopic)
  return (
    QUESTION_PACKAGE_TOPIC_LABELS[normalized] || QUESTION_PACKAGE_TOPIC_LABELS.visual_presence
  )
}

function isGenericObservedProbeDirectEvidenceDimension(packageTopic = '') {
  const normalized = normalizeQuestionPackageTopic(packageTopic, '')
  return GENERIC_OBSERVED_PROBE_DIRECT_EVIDENCE_TOPICS.has(normalized)
}

module.exports = {
  QUESTION_PACKAGE_TOPICS,
  QUESTION_PACKAGE_SECTIONS,
  ROUTE_PACKAGE_ROLES,
  QUESTION_PACKAGE_EFFECTS,
  GENERIC_OBSERVED_PROBE_DIRECT_EVIDENCE_TOPICS,
  normalizeQuestionPackageTopic,
  normalizeQuestionPackageSection,
  normalizeRoutePackageRole,
  normalizeQuestionPackageEffect,
  inferQuestionPackageTopic,
  inferQuestionPackageSection,
  inferRoutePackageRole,
  inferQuestionPackageEffect,
  inferObservedVisualCoveredTopics,
  resolveQuestionPackageTopicLabel,
  isGenericObservedProbeDirectEvidenceDimension
}
