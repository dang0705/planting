'use strict'

const { expectedColumns } = require('./data-diff-builder')

function classifyPriority(tableName) {
  if (['problems', 'symptoms'].includes(tableName)) return 'P1_PRIMARY_KEYSPACE'
  if (['symptom_problem_evidence'].includes(tableName)) return 'P2_EVIDENCE_CLOSURE'
  if (['genus_problem_profiles', 'problem_host_profiles', 'plant_problem_profiles'].includes(tableName)) {
    return 'P3_PRIOR_LAYER'
  }
  if (
    [
      'question_library_v5_real',
      'question_option_mapping_v5_real',
      'question_strategy_v5_real',
      'question_generation_engine'
    ].includes(tableName)
  ) {
    return 'P4_QUESTION_LAYER'
  }
  return 'P5_EXPLANATION_LAYER'
}

function buildBackfillPlan(diffReport = {}) {
  const tableDiffs = Array.isArray(diffReport.tableDiffs) ? diffReport.tableDiffs : []

  const actions = tableDiffs
    .filter(item => item.missingColumns.length || item.type === 'missing')
    .map(item => {
      const supportsDataStatus = Array.isArray(expectedColumns[item.table]) && expectedColumns[item.table].includes('data_status')

      return {
        table: item.table,
        priority: classifyPriority(item.table),
        missingColumns: item.missingColumns || [],
        action: supportsDataStatus ? 'upsert_with_partial_status' : 'upsert_missing_fields',
        dataStatus: supportsDataStatus ? 'partial' : null,
        requiredAuditFields: supportsDataStatus ? ['data_status', 'data_source', 'audit_note'] : []
      }
    })

  return {
    generatedAt: new Date().toISOString(),
    strategy: [
      'diff -> backfill payload -> upsert -> repository 统一输出新结构 -> 切换引擎',
      'unknown 选项强制补齐：yes/no/unknown，unknown.value=0',
      '所有自动补齐项默认 data_status=partial，不伪装 audited'
    ],
    actions,
    unknownOptionRules: {
      ensureOptions: ['yes', 'no', 'unknown'],
      unknownValue: 0,
      unknownScoreEffect: 'neutral'
    }
  }
}

module.exports = {
  buildBackfillPlan
}
