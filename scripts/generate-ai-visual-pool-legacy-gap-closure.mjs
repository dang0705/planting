import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import {
  createClosureBatchToolkit,
  ensureParentDir,
  buildDevSyncSql,
  libraryColumns,
  optionColumns,
  strategyColumns,
  engineColumns
} from './lib/ai-visual-pool-closure-batch.mjs'
import { buildAiVisualPoolClosureCompareDoc } from './lib/ai-visual-pool-closure-compare-doc.mjs'

const require = createRequire(import.meta.url)
const { metadata, sourceSets, closures } = require('./curation/ai_visual_pool_legacy_gap_closure_v1.js')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlDir = path.join(repoRoot, 'tmp', 'import-sql', 'diagnosis')
const devSyncDir = path.join(repoRoot, 'tmp', 'import-sql', 'diagnosis-dev-sync')
const docsDir = path.join(repoRoot, 'docs')

const sqlFiles = {
  library: path.join(sqlDir, '30-question-library-ai-visual-pool-legacy-gap-closure.sql'),
  options: path.join(sqlDir, '31-question-option-mapping-ai-visual-pool-legacy-gap-closure.sql'),
  strategy: path.join(sqlDir, '32-question-strategy-ai-visual-pool-legacy-gap-closure.sql'),
  engine: path.join(sqlDir, '33-question-generation-engine-ai-visual-pool-legacy-gap-closure.sql'),
  devSyncLibrary: path.join(
    devSyncDir,
    '09-question-library-ai-visual-pool-legacy-gap-closure.sql'
  ),
  devSyncOptions: path.join(
    devSyncDir,
    '10-question-option-mapping-ai-visual-pool-legacy-gap-closure.sql'
  ),
  devSyncStrategy: path.join(
    devSyncDir,
    '11-question-strategy-ai-visual-pool-legacy-gap-closure.sql'
  ),
  devSyncEngine: path.join(
    devSyncDir,
    '12-question-generation-engine-ai-visual-pool-legacy-gap-closure.sql'
  )
}

const compareDocPath = path.join(docsDir, 'ai_visual_pool_legacy_gap_closure_compare_v1.md')

const evidenceLabelMap = {
  bad_root_smell: '闷臭/烂味',
  black_mold_growth: '黑霉层',
  blackened_stem_base: '茎基部变黑',
  bud_drop: '掉花苞',
  chewed_edges: '叶子边缘像被啃过',
  crispy_edges: '叶缘发脆',
  distorted_growth: '生长畸形',
  distorted_new_growth: '新叶畸形',
  edema: '水肿',
  fine_webbing: '叶子上有很细的丝网',
  flower_abort: '花发育失败',
  gray_fuzzy_mold: '表面长了灰色绒毛霉',
  holes_in_leaf: '叶子被咬出了洞',
  irregular_blotches: '不规则斑块',
  leaf_curl: '叶片卷曲',
  leaf_bleaching: '叶片漂白',
  leaf_margin_burn: '叶缘灼伤',
  leaf_margin_necrosis: '叶缘坏死',
  leaf_mosaic_mottling: '叶子上有深浅不一、花花绿绿的斑驳花纹',
  leaf_yellowing: '叶子明显发黄',
  leaf_twist: '叶片扭曲',
  low_humidity_damage: '低湿损伤',
  mold_on_soil: '盆土表面长霉',
  mushy_tissue: '组织糜烂',
  orange_spots: '橙色斑',
  patchy_browning: '局部褐变',
  poor_drainage: '排水不良',
  powder_white: '叶子上有一层白粉',
  rust_pustules: '锈孢子堆',
  skeletonized_leaves: '叶子被吃得只剩叶脉骨架',
  silver_streaks: '叶面有银色划痕或银斑',
  small_flies_soil: '盆土附近有很多小飞虫',
  sooty_mold: '叶子表面有黑灰一样的脏层',
  soft_stem: '茎变软',
  stem_collapse: '茎塌陷',
  sticky_honeydew: '叶子摸起来发黏',
  stippling: '叶子上有很多细小的褪色点',
  sunken_lesions: '凹陷病斑',
  sunburn_patch: '晒伤斑',
  tunnels_in_leaf: '叶子里面有弯弯的白线',
  uniform_browning: '整叶褐化',
  v_shaped_lesions: 'V 形病斑',
  water_soaked_spots: '水渍斑',
  water_soaked_stem: '水浸状茎',
  white_fuzz: '白色菌丝',
  wind_damage: '风伤',
  yellow_new_leaves: '新叶更黄',
  yellow_speckling: '黄色细小斑点',
  yellowing_patchy: '局部黄化'
}

