import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import {
  createClosureBatchToolkit,
  ensureParentDir
} from './lib/ai-visual-pool-closure-batch.mjs'
import { buildAiVisualPoolClosureCompareDoc } from './lib/ai-visual-pool-closure-compare-doc.mjs'

const require = createRequire(import.meta.url)
const { metadata, sourceSets, closures } = require('./curation/ai_visual_pool_question_gap_closure_v1.js')

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sqlDir = path.join(repoRoot, 'tmp', 'import-sql', 'diagnosis')
const docsDir = path.join(repoRoot, 'docs')

const sqlFiles = {
  library: path.join(sqlDir, '22-question-library-ai-visual-pool-gap-closure.sql'),
  options: path.join(sqlDir, '23-question-option-mapping-ai-visual-pool-gap-closure.sql'),
  strategy: path.join(sqlDir, '24-question-strategy-ai-visual-pool-gap-closure.sql'),
  engine: path.join(sqlDir, '25-question-generation-engine-ai-visual-pool-gap-closure.sql')
}

const compareDocPath = path.join(docsDir, 'ai_visual_pool_19_gap_closure_compare_v1.md')

const evidenceLabelMap = {
  bad_root_smell: '闷臭/烂味',
  black_mold_growth: '黑霉层',
  blackened_stem_base: '茎基部变黑',
  bud_drop: '掉花苞',
  chewed_edges: '叶子边缘像被啃过',
  crispy_edges: '叶缘发脆',
  distorted_growth: '生长畸形',
  distorted_new_growth: '新叶畸形',
  flower_abort: '花发育失败',
  holes_in_leaf: '叶子被咬出了洞',
  leaf_bleaching: '叶片漂白',
  leaf_margin_burn: '叶缘灼伤',
  leaf_margin_necrosis: '叶缘坏死',
  leaf_mosaic_mottling: '叶子上有深浅不一、花花绿绿的斑驳花纹',
  leaf_twist: '叶片扭曲',
  low_humidity_damage: '低湿损伤',
  mushy_tissue: '组织糜烂',
  poor_drainage: '排水不良',
  skeletonized_leaves: '叶子被吃得只剩叶脉骨架',
  soft_stem: '茎变软',
  stem_collapse: '茎塌陷',
  sunburn_patch: '晒伤斑',
  tunnels_in_leaf: '叶子里面有弯弯的白线',
  uniform_browning: '整叶褐化',
  v_shaped_lesions: 'V 形病斑',
  water_soaked_stem: '水浸状茎',
  wind_damage: '风伤',
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
    compareDocPath,
    buildAiVisualPoolClosureCompareDoc({
      title: '# ai_visual_pool 19 条缺口正式收口对比文档 v1',
      metadata,
      sourceSets,
      closures,
      questionRows,
      strategyRows,
      sqlFiles: [sqlFiles.library, sqlFiles.options, sqlFiles.strategy, sqlFiles.engine],
      repoRoot,
      preClosureLines: [
        '- `ai_visual_pool=yes` 且 `data_status=audited` 的 visual/hybrid 症状池中，有 19 条正式 question data 缺口。',
        '- 缺口基线文档保留在 [docs/ai_visual_pool_question_gaps_v1.md](./ai_visual_pool_question_gaps_v1.md)。',
        '- 运行时兜底规则保留在 [docs/new-rules/视觉候选症状追问承接与兜底确认规则_v1.md](./new-rules/视觉候选症状追问承接与兜底确认规则_v1.md)。'
      ],
      reviewFocusLines: [
        '- 13 条 B/C/D 组症状均已采用双题：confirm + context。',
        '- 6 条高特异/高可见症状保留单题确认，不人为膨胀 queue。',
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
