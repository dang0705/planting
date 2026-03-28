'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')

function mapQuestionRow(row = {}) {
  return {
    questionKey: row.question_key,
    questionTextCn: row.question_text_cn || '',
    questionTextUserCn: row.question_text_user_cn || row.question_text_cn || '',
    questionType: row.question_type || 'single_choice',
    targetSymptomKey: row.target_symptom_key || '',
    questionGroupKey: row.question_group_key || '',
    questionLevel: Number(row.question_level || 1),
    observability: row.observability || 'medium',
    allowUnknown: Number(row.allow_unknown || 0) === 1,
    priority: Number(row.priority || 0),
    helpTextCn: row.help_text_cn || '',
    whyThisQuestionCn: row.why_this_question_cn || '',
    dataStatus: row.data_status || 'unknown'
  }
}

function mapOptionRow(row = {}) {
  return {
    questionKey: row.question_key,
    optionKey: row.option_key,
    optionTextCn: row.option_text_cn || row.option_text_user_cn || row.option_key,
    optionTextUserCn: row.option_text_user_cn || row.option_text_cn || row.option_key,
    mapsToSymptomKey: row.maps_to_symptom_key || '',
    value: Number(row.value || 0),
    associationStrength: clamp01(row.association_strength),
    answerEffectCn: row.answer_effect_cn || '',
    dataStatus: row.data_status || 'unknown'
  }
}

function mapStrategyRow(row = {}) {
  return {
    problemKey: row.problem_key,
    questionGroupKey: row.question_group_key || '',
    questionKey: row.question_key,
    priorityScore: Number(row.priority_score || 0),
    triggerType: row.trigger_type || 'candidate',
    strategyNoteCn: row.strategy_note_cn || '',
    dataStatus: row.data_status || 'unknown'
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
        data_status
      FROM ${table('question_strategy_v5_real')}
      WHERE problem_key IN ${sqlInList(safeKeys)}
        AND data_status IN ('audited', 'partial')
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
        allow_unknown,
        priority,
        help_text_cn,
        why_this_question_cn,
        data_status
      FROM ${table('question_library_v5_real')}
      WHERE question_key IN ${sqlInList(safeKeys)}
        AND data_status IN ('audited', 'partial')
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
        data_status
      FROM ${table('question_option_mapping_v5_real')}
      WHERE question_key IN ${sqlInList(safeKeys)}
        AND data_status IN ('audited', 'partial')
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
      SELECT question_key, target_symptom_key, priority
      FROM ${table('question_library_v5_real')}
      WHERE target_symptom_key IN ${sqlInList(safeKeys)}
        AND data_status IN ('audited', 'partial')
      ORDER BY priority DESC, question_key ASC
    `,
    {}
  )

  return result?.data?.executeResultList || []
}

module.exports = {
  getQuestionStrategies,
  getQuestionsByKeys,
  getQuestionOptionMappings,
  findQuestionKeysByTargetSymptoms
}
