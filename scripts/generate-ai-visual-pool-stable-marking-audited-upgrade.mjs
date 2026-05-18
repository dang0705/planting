import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  buildDevSyncSql,
  libraryColumns,
  optionColumns,
  strategyColumns,
  engineColumns
} from './lib/ai-visual-pool-closure-batch.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const diagnosisDir = path.join(repoRoot, 'tmp', 'import-sql', 'diagnosis')
const diagnosisDevSyncDir = path.join(repoRoot, 'tmp', 'import-sql', 'diagnosis-dev-sync')

const metadata = {
  batchId: 'batch_20260413_ai_visual_np_gap_closure',
  versionTag: 'v20260413_ai_visual_np_v1',
  publishedAt: '2026-04-13 19:00:00',
  sourceType: 'manual',
  prodSchema: 'cloud1-2grufevs395a9d5e',
  devSchema: 'cloud1_dev'
}

const stableMarkingSourceUrls = [
  'https://www.rhs.org.uk/plants/types/houseplants/how-to-help-a-poorly-houseplant',
  'https://www.rhs.org.uk/garden-design/sustainable-planting-combinations/foliage/variegated-foliage',
  'https://www.rhs.org.uk/plants/spider-plants/growing-guide'
]

const stableMarkingQuestions = [
  {
    questionKey: 'q_stable_marking_pattern_confirm',
    targetSymptomKey: 'stable_natural_marking_pattern',
    questionTextCn: '这些斑驳或条纹是否在多片叶上以相近方式稳定出现，而不是最近才突然乱掉？',
    questionTextUserCn: '这些斑驳/条纹看起来是一直比较稳定的固有花纹，而不是最近才突然乱掉的吗？',
    questionGroupKey: 'stable_marking_pattern_confirm_group',
    questionLevel: 1,
    observability: 'high',
    priority: 100,
    helpTextCn:
      '优先同时看几片老叶和最近长出的叶子，确认花纹是重复出现的稳定模式，而不是突然新增的杂乱斑块。',
    whyThisQuestionCn:
      'RHS 明确把 variegation 视为植物可长期保持的固有花纹。先确认“稳定重复出现”的模式，才能把它与近期新发病斑分开。',
    problemKey: 'stable_natural_marking',
    strategyPriority: 100,
    engineRuleKey: 'eg_stable_marking_pattern_confirm'
  },
  {
    questionKey: 'q_stable_marking_new_growth_consistent',
    targetSymptomKey: 'stable_trait_new_growth_consistent',
    questionTextCn: '新叶是否也持续保持类似花纹，而不是只有旧叶有这种斑驳？',
    questionTextUserCn: '新叶也一直保持类似花纹，而不是只有旧叶才有这种斑驳吗？',
    questionGroupKey: 'stable_marking_new_growth_group',
    questionLevel: 2,
    observability: 'medium',
    priority: 96,
    helpTextCn:
      '重点看最近长出的叶片。若新叶也延续类似斑纹，更支持这是稳定特征，而不是旧叶残留问题。',
    whyThisQuestionCn:
      'RHS 对 variegated plants 的描述强调新生叶也会延续既有花纹；如果只有旧叶有而新叶紊乱，就不能按稳定正常斑纹处理。',
    problemKey: 'stable_natural_marking',
    strategyPriority: 94,
    engineRuleKey: 'eg_stable_marking_new_growth_consistent'
  },
  {
    questionKey: 'q_stable_marking_no_recent_expansion',
    targetSymptomKey: 'stable_trait_no_recent_expansion',
    questionTextCn: '最近 7 天这种花纹是否基本没有明显扩大、变乱或突然加深？',
    questionTextUserCn: '最近 7 天这种花纹基本没有明显扩大、变乱或突然加深吗？',
    questionGroupKey: 'stable_marking_no_recent_expansion_group',
    questionLevel: 2,
    observability: 'medium',
    priority: 92,
    helpTextCn:
      '回想最近一周的变化。若花纹突然扩展、边缘变乱或颜色异常加深，就更像新发问题而不是稳定特征。',
    whyThisQuestionCn:
      '稳定正常斑纹的核心边界不是“看起来像”，而是近期没有进展性扩展。这道题用于把稳定花纹与发展性异常分开。',
    problemKey: 'stable_natural_marking',
    strategyPriority: 90,
    engineRuleKey: 'eg_stable_marking_no_recent_expansion'
  }
]

function sqlString(value) {
  if (value === null || value === undefined) {return 'NULL'}
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .split('\0')
    .join('')}'`
}

function sqlNumber(value) {
  if (value === null || value === undefined || value === '') {return 'NULL'}
  return String(value)
}

