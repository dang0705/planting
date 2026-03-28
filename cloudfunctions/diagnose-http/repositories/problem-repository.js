'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList } = require('./sql')
const { table } = require('../db/table-helper')

function mapProblemRow(row = {}) {
  return {
    problemKey: row.problem_key,
    problemName: row.problem_name || row.problem_key,
    problemCn: row.problem_cn || row.problem_key,
    problemType: row.problem_type || '',
    problemRole: row.problem_role || 'root_cause',
    definition: row.definition || '',
    defaultAction: row.default_action || '',
    defaultPrevention: row.default_prevention || '',
    displayNameCn: row.display_name_cn || row.problem_cn || row.problem_key,
    userDefinitionCn: row.user_definition_cn || row.definition || '',
    userActionCn: row.user_action_cn || row.default_action || '',
    userPreventionCn: row.user_prevention_cn || row.default_prevention || '',
    severityHintCn: row.severity_hint_cn || '中',
    urgencyHintCn: row.urgency_hint_cn || '中',
    dataStatus: row.data_status || 'unknown'
  }
}

function mapExplanationRow(row = {}) {
  return {
    problemKey: row.problem_key,
    displayNameCn: row.display_name_cn || '',
    resultSummaryCn: row.result_summary_cn || '',
    whyItHappensCn: row.why_it_happens_cn || '',
    whatToCheckNextCn: row.what_to_check_next_cn || '',
    firstAidCn: row.first_aid_cn || '',
    avoidCn: row.avoid_cn || '',
    reassuranceCn: row.reassurance_cn || ''
  }
}

async function getProblemsByKeys(problemKeys = []) {
  const safeKeys = Array.from(
    new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  )
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
    `
      SELECT
        problem_key,
        problem_name,
        problem_cn,
        problem_type,
        problem_role,
        definition,
        default_action,
        default_prevention,
        display_name_cn,
        user_definition_cn,
        user_action_cn,
        user_prevention_cn,
        severity_hint_cn,
        urgency_hint_cn,
        data_status
      FROM ${table('problems')}
      WHERE problem_key IN ${sqlInList(safeKeys)}
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapProblemRow)
}

async function getExplanationsByProblemKeys(problemKeys = []) {
  const safeKeys = Array.from(
    new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean))
  )
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
    `
      SELECT
        problem_key,
        display_name_cn,
        result_summary_cn,
        why_it_happens_cn,
        what_to_check_next_cn,
        first_aid_cn,
        avoid_cn,
        reassurance_cn
      FROM ${table('diagnosis_result_explanations')}
      WHERE problem_key IN ${sqlInList(safeKeys)}
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapExplanationRow)
}

module.exports = {
  getProblemsByKeys,
  getExplanationsByProblemKeys
}
