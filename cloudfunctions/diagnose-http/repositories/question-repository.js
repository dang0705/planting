'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const {
  normalizeQuestionTargetDimension,
  normalizeQuestionRoutingScope,
  normalizeQuestionRole,
  normalizeQuestionEffectMode,
  inferQuestionTargetDimension,
  inferQuestionRoutingScope,
  inferQuestionRole,
  inferQuestionEffectMode
} = require('../utils/question-target-dimension')

function mapQuestionRow(row = {}) {
  const questionKey = row.question_key || ''
  const targetSymptomKey = row.target_symptom_key || ''
  const targetDimension = normalizeQuestionTargetDimension(
    row.target_dimension,
    inferQuestionTargetDimension(questionKey, targetSymptomKey)
  )
  const routingScope = normalizeQuestionRoutingScope(
    row.routing_scope,
    inferQuestionRoutingScope(questionKey, targetSymptomKey)
  )
  const questionRole = normalizeQuestionRole(
    row.question_role,
    inferQuestionRole(targetDimension, routingScope)
  )

  return {
    questionKey,
    questionTextCn: row.question_text_cn || '',
    questionTextUserCn: row.question_text_user_cn || row.question_text_cn || '',
    questionType: row.question_type || 'single_choice',
    targetSymptomKey,
    questionGroupKey: row.question_group_key || '',
    questionLevel: Number(row.question_level || 1),
    observability: row.observability || 'medium',
    targetDimension,
    routingScope,
    questionRole,
    effectMode: normalizeQuestionEffectMode(
      row.effect_mode,
      inferQuestionEffectMode(questionRole, targetDimension)
    ),
    allowUnknown: Number(row.allow_unknown || 0) === 1,
    priority: Number(row.priority || 0),
    helpTextCn: row.help_text_cn || '',
    whyThisQuestionCn: row.why_this_question_cn || '',
    defaultOptionKey: row.default_option_key || '',
    uiVariant: row.ui_variant || '',
    renderMode: row.render_mode || '',
    templateEngineRuleKey: row.template_engine_rule_key || '',
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

function mapOptionRow(row = {}) {
  const directProblemAdjustments = resolveAuditedDirectProblemAdjustments(
    row.question_key,
    row.option_key
  )

  return {
    questionKey: row.question_key,
    optionKey: row.option_key,
    optionTextCn: row.option_text_cn || row.option_text_user_cn || row.option_key,
    optionTextUserCn: row.option_text_user_cn || row.option_text_cn || row.option_key,
    mapsToSymptomKey: row.maps_to_symptom_key || '',
    value: Number(row.value || 0),
    associationStrength: clamp01(row.association_strength),
    answerEffectCn: row.answer_effect_cn || '',
    optionDescriptionUserCn: row.option_description_user_cn || '',
    displayOrder: Number(row.display_order || 0),
    isDefault: Number(row.is_default || 0) === 1,
    directProblemAdjustments,
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

const AUDITED_DIRECT_PROBLEM_ADJUSTMENTS = {
  q_gnat_soil_stays_wet: {
    yes: [
      { problemKey: 'overwatering', scoreDelta: 0.18 }
    ]
  },
  q_stem_collapse_poor_drainage: {
    yes: [
      { problemKey: 'soft_rot', scoreDelta: 0.16 },
      { problemKey: 'crown_rot', scoreDelta: 0.12 },
      { problemKey: 'root_rot', scoreDelta: 0.1 },
      { problemKey: 'overwatering', scoreDelta: 0.1 }
    ],
    no: [
      { problemKey: 'soft_rot', scoreDelta: -0.08 },
      { problemKey: 'crown_rot', scoreDelta: -0.08 },
      { problemKey: 'root_rot', scoreDelta: -0.06 }
    ]
  },
  q_root_rot_bad_smell: {
    yes: [
      { problemKey: 'root_rot', scoreDelta: 0.28 },
      { problemKey: 'soft_rot', scoreDelta: 0.22 },
      { problemKey: 'crown_rot', scoreDelta: 0.2 }
    ],
    no: [
      { problemKey: 'root_rot', scoreDelta: -0.08 },
      { problemKey: 'soft_rot', scoreDelta: -0.08 },
      { problemKey: 'crown_rot', scoreDelta: -0.06 }
    ]
  },
  q_root_rot_black_roots: {
    yes: [
      { problemKey: 'root_rot', scoreDelta: 0.24 },
      { problemKey: 'root_stress', scoreDelta: 0.14 },
      { problemKey: 'soft_rot', scoreDelta: 0.08 }
    ],
    no: [
      { problemKey: 'root_rot', scoreDelta: -0.08 }
    ]
  },
  q_root_rot_mushy_roots: {
    yes: [
      { problemKey: 'root_rot', scoreDelta: 0.28 },
      { problemKey: 'soft_rot', scoreDelta: 0.18 },
      { problemKey: 'crown_rot', scoreDelta: 0.1 }
    ],
    no: [
      { problemKey: 'root_rot', scoreDelta: -0.08 },
      { problemKey: 'soft_rot', scoreDelta: -0.06 }
    ]
  },
  q_black_spots_surface_layer_check: {
    embedded: [
      { problemKey: 'fungal_leaf_spot', scoreDelta: 0.2 },
      { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.18 },
      { problemKey: 'sooty_mold_associated_pests', scoreDelta: -0.2 }
    ],
    surface: [
      { problemKey: 'sooty_mold_associated_pests', scoreDelta: 0.22 },
      { problemKey: 'fungal_leaf_spot', scoreDelta: -0.16 },
      { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.14 }
    ]
  },
  q_black_spots_tissue_moisture_check: {
    dry_firm: [
      { problemKey: 'fungal_leaf_spot', scoreDelta: 0.18 },
      { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.12 },
      { problemKey: 'edema', scoreDelta: -0.08 },
      { problemKey: 'fungus_gnat', scoreDelta: -0.1 }
    ],
    soft_wet: [
      { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.24 },
      { problemKey: 'edema', scoreDelta: 0.18 },
      { problemKey: 'fungal_leaf_spot', scoreDelta: -0.14 }
    ]
  },
  q_brown_spots_halo_confirm: {
    yes: [
      { problemKey: 'bacterial_leaf_spot', scoreDelta: 0.2 },
      { problemKey: 'fungal_leaf_spot', scoreDelta: 0.1 }
    ],
    no: [
      { problemKey: 'fungal_leaf_spot', scoreDelta: 0.12 },
      { problemKey: 'bacterial_leaf_spot', scoreDelta: -0.14 }
    ]
  }
}

function resolveAuditedDirectProblemAdjustments(questionKey = '', optionKey = '') {
  const questionAdjustments = AUDITED_DIRECT_PROBLEM_ADJUSTMENTS[String(questionKey || '').trim()]
  if (!questionAdjustments) {return []}
  const optionAdjustments = questionAdjustments[String(optionKey || '').trim()]
  if (!Array.isArray(optionAdjustments)) {return []}

  return optionAdjustments.map(item => ({
    problemKey: String(item?.problemKey || '').trim(),
    scoreDelta: Number(item?.scoreDelta || 0)
  })).filter(item => item.problemKey && Number.isFinite(item.scoreDelta) && item.scoreDelta !== 0)
}

const STATIC_REPOSITORY_CACHE_TTL_MS = Math.max(
  0,
  Number(process.env.DIAGNOSE_STATIC_CACHE_TTL_MS || 60000)
)
const staticCache = {
  strategiesByProblemKey: new Map(),
  questionsByKey: new Map(),
  questionsByGroupKey: new Map(),
  optionMappingsByQuestionKey: new Map(),
  questionKeysByTargetSymptomKey: new Map(),
  preloadExpiresAt: 0
}
const pendingStaticCache = new Map()

function getCached(cache, key = '') {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return null}
  const entry = cache.get(String(key || '').trim())
  if (!entry) {return null}
  if (Date.now() - Number(entry.cachedAt || 0) > STATIC_REPOSITORY_CACHE_TTL_MS) {
    cache.delete(String(key || '').trim())
    return null
  }
  return entry.value
}

function setCached(cache, key = '', value) {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return}
  cache.set(String(key || '').trim(), {
    cachedAt: Date.now(),
    value
  })
}

function withPendingStaticQuery(key = '', loader) {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey) {
    return loader()
  }
  if (pendingStaticCache.has(normalizedKey)) {
    return pendingStaticCache.get(normalizedKey)
  }
  const promise = Promise.resolve()
    .then(loader)
    .finally(() => {
      pendingStaticCache.delete(normalizedKey)
    })
  pendingStaticCache.set(normalizedKey, promise)
  return promise
}

async function preloadQuestionRepositoryCache() {
  if (!STATIC_REPOSITORY_CACHE_TTL_MS) {return}
  const now = Date.now()
  if (staticCache.preloadExpiresAt > now) {return}

  await withPendingStaticQuery('preloadQuestionRepositoryCache:all', async () => {
    const refreshedNow = Date.now()
    if (staticCache.preloadExpiresAt > refreshedNow) {return}

    const [strategyResult, questionResult, optionResult] = await Promise.all([
      models.$runSQL(
        `
          SELECT
            problem_key,
            question_group_key,
            question_key,
            priority_score,
            trigger_type,
            strategy_note_cn,
            data_status,
            review_status
          FROM ${table('question_strategy_v5_real')}
          WHERE data_status = 'audited'
            AND review_status = 'audited'
          ORDER BY priority_score DESC, question_key ASC
        `,
        {}
      ),
      models.$runSQL(
        `
          SELECT
            question_key,
            question_text_cn,
            question_text_user_cn,
            question_type,
            target_symptom_key,
            question_group_key,
            question_level,
            observability,
            target_dimension,
            routing_scope,
            question_role,
            effect_mode,
            allow_unknown,
            priority,
            help_text_cn,
            why_this_question_cn,
            default_option_key,
            ui_variant,
            render_mode,
            template_engine_rule_key,
            data_status,
            review_status
          FROM ${table('question_library_v5_real')}
          WHERE data_status IN ('audited', 'partial')
            AND review_status IN ('audited', 'partial')
          ORDER BY priority DESC, question_key ASC
        `,
        {}
      ),
      models.$runSQL(
        `
          SELECT
            question_key,
            option_key,
            option_text_cn,
            option_text_user_cn,
            maps_to_symptom_key,
            value,
            association_strength,
            answer_effect_cn,
            option_description_user_cn,
            display_order,
            is_default,
            data_status,
            review_status
          FROM ${table('question_option_mapping_v5_real')}
          WHERE data_status = 'audited'
            AND review_status = 'audited'
          ORDER BY question_key ASC, COALESCE(display_order, 9999) ASC, option_key ASC
        `,
        {}
      )
    ])

    const strategiesByProblem = new Map()
    for (const row of (strategyResult?.data?.executeResultList || []).map(mapStrategyRow)) {
      const key = String(row.problemKey || '').trim()
      if (!key) {continue}
      if (!strategiesByProblem.has(key)) {strategiesByProblem.set(key, [])}
      strategiesByProblem.get(key).push(row)
    }
    for (const [key, rows] of strategiesByProblem.entries()) {
      setCached(staticCache.strategiesByProblemKey, key, rows)
    }

    const questionRows = (questionResult?.data?.executeResultList || []).map(mapQuestionRow)
    const questionsByGroup = new Map()
    const questionsByTargetSymptom = new Map()
    for (const row of questionRows) {
      const questionKey = String(row.questionKey || '').trim()
      const groupKey = String(row.questionGroupKey || '').trim()
      const targetSymptomKey = String(row.targetSymptomKey || '').trim()
      const isFullyAudited = row.dataStatus === 'audited' && row.reviewStatus === 'audited'
      if (questionKey && isFullyAudited) {
        setCached(staticCache.questionsByKey, questionKey, row)
      }
      if (groupKey) {
        if (!questionsByGroup.has(groupKey)) {questionsByGroup.set(groupKey, [])}
        questionsByGroup.get(groupKey).push(row)
      }
      if (targetSymptomKey && isFullyAudited) {
        if (!questionsByTargetSymptom.has(targetSymptomKey)) {questionsByTargetSymptom.set(targetSymptomKey, [])}
        questionsByTargetSymptom.get(targetSymptomKey).push({
          question_key: row.questionKey,
          target_symptom_key: row.targetSymptomKey,
          priority: row.priority,
          data_status: row.dataStatus
        })
      }
    }
    for (const [key, rows] of questionsByGroup.entries()) {
      setCached(staticCache.questionsByGroupKey, key, rows)
    }
    for (const [key, rows] of questionsByTargetSymptom.entries()) {
      setCached(staticCache.questionKeysByTargetSymptomKey, key, rows)
    }

    const optionRowsByQuestion = new Map()
    for (const row of (optionResult?.data?.executeResultList || []).map(mapOptionRow)) {
      const key = String(row.questionKey || '').trim()
      if (!key) {continue}
      if (!optionRowsByQuestion.has(key)) {optionRowsByQuestion.set(key, [])}
      optionRowsByQuestion.get(key).push(row)
    }
    for (const [key, rows] of optionRowsByQuestion.entries()) {
      setCached(staticCache.optionMappingsByQuestionKey, key, rows)
    }

    staticCache.preloadExpiresAt = refreshedNow + STATIC_REPOSITORY_CACHE_TTL_MS
  })
}

function mapStrategyRow(row = {}) {
  return {
    problemKey: row.problem_key,
    questionGroupKey: row.question_group_key || '',
    questionKey: row.question_key,
    priorityScore: Number(row.priority_score || 0),
    triggerType: row.trigger_type || 'candidate',
    strategyNoteCn: row.strategy_note_cn || '',
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

async function getQuestionStrategies(problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.strategiesByProblemKey, key)
    if (cached) {
      cachedRows.push(...cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPendingStaticQuery(
    `strategiesByProblemKey:${missingKeys.slice().sort().join('|')}`,
    () => models.$runSQL(
      `
        SELECT
          problem_key,
          question_group_key,
          question_key,
          priority_score,
          trigger_type,
          strategy_note_cn,
          data_status,
          review_status
        FROM ${table('question_strategy_v5_real')}
        WHERE problem_key IN ${sqlInList(missingKeys)}
          AND data_status = 'audited'
          AND review_status = 'audited'
        ORDER BY priority_score DESC, question_key ASC
      `,
      {}
    )
  )

  const rows = (result?.data?.executeResultList || []).map(mapStrategyRow)
  const rowsByKey = new Map()
  for (const row of rows) {
    const key = String(row.problemKey || '').trim()
    if (!rowsByKey.has(key)) {rowsByKey.set(key, [])}
    rowsByKey.get(key).push(row)
  }
  for (const key of missingKeys) {
    setCached(staticCache.strategiesByProblemKey, key, rowsByKey.get(key) || [])
  }
  return [
    ...cachedRows,
    ...missingKeys.flatMap(key => getCached(staticCache.strategiesByProblemKey, key) || [])
  ]
}

async function getQuestionsByKeys(questionKeys = []) {
  const safeKeys = Array.from(new Set((questionKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.questionsByKey, key)
    if (cached) {
      cachedRows.push(cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPendingStaticQuery(
    `questionsByKey:${missingKeys.slice().sort().join('|')}`,
    () => models.$runSQL(
      `
        SELECT
          question_key,
          question_text_cn,
          question_text_user_cn,
          question_type,
          target_symptom_key,
          question_group_key,
          question_level,
          observability,
          target_dimension,
          routing_scope,
          question_role,
          effect_mode,
          allow_unknown,
          priority,
          help_text_cn,
          why_this_question_cn,
          default_option_key,
          ui_variant,
          render_mode,
          template_engine_rule_key,
          data_status,
          review_status
        FROM ${table('question_library_v5_real')}
        WHERE question_key IN ${sqlInList(missingKeys)}
          AND data_status = 'audited'
          AND review_status = 'audited'
      `,
      {}
    )
  )

  const rows = (result?.data?.executeResultList || []).map(mapQuestionRow)
  const rowsByKey = new Map(rows.map(row => [String(row.questionKey || '').trim(), row]))
  for (const key of missingKeys) {
    setCached(staticCache.questionsByKey, key, rowsByKey.get(key) || null)
  }
  return [
    ...cachedRows,
    ...missingKeys.map(key => getCached(staticCache.questionsByKey, key)).filter(Boolean)
  ]
}

async function getQuestionsByGroupKeys(groupKeys = []) {
  const safeKeys = Array.from(new Set((groupKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.questionsByGroupKey, key)
    if (cached) {
      cachedRows.push(...cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPendingStaticQuery(
    `questionsByGroupKey:${missingKeys.slice().sort().join('|')}`,
    () => models.$runSQL(
      `
        SELECT
          question_key,
          question_text_cn,
          question_text_user_cn,
          question_type,
          target_symptom_key,
          question_group_key,
          question_level,
          observability,
          target_dimension,
          routing_scope,
          question_role,
          effect_mode,
          allow_unknown,
          priority,
          help_text_cn,
          why_this_question_cn,
          default_option_key,
          ui_variant,
          render_mode,
          template_engine_rule_key,
          data_status,
          review_status
        FROM ${table('question_library_v5_real')}
        WHERE question_group_key IN ${sqlInList(missingKeys)}
          AND data_status IN ('audited', 'partial')
          AND review_status IN ('audited', 'partial')
        ORDER BY priority DESC, question_key ASC
      `,
      {}
    )
  )

  const rows = (result?.data?.executeResultList || []).map(mapQuestionRow)
  const rowsByKey = new Map()
  for (const row of rows) {
    const key = String(row.questionGroupKey || '').trim()
    if (!rowsByKey.has(key)) {rowsByKey.set(key, [])}
    rowsByKey.get(key).push(row)
  }
  for (const key of missingKeys) {
    setCached(staticCache.questionsByGroupKey, key, rowsByKey.get(key) || [])
  }
  return [
    ...cachedRows,
    ...missingKeys.flatMap(key => getCached(staticCache.questionsByGroupKey, key) || [])
  ]
}

async function getQuestionOptionMappings(questionKeys = []) {
  const safeKeys = Array.from(new Set((questionKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.optionMappingsByQuestionKey, key)
    if (cached) {
      cachedRows.push(...cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPendingStaticQuery(
    `optionMappingsByQuestionKey:${missingKeys.slice().sort().join('|')}`,
    () => models.$runSQL(
      `
        SELECT
          question_key,
          option_key,
          option_text_cn,
          option_text_user_cn,
          maps_to_symptom_key,
          value,
          association_strength,
          answer_effect_cn,
          option_description_user_cn,
          display_order,
          is_default,
          data_status,
          review_status
        FROM ${table('question_option_mapping_v5_real')}
        WHERE question_key IN ${sqlInList(missingKeys)}
          AND data_status = 'audited'
          AND review_status = 'audited'
        ORDER BY question_key ASC, COALESCE(display_order, 9999) ASC, option_key ASC
      `,
      {}
    )
  )

  const rows = (result?.data?.executeResultList || []).map(mapOptionRow)
  const rowsByKey = new Map()
  for (const row of rows) {
    const key = String(row.questionKey || '').trim()
    if (!rowsByKey.has(key)) {rowsByKey.set(key, [])}
    rowsByKey.get(key).push(row)
  }
  for (const key of missingKeys) {
    setCached(staticCache.optionMappingsByQuestionKey, key, rowsByKey.get(key) || [])
  }
  return [
    ...cachedRows,
    ...missingKeys.flatMap(key => getCached(staticCache.optionMappingsByQuestionKey, key) || [])
  ]
}

async function findQuestionKeysByTargetSymptoms(symptomKeys = []) {
  const safeKeys = Array.from(new Set((symptomKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) {return []}
  const cachedRows = []
  const missingKeys = []
  for (const key of safeKeys) {
    const cached = getCached(staticCache.questionKeysByTargetSymptomKey, key)
    if (cached) {
      cachedRows.push(...cached)
    } else {
      missingKeys.push(key)
    }
  }
  if (!missingKeys.length) {return cachedRows}

  const result = await withPendingStaticQuery(
    `questionKeysByTargetSymptomKey:${missingKeys.slice().sort().join('|')}`,
    () => models.$runSQL(
      `
        SELECT question_key, target_symptom_key, priority, data_status
        FROM ${table('question_library_v5_real')}
        WHERE target_symptom_key IN ${sqlInList(missingKeys)}
          AND data_status = 'audited'
          AND review_status = 'audited'
        ORDER BY priority DESC, question_key ASC
      `,
      {}
    )
  )

  const rows = result?.data?.executeResultList || []
  const rowsByKey = new Map()
  for (const row of rows) {
    const key = String(row.target_symptom_key || '').trim()
    if (!rowsByKey.has(key)) {rowsByKey.set(key, [])}
    rowsByKey.get(key).push(row)
  }
  for (const key of missingKeys) {
    setCached(staticCache.questionKeysByTargetSymptomKey, key, rowsByKey.get(key) || [])
  }
  return [
    ...cachedRows,
    ...missingKeys.flatMap(key => getCached(staticCache.questionKeysByTargetSymptomKey, key) || [])
  ]
}

module.exports = {
  getQuestionStrategies,
  getQuestionsByKeys,
  getQuestionsByGroupKeys,
  getQuestionOptionMappings,
  findQuestionKeysByTargetSymptoms,
  preloadQuestionRepositoryCache
}
