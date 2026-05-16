'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList } = require('./sql')
const { table } = require('../db/table-helper')
const {
  mapQuestionRow,
  mapOptionRow,
  mapStrategyRow
} = require('./question-row-mappers')

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
            AND is_active = 1
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
          AND is_active = 1
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
  getQuestionStrategies, getQuestionsByKeys, getQuestionsByGroupKeys,
  getQuestionOptionMappings, findQuestionKeysByTargetSymptoms, preloadQuestionRepositoryCache
}
