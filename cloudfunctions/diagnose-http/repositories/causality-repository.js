'use strict'

const { models } = require('/opt/utils/cloudbase')
const { sqlInList, clamp01 } = require('./sql')
const { table } = require('../db/table-helper')

function mapCausalityRow(row = {}) {
  return {
    causeProblemKey: row.cause_problem_key,
    effectProblemKey: row.effect_problem_key,
    relationType: row.relation_type || 'causes',
    relationStrength: clamp01(row.relation_strength),
    note: row.note || '',
    dataStatus: row.data_status || 'unknown'
  }
}

async function getCausalityEdges(problemKeys = []) {
  const safeKeys = Array.from(new Set((problemKeys || []).map(item => String(item || '').trim()).filter(Boolean)))
  if (!safeKeys.length) return []

  const result = await models.$runSQL(
    `
      SELECT
        cause_problem_key,
        effect_problem_key,
        relation_type,
        relation_strength,
        note,
        data_status
      FROM ${table('problem_causality')}
      WHERE is_active = 1
        AND (
            cause_problem_key IN ${sqlInList(safeKeys)}
         OR effect_problem_key IN ${sqlInList(safeKeys)}
        )
      ORDER BY relation_strength DESC
    `,
    {}
  )

  return (result?.data?.executeResultList || []).map(mapCausalityRow)
}

module.exports = {
  getCausalityEdges
}