function hashSeed(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function buildReviewNote(urls = []) {
  return `source-backed manual audit (2026-04-13): ${urls.join(' | ')}`
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function buildQuestionLibrarySql(rows = []) {
  const columns = [
    'question_key',
    'question_text_cn',
    'question_type',
    'target_symptom_key',
    'question_group_key',
    'question_level',
    'observability',
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

  const values = rows.map(row => {
    const dataSource = stableMarkingSourceUrls.join(' | ')
    return [
      sqlString(row.questionKey),
      sqlString(row.questionTextCn),
      sqlString('boolean'),
      sqlString(row.targetSymptomKey),
      sqlString(row.questionGroupKey),
      sqlNumber(row.questionLevel),
      sqlString(row.observability),
      sqlNumber(1),
      sqlNumber(row.priority),
      sqlString('audited'),
      sqlString(dataSource),
      sqlString('stable_natural_marking audited bridge'),
      sqlString(row.questionTextUserCn),
      sqlString(row.helpTextCn),
      sqlString(row.whyThisQuestionCn),
      sqlString(metadata.sourceType),
      sqlString(metadata.batchId),
      sqlString(metadata.versionTag),
      sqlString(hashSeed({ type: 'question', row })),
      sqlString('audited'),
      sqlString(buildReviewNote(stableMarkingSourceUrls)),
      sqlNumber(1),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.publishedAt),
      sqlString(metadata.batchId)
    ]
  })

  return [
    `INSERT INTO \`question_library_v5_real\` (${columns.map(item => `\`${item}\``).join(', ')})`,
    'VALUES',
    values.map(row => `(${row.join(', ')})`).join(',\n'),
    'ON DUPLICATE KEY UPDATE',
    columns
      .filter(item => item !== 'question_key')
      .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
      .join(', '),
    ';'
  ].join('\n')
}

function buildOptionSql(rows = []) {
  const columns = [
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

  const dataSource = stableMarkingSourceUrls.join(' | ')
  const optionRows = rows.flatMap(row => {
    const symptomLabel = row.targetSymptomKey === 'stable_natural_marking_pattern'
      ? '稳定斑驳模式'
      : row.targetSymptomKey === 'stable_trait_new_growth_consistent'
        ? '新叶也保持类似花纹'
        : '近期没有明显扩大'

    return [
      {
        questionKey: row.questionKey,
        optionKey: 'yes',
        optionTextCn: '是',
        optionTextUserCn: '是，比较确定',
        mapsToSymptomKey: row.targetSymptomKey,
        value: 1,
        associationStrength: 1,
        note: 'positive evidence',
        answerEffectCn: `把“${symptomLabel}”作为正证据加入诊断。`
      },
      {
        questionKey: row.questionKey,
        optionKey: 'no',
        optionTextCn: '否',
        optionTextUserCn: '否，基本没有',
        mapsToSymptomKey: row.targetSymptomKey,
        value: -1,
        associationStrength: 1,
        note: 'negative evidence',
        answerEffectCn: `把“${symptomLabel}”作为负证据加入诊断。`
      },
      {
        questionKey: row.questionKey,
        optionKey: 'unknown',
        optionTextCn: '看不出/不确定',
        optionTextUserCn: '看不出/不确定',
        mapsToSymptomKey: row.targetSymptomKey,
        value: 0,
        associationStrength: 0,
        note: 'neutral',
        answerEffectCn: `暂不把“${symptomLabel}”作为正式证据。`
      }
    ]
  })

  const values = optionRows.map(row => [
    sqlString(row.questionKey),
    sqlString(row.optionKey),
    sqlString(row.optionTextCn),
    sqlString(row.mapsToSymptomKey),
    sqlNumber(row.value),
    sqlNumber(row.associationStrength),
    sqlString('audited'),
    sqlString(dataSource),
    sqlString(`stable_natural_marking audited bridge / ${row.note}`),
    sqlString(row.optionTextUserCn),
    sqlString(row.answerEffectCn),
    sqlString(metadata.sourceType),
    sqlString(metadata.batchId),
    sqlString(metadata.versionTag),
    sqlString(hashSeed({ type: 'option', row })),
    sqlString('audited'),
    sqlString(buildReviewNote(stableMarkingSourceUrls)),
    sqlNumber(1),
    sqlString(metadata.publishedAt),
    sqlString(metadata.publishedAt),
    sqlString(metadata.publishedAt),
    sqlString(metadata.batchId)
  ])

  return [
    `INSERT INTO \`question_option_mapping_v5_real\` (${columns.map(item => `\`${item}\``).join(', ')})`,
    'VALUES',
    values.map(row => `(${row.join(', ')})`).join(',\n'),
    'ON DUPLICATE KEY UPDATE',
    columns
      .filter(item => !['question_key', 'option_key'].includes(item))
      .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
      .join(', '),
    ';'
  ].join('\n')
}

function buildStrategySql(rows = []) {
  const columns = [
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

  const dataSource = stableMarkingSourceUrls.join(' | ')
  const values = rows.map(row => [
    sqlString(row.problemKey),
    sqlString(row.questionGroupKey),
    sqlString(row.questionKey),
    sqlNumber(row.strategyPriority),
    sqlString('candidate'),
    sqlString('audited'),
    sqlString(dataSource),
    sqlString('stable_natural_marking audited bridge'),
    sqlString('用于稳定正常斑纹的正式问诊桥接；仅在 seed 症状进入后触发。'),
    sqlString(metadata.sourceType),
    sqlString(metadata.batchId),
    sqlString(metadata.versionTag),
    sqlString(hashSeed({ type: 'strategy', row })),
    sqlString('audited'),
    sqlString(buildReviewNote(stableMarkingSourceUrls)),
    sqlNumber(1),
    sqlString(metadata.publishedAt),
    sqlString(metadata.publishedAt),
    sqlString(metadata.publishedAt),
    sqlString(metadata.batchId)
  ])

  return [
    `INSERT INTO \`question_strategy_v5_real\` (${columns.map(item => `\`${item}\``).join(', ')})`,
    'VALUES',
    values.map(row => `(${row.join(', ')})`).join(',\n'),
    'ON DUPLICATE KEY UPDATE',
    columns
      .filter(item => !['problem_key', 'question_group_key', 'question_key'].includes(item))
      .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
      .join(', '),
    ';'
  ].join('\n')
}

function buildEngineSql(rows = []) {
  const columns = [
    'engine_rule_key',
    'applies_to_group',
    'input_signal',
    'template_cn',
    'observability_default',
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

  const values = rows.map(row => [
    sqlString(row.engineRuleKey),
    sqlString('stable_natural_marking'),
    sqlString('stable_natural_marking_pattern'),
    sqlString(row.questionTextCn),
    sqlString(row.observability),
    sqlNumber(1),
    sqlString('question_library'),
    sqlString('audited_generation_asset / stable_natural_marking'),
    sqlString(row.questionTextUserCn),
    sqlString(
      '该表仅作为 source-backed audited 生成资产/审计登记，不作为 diagnose-http 正式运行时 question coverage。'
    ),
    sqlString(metadata.sourceType),
    sqlString(metadata.batchId),
    sqlString(metadata.versionTag),
    sqlString(hashSeed({ type: 'engine', row })),
    sqlString('audited'),
    sqlString(buildReviewNote(stableMarkingSourceUrls)),
    sqlNumber(1),
    sqlString(metadata.publishedAt),
    sqlString(metadata.publishedAt),
    sqlString(metadata.publishedAt),
    sqlString(metadata.batchId)
  ])

  return [
    `INSERT INTO \`question_generation_engine\` (${columns.map(item => `\`${item}\``).join(', ')})`,
    'VALUES',
    values.map(row => `(${row.join(', ')})`).join(',\n'),
    'ON DUPLICATE KEY UPDATE',
    columns
      .filter(item => item !== 'engine_rule_key')
      .map(item => `\`${item}\` = VALUES(\`${item}\`)`)
      .join(', '),
    ';'
  ].join('\n')
}

