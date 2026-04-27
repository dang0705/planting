'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')
const {
  normalizeQuestionTargetDimension,
  normalizeQuestionRoutingScope,
  inferQuestionTargetDimension,
  inferQuestionRoutingScope
} = require('../utils/question-target-dimension')

function mapQuestionRow(row = {}) {
  const questionKey = row.question_key || ''
  const targetSymptomKey = row.target_symptom_key || ''

  return {
    questionKey,
    questionTextCn: row.question_text_cn || '',
    questionTextUserCn: row.question_text_user_cn || row.question_text_cn || '',
    questionType: row.question_type || 'single_choice',
    targetSymptomKey,
    questionGroupKey: row.question_group_key || '',
    questionLevel: Number(row.question_level || 1),
    observability: row.observability || 'medium',
    targetDimension: normalizeQuestionTargetDimension(
      row.target_dimension,
      inferQuestionTargetDimension(questionKey, targetSymptomKey)
    ),
    routingScope: normalizeQuestionRoutingScope(
      row.routing_scope,
      inferQuestionRoutingScope(questionKey, targetSymptomKey)
    ),
    allowUnknown: Number(row.allow_unknown || 0) === 1,
    priority: Number(row.priority || 0),
    helpTextCn: row.help_text_cn || '',
    whyThisQuestionCn: row.why_this_question_cn || '',
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
    directProblemAdjustments,
    dataStatus: row.data_status || 'unknown',
    reviewStatus: row.review_status || 'unknown'
  }
}

const AUDITED_DIRECT_PROBLEM_ADJUSTMENTS = {
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
  if (!questionAdjustments) return []
  const optionAdjustments = questionAdjustments[String(optionKey || '').trim()]
  if (!Array.isArray(optionAdjustments)) return []

  return optionAdjustments.map(item => ({
    problemKey: String(item?.problemKey || '').trim(),
    scoreDelta: Number(item?.scoreDelta || 0)
  })).filter(item => item.problemKey && Number.isFinite(item.scoreDelta) && item.scoreDelta !== 0)
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
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
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
      WHERE problem_key IN ${sqlInList(safeKeys)}
        AND data_status = 'audited'
        AND review_status = 'audited'
      ORDER BY priority_score DESC, question_key ASC
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapStrategyRow)
}

async function getQuestionsByKeys(questionKeys = []) {
  const safeKeys = Array.from(new Set((questionKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
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
        allow_unknown,
        priority,
        help_text_cn,
        why_this_question_cn,
        data_status,
        review_status
      FROM ${table('question_library_v5_real')}
      WHERE question_key IN ${sqlInList(safeKeys)}
        AND data_status = 'audited'
        AND review_status = 'audited'
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapQuestionRow)
}

async function getQuestionsByGroupKeys(groupKeys = []) {
  const safeKeys = Array.from(new Set((groupKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
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
        allow_unknown,
        priority,
        help_text_cn,
        why_this_question_cn,
        data_status,
        review_status
      FROM ${table('question_library_v5_real')}
      WHERE question_group_key IN ${sqlInList(safeKeys)}
        AND data_status IN ('audited', 'partial')
        AND review_status IN ('audited', 'partial')
      ORDER BY priority DESC, question_key ASC
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapQuestionRow)
}

async function getQuestionOptionMappings(questionKeys = []) {
  const safeKeys = Array.from(new Set((questionKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
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
        data_status,
        review_status
      FROM ${table('question_option_mapping_v5_real')}
      WHERE question_key IN ${sqlInList(safeKeys)}
        AND data_status = 'audited'
        AND review_status = 'audited'
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapOptionRow)
}

async function findQuestionKeysByTargetSymptoms(symptomKeys = []) {
  const safeKeys = Array.from(new Set((symptomKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
    `
      SELECT question_key, target_symptom_key, priority, data_status
      FROM ${table('question_library_v5_real')}
      WHERE target_symptom_key IN ${sqlInList(safeKeys)}
        AND data_status = 'audited'
        AND review_status = 'audited'
      ORDER BY priority DESC, question_key ASC
    `,
    {}
  )

  return result?.data?.executeResultList || []
}

module.exports = {
  getQuestionStrategies,
  getQuestionsByKeys,
  getQuestionsByGroupKeys,
  getQuestionOptionMappings,
  findQuestionKeysByTargetSymptoms
}
