'use strict'

const crypto = require('crypto')

const DATA_SOURCE_CONFIGS = {
  diagnosis: {
    source: 'diagnosis',
    fileType: 'xlsx',
    defaultFilePath: 'docs/plants_v13_user_friendly_full_v7.xlsx'
  },
  taxonomy: {
    source: 'taxonomy',
    fileType: 'csv',
    defaultFilePath: 'docs/plant_catalog.csv',
    hasHeader: false
  },
  'genus-care': {
    source: 'genus-care',
    fileType: 'csv',
    defaultFilePath: 'docs/genus_care_profile.csv',
    hasHeader: false
  }
}

const RAW_PLANT_CATALOG_COLUMNS = [
  'legacy_plant_id',
  'primary_display_name',
  'cover_image_ref',
  'basic_description',
  'category_name_cn',
  'category_name_en',
  'scientific_name',
  'family_name_cn',
  'family_name_canonical',
  'genus_name',
  'legacy_status_flag',
  'legacy_reserved_field',
  'created_at',
  'updated_at'
]

const RAW_GENUS_CARE_COLUMNS = [
  'genus_name',
  'family_name_canonical_raw',
  'plant_category',
  'watering_strategy_json',
  'fertilizing_strategy_json',
  'light_strategy_json',
  'airflow_strategy_json',
  'temp_min_c',
  'temp_max_c',
  'humidity_min',
  'humidity_max',
  'toxicity_level',
  'review_status',
  'source_evidence',
  'baseline_note',
  'evidence_level',
  'evidence_strategy',
  'reserved_field',
  'created_at',
  'updated_at'
]

const GENUS_CARE_FAMILY_OVERRIDES = {
  Crassulaceae: 'Crassulaceae',
  Dianthus: 'Caryophyllaceae',
  Gardenia: 'Rubiaceae',
  Rosa: 'Rosaceae'
}

function normalizePrimitive(value) {
  if (value === undefined || value === null) return null

  const normalized = String(value).trim()
  if (!normalized || normalized.toLowerCase() === 'null') {
    return null
  }

  return normalized
}

function buildStableId(prefix, values = []) {
  const seed = values.map(item => normalizePrimitive(item) || '').join('||')
  const hash = crypto.createHash('sha1').update(seed).digest('hex').slice(0, 16)
  return `${prefix}_${hash}`
}

