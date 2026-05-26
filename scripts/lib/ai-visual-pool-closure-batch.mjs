import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export const libraryColumns = [
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
  'why_this_question_cn',
  'source_type',
  'source_batch_id',
  'version_tag',
  'row_hash',
  'review_status',
  'review_note',
  'is_active',
  'created_at',
  'updated_at',
  'published_at',
  'published_batch_id'
]

export const optionColumns = [
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
  'answer_effect_cn',
  'source_type',
  'source_batch_id',
  'version_tag',
  'row_hash',
  'review_status',
  'review_note',
  'is_active',
  'created_at',
  'updated_at',
  'published_at',
  'published_batch_id'
]

export const strategyColumns = [
  'problem_key',
  'question_group_key',
  'question_key',
  'priority_score',
  'trigger_type',
  'data_status',
  'data_source',
  'note',
  'strategy_note_cn',
  'source_type',
  'source_batch_id',
  'version_tag',
  'row_hash',
  'review_status',
  'review_note',
  'is_active',
  'created_at',
  'updated_at',
  'published_at',
  'published_batch_id'
]

export const engineColumns = [
  'engine_rule_key',
  'applies_to_group',
  'input_signal',
  'template_cn',
  'observability_default',
  'target_dimension_default',
  'routing_scope_default',
  'allow_unknown_default',
  'output_field',
  'note',
  'template_user_cn',
  'engine_usage_cn',
  'source_type',
  'source_batch_id',
  'version_tag',
  'row_hash',
  'review_status',
  'review_note',
  'is_active',
  'created_at',
  'updated_at',
  'published_at',
  'published_batch_id'
]

export function sqlString(value) {
  if (value === null || value === undefined) {return 'NULL'}
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .split('\0')
    .join('')}'`
}

export function sqlNumber(value) {
  if (value === null || value === undefined || value === '') {return 'NULL'}
  return String(value)
}