const {
  flattenQuestions,
  buildQuestionLibrarySql,
  buildOptionRows,
  buildQuestionOptionSql,
  buildStrategyRows,
  buildStrategySql,
  buildEngineRows,
  buildEngineSql
} = createClosureBatchToolkit({
  metadata,
  sourceSets,
  evidenceLabelMap
})

const questionRows = flattenQuestions(closures)
const optionRows = buildOptionRows(questionRows)
const strategyRows = buildStrategyRows(questionRows)
const engineRows = buildEngineRows(questionRows)

const outputs = [
  [sqlFiles.library, buildQuestionLibrarySql(questionRows)],
  [sqlFiles.options, buildQuestionOptionSql(optionRows)],
  [sqlFiles.strategy, buildStrategySql(strategyRows)],
  [sqlFiles.engine, buildEngineSql(engineRows)],
  [
    sqlFiles.devSyncLibrary,
    buildDevSyncSql({
      targetTable: 'question_library_v5_real',
      columns: libraryColumns,
      keyColumns: ['question_key'],
      sourceSchema: metadata.envId,
      batchId: metadata.batchId
    })
  ],
  [
    sqlFiles.devSyncOptions,
    buildDevSyncSql({
      targetTable: 'question_option_mapping_v5_real',
      columns: optionColumns,
      keyColumns: ['question_key', 'option_key'],
      sourceSchema: metadata.envId,
      batchId: metadata.batchId
    })
  ],
  [
    sqlFiles.devSyncStrategy,
    buildDevSyncSql({
      targetTable: 'question_strategy_v5_real',
      columns: strategyColumns,
      keyColumns: ['problem_key', 'question_group_key', 'question_key'],
      sourceSchema: metadata.envId,
      batchId: metadata.batchId
    })
  ],
  [
    sqlFiles.devSyncEngine,
    buildDevSyncSql({
      targetTable: 'question_generation_engine',
      columns: engineColumns,
      keyColumns: ['engine_rule_key'],
      sourceSchema: metadata.envId,
      batchId: metadata.batchId
    })
  ],
  [
    compareDocPath,
    buildAiVisualPoolClosureCompareDoc({
      title: '# ai_visual_pool legacy 23 条缺口正式收口对比文档 v1',
      metadata,
      sourceSets,
      closures,
      questionRows,
      strategyRows,
      sqlFiles: [
        sqlFiles.library,
        sqlFiles.options,
        sqlFiles.strategy,
        sqlFiles.engine,
        sqlFiles.devSyncLibrary,
        sqlFiles.devSyncOptions,
        sqlFiles.devSyncStrategy,
        sqlFiles.devSyncEngine
      ],
      repoRoot,
      preClosureLines: [
        '- `ai_visual_pool=yes` 且 `data_status=audited` 的 visual/hybrid 症状池中，当前剩余 23 条 legacy formal question coverage 缺口。',
        '- 缺口基线文档保留在 [docs/ai_visual_pool_question_gaps_v1.md](./ai_visual_pool_question_gaps_v1.md)。',
        '- 运行时兜底规则保留在 [docs/new-rules/视觉候选症状追问承接与兜底确认规则_v1.md](./new-rules/视觉候选症状追问承接与兜底确认规则_v1.md)。'
      ],
      reviewFocusLines: [
        '- 这批题库不是逐 symptom 的固定问卷，而是按 spider/thrips、honeydew pests、fungus gnat、leaf spot、anthracnose、edema、yellowing 等 cluster 建组。',
        '- 需要继续分流的症状保留 confirm + context；高特异或高可见症状保留单题确认，避免把 queue 膨胀成模板卷。',
        '- 所有正式题均具备 `yes / no / unknown` 三个 audited 选项。',
        '- 所有题都带有权威来源 URL，可被外部 GPT 继续逐条抽查。'
      ]
    })
  ]
]

for (const [filePath, content] of outputs) {
  ensureParentDir(filePath)
  fs.writeFileSync(filePath, `${content}\n`, 'utf8')
}

console.log(
  JSON.stringify(
    {
      ok: true,
      batchId: metadata.batchId,
      outputs: Object.fromEntries(
        Object.entries({
          ...sqlFiles,
          compareDoc: compareDocPath
        }).map(([key, value]) => [key, path.relative(repoRoot, value)])
      ),
      questionCount: questionRows.length,
      optionCount: optionRows.length,
      strategyCount: strategyRows.length,
      engineRuleCount: engineRows.length
    },
    null,
    2
  )
)