function normalizeMatchKey(value) {
  const normalized = normalizePrimitive(value)
  if (!normalized) return null

  return normalized
    .toLowerCase()
    .replace(/[’'"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function inferIdentityLevel(scientificName, genusName) {
  const normalizedScientificName = normalizePrimitive(scientificName)
  const normalizedGenusName = normalizePrimitive(genusName)

  if (!normalizedScientificName) return 'unknown'
  if (!normalizedGenusName) return 'unknown'
  if (normalizedScientificName === normalizedGenusName) return 'genus'
  if (/\bspp\.?$/i.test(normalizedScientificName)) return 'genus'
  if (!/\s/.test(normalizedScientificName)) return 'genus'
  return 'species'
}

function extractSpeciesName(scientificName, genusName, identityLevel) {
  if (identityLevel !== 'species') return null

  const normalizedScientificName = normalizePrimitive(scientificName)
  const normalizedGenusName = normalizePrimitive(genusName)
  if (!normalizedScientificName || !normalizedGenusName) return null

  const prefix = `${normalizedGenusName} `
  if (!normalizedScientificName.startsWith(prefix)) return null

  return normalizedScientificName.slice(prefix.length).trim() || null
}

function buildCatalogContext(rawRow = {}) {
  const scientificName = normalizePrimitive(rawRow.scientific_name)
  const primaryDisplayName = normalizePrimitive(rawRow.primary_display_name)
  const genusName = normalizePrimitive(rawRow.genus_name)
  const identityLevel = inferIdentityLevel(scientificName, genusName)
  const plantIdentityId = buildStableId('plant_identity', [
    rawRow.legacy_plant_id,
    scientificName || primaryDisplayName,
    identityLevel
  ])

  return {
    plantIdentityId,
    scientificName,
    primaryDisplayName,
    genusName,
    identityLevel,
    familyNameCanonical: normalizePrimitive(rawRow.family_name_canonical),
    familyNameCn: normalizePrimitive(rawRow.family_name_cn),
    categoryNameCn: normalizePrimitive(rawRow.category_name_cn),
    categoryNameEn: normalizePrimitive(rawRow.category_name_en),
    basicDescription: normalizePrimitive(rawRow.basic_description),
    coverImageRef: normalizePrimitive(rawRow.cover_image_ref),
    createdAt: normalizePrimitive(rawRow.created_at),
    updatedAt: normalizePrimitive(rawRow.updated_at)
  }
}

function mapPlantIdentityEntity(rawRow = {}) {
  const context = buildCatalogContext(rawRow)

  return {
    plant_identity_id: context.plantIdentityId,
    legacy_plant_id: normalizePrimitive(rawRow.legacy_plant_id),
    canonical_identity_name: context.scientificName || context.primaryDisplayName,
    canonical_identity_name_cn: context.primaryDisplayName,
    canonical_identity_name_en: context.scientificName,
    primary_display_name: context.primaryDisplayName || context.scientificName,
    identity_level: context.identityLevel,
    family_name_canonical: context.familyNameCanonical,
    family_name_cn: context.familyNameCn,
    family_name_en: context.familyNameCanonical,
    genus_name: context.genusName,
    species_name: extractSpeciesName(
      context.scientificName,
      context.genusName,
      context.identityLevel
    ),
    scientific_name: context.scientificName,
    category_name_cn: context.categoryNameCn,
    category_name_en: context.categoryNameEn,
    basic_description: context.basicDescription,
    cover_image_ref: context.coverImageRef,
    is_active: 1,
    review_status: 'pending',
    data_source: 'plant_catalog.csv',
    version: null,
    created_at: context.createdAt,
    updated_at: context.updatedAt,
    retired_at: null,
    replacement_identity_id: null
  }
}

function mapPlantIdentityAliases(rawRow = {}) {
  const context = buildCatalogContext(rawRow)
  const aliasSpecs = [
    {
      alias_name: context.primaryDisplayName,
      alias_type: 'common_name',
      is_preferred_search_alias: 1
    },
    {
      alias_name: context.scientificName,
      alias_type: 'standard_alias',
      is_preferred_search_alias: 1
    }
  ]

  const deduped = new Map()
  for (const aliasSpec of aliasSpecs) {
    const aliasName = normalizePrimitive(aliasSpec.alias_name)
    if (!aliasName) continue
    const key = `${aliasSpec.alias_type}::${aliasName}`
    if (deduped.has(key)) continue

    deduped.set(key, {
      alias_id: buildStableId('alias', [
        context.plantIdentityId,
        aliasSpec.alias_type,
        aliasName
      ]),
      plant_identity_id: context.plantIdentityId,
      alias_name: aliasName,
      alias_type: aliasSpec.alias_type,
      is_preferred_search_alias: aliasSpec.is_preferred_search_alias,
      source_name: 'plant_catalog.csv',
      is_active: 1,
      created_at: context.createdAt
    })
  }

  return Array.from(deduped.values())
}

function mapPlantIdentityMatchRules(rawRow = {}) {
  const context = buildCatalogContext(rawRow)
  const matchSpecs = [
    {
      raw_value: context.primaryDisplayName,
      match_rule_type: 'primary_display_name',
      match_strength: 'strong'
    },
    {
      raw_value: context.scientificName,
      match_rule_type: 'scientific_name',
      match_strength: 'strong'
    }
  ]

  const deduped = new Map()
  for (const matchSpec of matchSpecs) {
    const matchKey = normalizeMatchKey(matchSpec.raw_value)
    if (!matchKey) continue
    const dedupeKey = `${matchSpec.match_rule_type}::${matchKey}`
    if (deduped.has(dedupeKey)) continue

    deduped.set(dedupeKey, {
      match_rule_id: buildStableId('match_rule', [
        context.plantIdentityId,
        matchSpec.match_rule_type,
        matchKey
      ]),
      plant_identity_id: context.plantIdentityId,
      match_key: matchKey,
      match_rule_type: matchSpec.match_rule_type,
      match_strength: matchSpec.match_strength,
      source_name: 'plant_catalog.csv',
      is_active: 1
    })
  }

  return Array.from(deduped.values())
}

function mapPlantIdentityDiagnosisLinks(rawRow = {}) {
  const context = buildCatalogContext(rawRow)
  const rows = []
  const legacyPlantId = normalizePrimitive(rawRow.legacy_plant_id)

  if (context.plantIdentityId && legacyPlantId) {
    rows.push({
      link_id: buildStableId('diagnosis_link', [
        context.plantIdentityId,
        'identity',
        'plant_problem_profiles',
        legacyPlantId
      ]),
      plant_identity_id: context.plantIdentityId,
      link_level: 'identity',
      target_profile_key: legacyPlantId,
      target_table_name: 'plant_problem_profiles',
      target_record_key: `plant_id:${legacyPlantId}`,
      link_strength: 'exact',
      review_status: 'reviewed',
      is_active: 1,
      created_at: context.createdAt,
      updated_at: context.updatedAt
    })
  }

  if (context.plantIdentityId && context.genusName) {
    rows.push({
      link_id: buildStableId('diagnosis_link', [
        context.plantIdentityId,
        'genus',
        'genus_problem_profiles',
        context.genusName
      ]),
      plant_identity_id: context.plantIdentityId,
      link_level: 'genus',
      target_profile_key: context.genusName,
      target_table_name: 'genus_problem_profiles',
      target_record_key: `genus:${context.genusName}`,
      link_strength: 'downgraded',
      review_status: 'reviewed',
      is_active: 1,
      created_at: context.createdAt,
      updated_at: context.updatedAt
    })
  }

  if (context.plantIdentityId && context.familyNameCanonical) {
    rows.push({
      link_id: buildStableId('diagnosis_link', [
        context.plantIdentityId,
        'family',
        'problem_host_profiles',
        context.familyNameCanonical
      ]),
      plant_identity_id: context.plantIdentityId,
      link_level: 'family',
      target_profile_key: context.familyNameCanonical,
      target_table_name: 'problem_host_profiles',
      target_record_key: `family:${context.familyNameCanonical}`,
      link_strength: 'weak_background',
      review_status: 'reviewed',
      is_active: 1,
      created_at: context.createdAt,
      updated_at: context.updatedAt
    })
  }

  return rows
}

function mapGenusCareProfile(rawRow = {}) {
  const genusName = normalizePrimitive(rawRow.genus_name)
  const familyNameCanonical =
    normalizePrimitive(rawRow.family_name_canonical_raw) ||
    GENUS_CARE_FAMILY_OVERRIDES[genusName] ||
    null

  return {
    genus_care_profile_id: buildStableId('genus_care', [
      genusName,
      familyNameCanonical
    ]),
    genus_name: genusName,
    family_name_canonical: familyNameCanonical,
    family_name_cn: null,
    family_name_en: familyNameCanonical,
    genus_id: null,
    genus_identity_id: null,
    plant_category: normalizePrimitive(rawRow.plant_category),
    watering_strategy_json: rawRow.watering_strategy_json,
    fertilizing_strategy_json: rawRow.fertilizing_strategy_json,
    light_strategy_json: rawRow.light_strategy_json,
    airflow_strategy_json: rawRow.airflow_strategy_json,
    temp_min_c: rawRow.temp_min_c,
    temp_max_c: rawRow.temp_max_c,
    humidity_min: rawRow.humidity_min,
    humidity_max: rawRow.humidity_max,
    toxicity_level: normalizePrimitive(rawRow.toxicity_level),
    review_status: normalizePrimitive(rawRow.review_status) || 'pending',
    source_evidence: normalizePrimitive(rawRow.source_evidence),
    baseline_note: normalizePrimitive(rawRow.baseline_note),
    evidence_level: normalizePrimitive(rawRow.evidence_level),
    evidence_strategy: normalizePrimitive(rawRow.evidence_strategy),
    data_source: 'genus_care_profile.csv',
    version: null,
    is_active: normalizePrimitive(rawRow.review_status) === 'retired' ? 0 : 1,
    created_at: normalizePrimitive(rawRow.created_at),
    updated_at: normalizePrimitive(rawRow.updated_at),
    retired_at: null,
    replacement_profile_id: null
  }
}

function identityRowMapper(row = {}) {
  return row
}

const TABLE_CONFIGS = [
  {
    table: 'plant_identity_entities',
    source: 'taxonomy',
    keys: ['plant_identity_id'],
    inputColumns: RAW_PLANT_CATALOG_COLUMNS,
    columns: [
      'plant_identity_id',
      'legacy_plant_id',
      'canonical_identity_name',
      'canonical_identity_name_cn',
      'canonical_identity_name_en',
      'primary_display_name',
      'identity_level',
      'family_name_canonical',
      'family_name_cn',
      'family_name_en',
      'genus_name',
      'species_name',
      'scientific_name',
      'category_name_cn',
      'category_name_en',
      'basic_description',
      'cover_image_ref',
      'is_active',
      'review_status',
      'data_source',
      'version',
      'created_at',
      'updated_at',
      'retired_at',
      'replacement_identity_id'
    ],
    numericColumns: ['is_active'],
    jsonColumns: [],
    rowMapper: mapPlantIdentityEntity
  },
  {
    table: 'plant_identity_aliases',
    source: 'taxonomy',
    keys: ['plant_identity_id', 'alias_name', 'alias_type'],
    inputColumns: RAW_PLANT_CATALOG_COLUMNS,
    columns: [
      'alias_id',
      'plant_identity_id',
      'alias_name',
      'alias_type',
      'is_preferred_search_alias',
      'source_name',
      'is_active',
      'created_at'
    ],
    numericColumns: ['is_preferred_search_alias', 'is_active'],
    jsonColumns: [],
    rowMapper: mapPlantIdentityAliases
  },
  {
    table: 'plant_identity_match_rules',
    source: 'taxonomy',
    keys: ['plant_identity_id', 'match_key', 'match_rule_type'],
    inputColumns: RAW_PLANT_CATALOG_COLUMNS,
    columns: [
      'match_rule_id',
      'plant_identity_id',
      'match_key',
      'match_rule_type',
      'match_strength',
      'source_name',
      'is_active'
    ],
    numericColumns: ['is_active'],
    jsonColumns: [],
    rowMapper: mapPlantIdentityMatchRules
  },
  {
    table: 'plant_identity_diagnosis_links',
    source: 'taxonomy',
    keys: ['plant_identity_id', 'link_level', 'target_table_name', 'target_record_key'],
    inputColumns: RAW_PLANT_CATALOG_COLUMNS,
    columns: [
      'link_id',
      'plant_identity_id',
      'link_level',
      'target_profile_key',
      'target_table_name',
      'target_record_key',
      'link_strength',
      'review_status',
      'is_active',
      'created_at',
      'updated_at'
    ],
    numericColumns: ['is_active'],
    jsonColumns: [],
    rowMapper: mapPlantIdentityDiagnosisLinks
  },
  {
    table: 'genus_care_profiles',
    source: 'genus-care',
    keys: ['genus_name', 'family_name_canonical'],
    inputColumns: RAW_GENUS_CARE_COLUMNS,
    columns: [
      'genus_care_profile_id',
      'genus_name',
      'family_name_canonical',
      'family_name_cn',
      'family_name_en',
      'genus_id',
      'genus_identity_id',
      'plant_category',
      'watering_strategy_json',
      'fertilizing_strategy_json',
      'light_strategy_json',
      'airflow_strategy_json',
      'temp_min_c',
      'temp_max_c',
      'humidity_min',
      'humidity_max',
      'toxicity_level',
      'review_status',
      'source_evidence',
      'baseline_note',
      'evidence_level',
      'evidence_strategy',
      'data_source',
      'version',
      'is_active',
      'created_at',
      'updated_at',
      'retired_at',
      'replacement_profile_id'
    ],
    numericColumns: [
      'temp_min_c',
      'temp_max_c',
      'humidity_min',
      'humidity_max',
      'is_active'
    ],
    jsonColumns: [
      'watering_strategy_json',
      'fertilizing_strategy_json',
      'light_strategy_json',
      'airflow_strategy_json'
    ],
    rowMapper: mapGenusCareProfile
  },
  {
    table: 'problems',
    source: 'diagnosis',
    sheet: 'problems',
    keys: ['problem_key'],
    inputColumns: [
      'problem_key',
      'problem_name',
      'problem_cn',
      'problem_type',
      'problem_role',
      'definition',
      'definition_audited',
      'default_action',
      'default_action_audited',
      'default_prevention',
      'default_prevention_audited',
      'data_status',
      'data_source',
      'audit_note',
      'display_name_cn',
      'user_definition_cn',
      'user_action_cn',
      'user_prevention_cn',
      'severity_hint_cn',
      'urgency_hint_cn',
      'first_check_cn',
      'avoid_cn'
    ],
    columns: [
      'problem_key',
      'problem_name',
      'problem_cn',
      'problem_type',
      'problem_role',
      'definition',
      'definition_audited',
      'default_action',
      'default_action_audited',
      'default_prevention',
      'default_prevention_audited',
      'data_status',
      'data_source',
      'audit_note',
      'display_name_cn',
      'user_definition_cn',
      'user_action_cn',
      'user_prevention_cn',
      'severity_hint_cn',
      'urgency_hint_cn',
      'first_check_cn',
      'avoid_cn'
    ],
    numericColumns: [],
    jsonColumns: [],
    rowMapper: identityRowMapper
  },
  {
    table: 'symptoms',
    source: 'diagnosis',
    sheet: 'symptoms',
    keys: ['symptom_key'],
    inputColumns: [
      'symptom_key',
      'symptom_cn',
      'location_key',
      'pattern_key',
      'distribution_key',
      'severity_hint',
      'symptom_type',
      'signal_reliability',
      'ai_visual_pool',
      'data_status',
      'data_source',
      'note',
      'display_text_cn',
      'user_observation_tip_cn',
      'confusion_note_cn'
    ],
    columns: [
      'symptom_key',
      'symptom_cn',
      'location_key',
      'pattern_key',
      'distribution_key',
      'severity_hint',
      'symptom_type',
      'signal_reliability',
      'ai_visual_pool',
      'data_status',
      'data_source',
      'note',
      'display_text_cn',
      'user_observation_tip_cn',
      'confusion_note_cn'
    ],
    numericColumns: ['signal_reliability'],
    jsonColumns: ['ai_visual_pool'],
    rowMapper: identityRowMapper
  },
  {
    table: 'plant_problem_profiles',
    source: 'diagnosis',
    sheet: 'plant_problem_profiles',
    keys: ['plant_id', 'problem_key'],
    inputColumns: [
      'id',
      'plant_id',
      'genus',
      'family',
      'category',
      'problem_key',
      'genus_compatibility',
      'host_compatibility',
      'final_prior_score',
      'matched_host_level',
      'source_layer',
      'data_status'
    ],
    columns: [
      'id',
      'plant_id',
      'genus',
      'family',
      'category',
      'problem_key',
      'genus_compatibility',
      'host_compatibility',
      'final_prior_score',
      'matched_host_level',
      'source_layer',
      'data_status'
    ],
    numericColumns: [
      'genus_compatibility',
      'host_compatibility',
      'final_prior_score'
    ],
    jsonColumns: [],
    rowMapper: identityRowMapper
  },
  {
    table: 'question_library_v5_real',
    source: 'diagnosis',
    sheet: 'question_library_v5_real',
    keys: ['question_key'],
    inputColumns: [
      'question_key',
      'question_text_cn',
      'question_type',
      'target_symptom_key',
      'question_group_key',
      'question_level',
      'observability',
      'target_dimension',
      'routing_scope',
      'allow_unknown',
      'priority',
      'data_status',
      'data_source',
      'note',
      'question_text_user_cn',
      'help_text_cn',
      'why_this_question_cn'
    ],
    columns: [
      'question_key',
      'question_text_cn',
      'question_type',
      'target_symptom_key',
      'question_group_key',
      'question_level',
      'observability',
      'target_dimension',
      'routing_scope',
      'allow_unknown',
      'priority',
      'data_status',
      'data_source',
      'note',
      'question_text_user_cn',
      'help_text_cn',
      'why_this_question_cn'
    ],
    numericColumns: ['question_level', 'allow_unknown', 'priority'],
    jsonColumns: [],
    rowMapper: identityRowMapper
  },
  {
    table: 'question_option_mapping_v5_real',
    source: 'diagnosis',
    sheet: 'question_option_mapping_v5_real',
    keys: ['question_key', 'option_key'],
    inputColumns: [
      'question_key',
      'option_key',
      'option_text_cn',
      'maps_to_symptom_key',
      'value',
      'association_strength',
      'data_status',
      'data_source',
      'note',
      'option_text_user_cn',
      'answer_effect_cn'
    ],
    columns: [
      'question_key',
      'option_key',
      'option_text_cn',
      'maps_to_symptom_key',
      'value',
      'association_strength',
      'data_status',
      'data_source',
      'note',
      'option_text_user_cn',
      'answer_effect_cn'
    ],
    numericColumns: ['value', 'association_strength'],
    jsonColumns: [],
    rowMapper: identityRowMapper
  },
  {
    table: 'diagnosis_result_explanations',
    source: 'diagnosis',
    sheet: 'diagnosis_result_explanations',
    keys: ['problem_key'],
    inputColumns: [
      'problem_key',
      'display_name_cn',
      'result_summary_cn',
      'why_it_happens_cn',
      'what_to_check_next_cn',
      'first_aid_cn',
      'avoid_cn',
      'reassurance_cn'
    ],
    columns: [
      'problem_key',
      'display_name_cn',
      'result_summary_cn',
      'why_it_happens_cn',
      'what_to_check_next_cn',
      'first_aid_cn',
      'avoid_cn',
      'reassurance_cn'
    ],
    numericColumns: [],
    jsonColumns: [],
    rowMapper: identityRowMapper
  },
  {
    table: 'diagnosis_batch_reviews',
    source: 'diagnosis',
    sheet: 'diagnosis_batch_reviews',
    keys: ['diagnosis_id'],
    inputColumns: [
      'diagnosis_id',
      'batch_source',
      'source_schema',
      'batch_generated_at',
      'sample_label',
      'sample_file_name',
      'sample_absolute_path',
      'answer_path_signature',
      'answer_path_json',
      'rounds_used',
      'question_count',
      'observed_evidence_count',
      'diagnosis_direction_labels_json'
    ],
    columns: [
      'diagnosis_id',
      'batch_source',
      'source_schema',
      'batch_generated_at',
      'sample_label',
      'sample_file_name',
      'sample_absolute_path',
      'answer_path_signature',
      'answer_path_json',
      'rounds_used',
      'question_count',
      'observed_evidence_count',
      'diagnosis_direction_labels_json'
    ],
    numericColumns: ['rounds_used', 'question_count', 'observed_evidence_count'],
    jsonColumns: ['answer_path_json', 'diagnosis_direction_labels_json'],
    rowMapper: identityRowMapper
  }
]

const TABLE_CONFIG_MAP = Object.fromEntries(TABLE_CONFIGS.map(item => [item.table, item]))

const METADATA_COLUMNS = [
  'source_type',
  'source_batch_id',
  'version_tag',
  'version',
  'row_hash',
  'review_status',
  'review_note',
  'is_active',
  'created_at',
  'updated_at',
  'published_at',
  'published_batch_id'
]

module.exports = {
  DATA_SOURCE_CONFIGS,
  RAW_GENUS_CARE_COLUMNS,
  RAW_PLANT_CATALOG_COLUMNS,
  TABLE_CONFIGS,
  TABLE_CONFIG_MAP,
  METADATA_COLUMNS
}