export function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function hashSeed(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function buildDevSyncSql({
  targetTable = '',
  columns = [],
  keyColumns = [],
  sourceSchema = '',
  targetSchema = 'cloud1_dev',
  batchId = ''
} = {}) {
  return [
    `INSERT INTO \`${targetSchema}\`.\`${targetTable}\` (`,
    columns.map(item => `  \`${item}\``).join(',\n'),
    ')',
    'SELECT',
    columns.map(item => `  \`${item}\``).join(',\n'),
    `FROM \`${sourceSchema}\`.\`${targetTable}\``,
    `WHERE \`source_batch_id\` = ${sqlString(batchId)}`,
    'ON DUPLICATE KEY UPDATE',
    columns
      .filter(item => !keyColumns.includes(item))
      .map(item => `  \`${item}\` = VALUES(\`${item}\`)`)
      .join(',\n'),
    ';'
  ].join('\n')
}

export function createClosureBatchToolkit({
  metadata,
  sourceSets,
  evidenceLabelMap = {}
}) {
  function joinSources(sourceKeys = []) {
    return Array.from(
      new Set(
        (sourceKeys || [])
          .flatMap(key => sourceSets[key] || [])
          .map(item => String(item || '').trim())
          .filter(Boolean)
      )
    )
  }

  function auditNote(urls = []) {
    return `source-backed manual audit (${metadata.auditDate}): ${urls.join(' | ')}`
  }

  function normalizeQuestion(closure, question, kind) {
    const urls = joinSources(question.sourceKeys)
    return {
      kind,
      symptomKey: closure.symptomKey,
      displayTextCn: closure.displayTextCn,
      closureMode: closure.closureMode,
      category: closure.category,
      questionKey: question.questionKey,
      targetSymptomKey: question.targetSymptomKey,
      questionTextCn: question.questionTextCn,
      questionTextUserCn: question.questionTextUserCn || question.questionTextCn,
      questionGroupKey: question.questionGroupKey,
      questionLevel: Number(question.questionLevel || 1),
      observability: question.observability || 'medium',
      targetDimension: question.targetDimension || 'visual_presence',
      routingScope: question.routingScope || 'symptom_confirmation',
      allowUnknown: 1,
      priority: Number(question.priority || 80),
      helpTextCn: question.helpTextCn || '',
      whyThisQuestionCn: question.whyThisQuestionCn || '',
      note: `${closure.category} / ${kind} / source-backed audited closure`,
      sourceUrls: urls,
      dataSource: urls.join(' | '),
      problemKeys: Array.isArray(question.problemKeys) ? question.problemKeys : [],
      strategyBase: Number(question.strategyBase || question.priority || 80),
      engineRuleKey: question.engineRuleKey,
      engineGroup: question.engineGroup || closure.category,
      reviewNote: auditNote(urls),
      rowHash: hashSeed({
        questionKey: question.questionKey,
        questionTextCn: question.questionTextCn,
        targetSymptomKey: question.targetSymptomKey,
        questionGroupKey: question.questionGroupKey,
        problemKeys: question.problemKeys,
        urls
      })
    }
  }

  function flattenQuestions(closures = []) {
    const rows = []
    for (const closure of closures) {
      rows.push(normalizeQuestion(closure, closure.confirm, 'confirm'))
      if (closure.context) {
        rows.push(normalizeQuestion(closure, closure.context, 'context'))
      }
    }
    return rows
  }

  function resolveEvidenceLabel(symptomKey = '', fallback = '') {
    const normalizedKey = String(symptomKey || '').trim()
    return evidenceLabelMap[normalizedKey] || fallback || normalizedKey
  }

  function buildQuestionLibrarySql(questionRows = []) {
    const values = questionRows.map(row => [
      sqlString(row.questionKey),
      sqlString(row.questionTextCn),
      sqlString('boolean'),
      sqlString(row.targetSymptomKey),
      sqlString(row.questionGroupKey),
      sqlNumber(row.questionLevel),
      sqlString(row.observability),
      sqlString(row.targetDimension),
      sqlString(row.routingScope),
      sqlNumber(row.allowUnknown),
      sqlNumber(row.priority),
      sqlString('audited'),
      sqlString(row.dataSource),
      sqlString(row.note),
      sqlString(row.questionTextUserCn),
      sqlString(row.helpTextCn),
      sqlString(row.whyThisQuestionCn),
      sqlString(metadata.sourceType),
      sqlString(metadata.batchId),
      sqlString(metadata.versionTag),
      sqlString(row.rowHash),
      sqlString('audited'),
      sqlString(row.reviewNote),
      sqlNumber(1),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.batchId)
    ])

    return [
      `INSERT INTO \`question_library_v5_real\` (${libraryColumns.map(item => `\`${item}\``).join(', ')})`,
      'VALUES',
      values.map(row => `(${row.join(', ')})`).join(',\n'),
      'ON DUPLICATE KEY UPDATE',
      libraryColumns
        .filter(item => item !== 'question_key')
        .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
        .join(', '),
      ';'
    ].join('\n')
  }

  function buildOptionRows(questionRows = []) {
    return questionRows.flatMap(row => {
      const symptomLabel = resolveEvidenceLabel(row.targetSymptomKey, row.displayTextCn)
      const shared = {
        dataStatus: 'audited',
        sourceType: metadata.sourceType,
        sourceBatchId: metadata.batchId,
        versionTag: metadata.versionTag,
        reviewStatus: 'audited',
        reviewNote: row.reviewNote,
        publishedAt: metadata.publishedAt,
        publishedBatchId: metadata.batchId,
        sourceUrls: row.sourceUrls,
        dataSource: row.dataSource
      }

      return [
        {
          ...shared,
          questionKey: row.questionKey,
          optionKey: 'yes',
          optionTextCn: '是',
          optionTextUserCn: '是，比较确定',
          mapsToSymptomKey: row.targetSymptomKey,
          value: 1,
          associationStrength: 1,
          note: `${row.kind} / positive evidence`,
          answerEffectCn: `把“${symptomLabel}”作为正证据加入诊断。`
        },
        {
          ...shared,
          questionKey: row.questionKey,
          optionKey: 'no',
          optionTextCn: '否',
          optionTextUserCn: '否，基本没有',
          mapsToSymptomKey: row.targetSymptomKey,
          value: -1,
          associationStrength: 1,
          note: `${row.kind} / negative evidence`,
          answerEffectCn: `把“${symptomLabel}”作为负证据加入诊断。`
        },
        {
          ...shared,
          questionKey: row.questionKey,
          optionKey: 'unknown',
          optionTextCn: '看不出/不确定',
          optionTextUserCn: '看不出/不确定',
          mapsToSymptomKey: row.targetSymptomKey,
          value: 0,
          associationStrength: 0,
          note: `${row.kind} / neutral`,
          answerEffectCn: `暂不把“${symptomLabel}”作为正式证据。`
        }
      ]
    })
  }

  function buildQuestionOptionSql(optionRows = []) {
    const values = optionRows.map(row => {
      const rowHash = hashSeed({
        questionKey: row.questionKey,
        optionKey: row.optionKey,
        mapsToSymptomKey: row.mapsToSymptomKey,
        value: row.value,
        urls: row.sourceUrls
      })

      return [
        sqlString(row.questionKey),
        sqlString(row.optionKey),
        sqlString(row.optionTextCn),
        sqlString(row.mapsToSymptomKey),
        sqlNumber(row.value),
        sqlNumber(row.associationStrength),
        sqlString(row.dataStatus),
        sqlString(row.dataSource),
        sqlString(row.note),
        sqlString(row.optionTextUserCn),
        sqlString(row.answerEffectCn),
        sqlString(row.sourceType),
        sqlString(row.sourceBatchId),
        sqlString(row.versionTag),
        sqlString(rowHash),
        sqlString(row.reviewStatus),
        sqlString(row.reviewNote),
        sqlNumber(1),
        sqlString(metadata.publishedAt),
        sqlString(metadata.publishedAt),
        sqlString(metadata.publishedAt),
        sqlString(metadata.batchId)
      ]
    })

    return [
      `INSERT INTO \`question_option_mapping_v5_real\` (${optionColumns.map(item => `\`${item}\``).join(', ')})`,
      'VALUES',
      values.map(row => `(${row.join(', ')})`).join(',\n'),
      'ON DUPLICATE KEY UPDATE',
      optionColumns
        .filter(item => !['question_key', 'option_key'].includes(item))
        .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
        .join(', '),
      ';'
    ].join('\n')
  }

  function buildStrategyRows(questionRows = []) {
    return questionRows.flatMap(row =>
      row.problemKeys.map((problemKey, index) => {
        const priorityScore = Math.max(48, row.strategyBase - index * 6)
        const rowHash = hashSeed({
          problemKey,
          questionGroupKey: row.questionGroupKey,
          questionKey: row.questionKey,
          priorityScore,
          urls: row.sourceUrls
        })

        return {
          problemKey,
          questionGroupKey: row.questionGroupKey,
          questionKey: row.questionKey,
          priorityScore,
          triggerType: 'candidate',
          dataStatus: 'audited',
          dataSource: row.dataSource,
          note: `${row.kind} / source-backed audited closure`,
          strategyNoteCn:
            row.kind === 'confirm'
              ? '先确认 ai_visual_pool 症状本体，再决定是否继续分流。'
              : '在症状本体确认后补一条上下文分流题，避免直接把环境/腐烂/病毒路径混在一起。',
          sourceType: metadata.sourceType,
          sourceBatchId: metadata.batchId,
          versionTag: metadata.versionTag,
          rowHash,
          reviewStatus: 'audited',
          reviewNote: row.reviewNote
        }
      })
    )
  }

  function buildStrategySql(strategyRows = []) {
    const values = strategyRows.map(row => [
      sqlString(row.problemKey),
      sqlString(row.questionGroupKey),
      sqlString(row.questionKey),
      sqlNumber(row.priorityScore),
      sqlString(row.triggerType),
      sqlString(row.dataStatus),
      sqlString(row.dataSource),
      sqlString(row.note),
      sqlString(row.strategyNoteCn),
      sqlString(row.sourceType),
      sqlString(row.sourceBatchId),
      sqlString(row.versionTag),
      sqlString(row.rowHash),
      sqlString(row.reviewStatus),
      sqlString(row.reviewNote),
      sqlNumber(1),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.batchId)
    ])

    return [
      `INSERT INTO \`question_strategy_v5_real\` (${strategyColumns.map(item => `\`${item}\``).join(', ')})`,
      'VALUES',
      values.map(row => `(${row.join(', ')})`).join(',\n'),
      'ON DUPLICATE KEY UPDATE',
      strategyColumns
        .filter(item => !['problem_key', 'question_group_key', 'question_key'].includes(item))
        .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
        .join(', '),
      ';'
    ].join('\n')
  }

  function buildEngineRows(questionRows = []) {
    return questionRows.map(row => ({
      engineRuleKey: row.engineRuleKey,
      appliesToGroup: row.engineGroup,
      inputSignal: row.symptomKey,
      templateCn: row.questionTextCn,
      observabilityDefault: row.observability,
      targetDimensionDefault: row.targetDimension || 'visual_presence',
      routingScopeDefault: row.routingScope || 'symptom_confirmation',
      allowUnknownDefault: 1,
      outputField: metadata.outputField,
      note: `${row.kind} / ${row.category} / source-backed audited question generation rule`,
      templateUserCn: row.questionTextUserCn,
      engineUsageCn:
        row.kind === 'confirm'
          ? `用于 ai_visual_pool 症状 ${row.displayTextCn} 的正式确认题生成；仅在权威来源人工核验通过后作为 audited 规则发布。`
          : `用于 ai_visual_pool 症状 ${row.displayTextCn} 的上下文分流题生成；必须排在 confirm 题之后，且只作为 source-backed audited 规则发布。`,
      sourceType: metadata.sourceType,
      sourceBatchId: metadata.batchId,
      versionTag: metadata.versionTag,
      rowHash: hashSeed({
        engineRuleKey: row.engineRuleKey,
        inputSignal: row.symptomKey,
        templateCn: row.questionTextCn,
        urls: row.sourceUrls
      }),
      reviewStatus: 'audited',
      reviewNote: row.reviewNote
    }))
  }

  function buildEngineSql(engineRows = []) {
    const values = engineRows.map(row => [
      sqlString(row.engineRuleKey),
      sqlString(row.appliesToGroup),
      sqlString(row.inputSignal),
      sqlString(row.templateCn),
      sqlString(row.observabilityDefault),
      sqlString(row.targetDimensionDefault),
      sqlString(row.routingScopeDefault),
      sqlNumber(row.allowUnknownDefault),
      sqlString(row.outputField),
      sqlString(row.note),
      sqlString(row.templateUserCn),
      sqlString(row.engineUsageCn),
      sqlString(row.sourceType),
      sqlString(row.sourceBatchId),
      sqlString(row.versionTag),
      sqlString(row.rowHash),
      sqlString(row.reviewStatus),
      sqlString(row.reviewNote),
      sqlNumber(1),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.batchId)
    ])

    return [
      `INSERT INTO \`question_generation_engine\` (${engineColumns.map(item => `\`${item}\``).join(', ')})`,
      'VALUES',
      values.map(row => `(${row.join(', ')})`).join(',\n'),
      'ON DUPLICATE KEY UPDATE',
      engineColumns
        .filter(item => item !== 'engine_rule_key')
        .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
        .join(', '),
      ';'
    ].join('\n')
  }

  return {
    joinSources,
    auditNote,
    flattenQuestions,
    buildQuestionLibrarySql,
    buildOptionRows,
    buildQuestionOptionSql,
    buildStrategyRows,
    buildStrategySql,
    buildEngineRows,
    buildEngineSql
  }
}