const sqlOutputs = [
  [
    path.join(diagnosisDir, '26-question-library-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildQuestionLibrarySql(stableMarkingQuestions)
  ],
  [
    path.join(diagnosisDir, '27-question-option-mapping-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildOptionSql(stableMarkingQuestions)
  ],
  [
    path.join(diagnosisDir, '28-question-strategy-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildStrategySql(stableMarkingQuestions)
  ],
  [
    path.join(diagnosisDir, '29-question-generation-engine-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildEngineSql(stableMarkingQuestions)
  ],
  [
    path.join(diagnosisDevSyncDir, '05-question-library-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildDevSyncSql({
      targetTable: 'question_library_v5_real',
      columns: libraryColumns,
      keyColumns: ['question_key'],
      sourceSchema: metadata.prodSchema,
      targetSchema: metadata.devSchema,
      batchId: metadata.batchId
    })
  ],
  [
    path.join(diagnosisDevSyncDir, '06-question-option-mapping-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildDevSyncSql({
      targetTable: 'question_option_mapping_v5_real',
      columns: optionColumns,
      keyColumns: ['question_key', 'option_key'],
      sourceSchema: metadata.prodSchema,
      targetSchema: metadata.devSchema,
      batchId: metadata.batchId
    })
  ],
  [
    path.join(diagnosisDevSyncDir, '07-question-strategy-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildDevSyncSql({
      targetTable: 'question_strategy_v5_real',
      columns: strategyColumns,
      keyColumns: ['problem_key', 'question_group_key', 'question_key'],
      sourceSchema: metadata.prodSchema,
      targetSchema: metadata.devSchema,
      batchId: metadata.batchId
    })
  ],
  [
    path.join(diagnosisDevSyncDir, '08-question-generation-engine-ai-visual-pool-stable-marking-audited-upgrade.sql'),
    buildDevSyncSql({
      targetTable: 'question_generation_engine',
      columns: engineColumns,
      keyColumns: ['engine_rule_key'],
      sourceSchema: metadata.prodSchema,
      targetSchema: metadata.devSchema,
      batchId: metadata.batchId
    })
  ]
]

for (const [filePath, content] of sqlOutputs) {
  ensureParentDir(filePath)
  fs.writeFileSync(filePath, `${content}\n`, 'utf8')
}

console.log(
  JSON.stringify(
    {
      ok: true,
      batchId: metadata.batchId,
      versionTag: metadata.versionTag,
      questionCount: stableMarkingQuestions.length,
      outputs: sqlOutputs.map(([filePath]) => path.relative(repoRoot, filePath))
    },
    null,
    2
  )
)
