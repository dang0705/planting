import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { aiVisualPoolCoverageConfig } from './lib/ai-visual-pool-coverage-config.mjs'
import { verifyAiVisualPoolFormalCoverage } from './verify-ai-visual-pool-stable-gap-closure.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const summaryDocPath = path.join(repoRoot, 'docs', 'ai_visual_pool_question_gap_closure_compare_v1.md')
const manifestPath = path.join(
  repoRoot,
  'scripts',
  'terminal-e2e',
  'manifests',
  'ai-visual-pool-question-gaps.json'
)
const config = aiVisualPoolCoverageConfig

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
}

function buildSchemaGapMap(result) {
  const schemaGapMap = new Map()

  for (const schemaKey of ['prod', 'dev']) {
    for (const item of result[schemaKey]?.gaps || []) {
      const symptomKey = String(item?.symptom_key || '').trim()
      if (!symptomKey) {continue}

      if (!schemaGapMap.has(symptomKey)) {
        schemaGapMap.set(symptomKey, {
          symptomKey,
          displayTextCn: String(item?.display_text_cn || '').trim(),
          missingSchemas: []
        })
      }

      const target = schemaGapMap.get(symptomKey)
      if (!target.missingSchemas.includes(schemaKey)) {
        target.missingSchemas.push(schemaKey)
      }
    }
  }

  return Array.from(schemaGapMap.values()).sort((left, right) =>
    left.symptomKey.localeCompare(right.symptomKey)
  )
}

function buildManifest(result) {
  const formalRisks = []
  const schemaGapItems = buildSchemaGapMap(result)
  const prodHasExceptionRow = result.prod.exceptionRows.some(
    item => item.symptom_key === 'normal_leaf_aging_stable'
  )
  const devHasExceptionRow = result.dev.exceptionRows.some(
    item => item.symptom_key === 'normal_leaf_aging_stable'
  )

  if (!prodHasExceptionRow || !devHasExceptionRow) {
    formalRisks.push({
      riskKey: 'exception_rule_runtime_database_split',
      status: 'open',
      description:
        'normal_leaf_aging_stable exception row is not aligned across prod/dev audited symptom dictionaries.',
      impact:
        'question coverage may be closed while external auditors still see prod/dev dictionary drift for the exception row',
      mitigation: [
        'treat runtime smoke as current behavior baseline',
        'keep compare doc and manifest explicit about the split',
        'run a prod/dev symptom dictionary alignment pass'
      ]
    })
  }

  return {
    verifiedAt: config.verifiedAt,
    verifiedEnvId: config.verifiedEnvId,
    verifiedSchemas: config.verifiedSchemas,
    criteria: config.criteria,
    sourceVerificationSummary: config.sourceVerificationSummary,
    verificationQueriesOrReports: config.verificationQueriesOrReports,
    verifiedBatches: Object.fromEntries(
      Object.entries(config.batchPurpose).map(([key, purpose]) => [
        config.batchIds[key],
        {
          purpose,
          counts: result.prod.batchCounts[key]
            ? {
                prod: result.prod.batchCounts[key],
                dev: result.dev.batchCounts[key]
              }
            : undefined
        }
      ])
    ),
    runtimeVerification: config.runtimeVerification,
    exceptionByDesignSymptoms: [
      {
        status: 'exception_by_design',
        symptomKey: 'normal_leaf_aging_stable',
        displayTextCn: '底部老叶稳定黄化',
        note:
          prodHasExceptionRow && devHasExceptionRow
            ? 'direct-output audited exception; prod/dev schema rows verified and runtime path verified by smoke'
            : 'direct-output audited exception; runtime path verified by smoke'
      }
    ],
    remainingMustCloseSummary: {
      prodGapCount: result.prod.gaps.length,
      devGapCount: result.dev.gaps.length,
      unionGapCount: schemaGapItems.length
    },
    remainingMustCloseSymptoms: schemaGapItems.map(item => ({
      status: 'must_close',
      symptomKey: item.symptomKey,
      displayTextCn: item.displayTextCn,
      missingSchemas: item.missingSchemas
    })),
    legacyPendingAuditedUpgradeSymptoms: schemaGapItems.map(item => ({
      status: 'legacy_pending_audited_upgrade',
      symptomKey: item.symptomKey,
      displayTextCn: item.displayTextCn,
      missingSchemas: item.missingSchemas
    })),
    formalRisks
  }
}

function buildSummaryDoc(result, manifest) {
  const lines = []
  const counts19 = manifest.verifiedBatches[config.batchIds.auditedGapClosure].counts
  const counts23 = manifest.verifiedBatches[config.batchIds.legacyGapClosure].counts
  const countsStable = manifest.verifiedBatches[config.batchIds.stableMarkingBridge].counts

  lines.push('# ai_visual_pool formal question coverage 对比文档 v1', '')
  lines.push(`验证日期：${config.verifiedAt}`, '')
  lines.push('## 1. 审计边界', '')
  lines.push(`- 验证环境：\`${config.verifiedEnvId}\``)
  lines.push('- 验证 schema：')
  lines.push(`  - prod：\`${config.verifiedSchemas.prod}\``)
  lines.push(`  - dev：\`${config.verifiedSchemas.dev}\``)
  lines.push('- runtime coverage 定义：')
  lines.push(`  - \`${config.criteria.table}.data_status = 'audited'\``)
  lines.push(`  - \`${config.criteria.table}.symptom_type IN ('visual', 'hybrid')\``)
  lines.push(`  - \`${config.criteria.table}.ai_visual_pool = yes\``)
  lines.push(
    "  - 对应 symptom 必须存在 `question_library_v5_real.data_status = 'audited' AND review_status = 'audited'`"
  )
  lines.push(
    "  - 且必须存在对应 `question_option_mapping_v5_real.data_status = 'audited' AND review_status = 'audited'`"
  )
  lines.push(
    "  - 且必须存在至少一条 `question_strategy_v5_real.data_status = 'audited' AND review_status = 'audited'`"
  )
  lines.push('- 明确不计入 formal runtime coverage：')
  lines.push('  - `question_generation_engine`')
  lines.push('  - 仅作为 `audited_generation_asset / 审计登记`', '')

  lines.push('## 2. 设计例外', '')
  lines.push('- `normal_leaf_aging_stable` 属于 `direct-output audited exception`')
  lines.push('- exception 状态：`exception_by_design`')
  lines.push('- 该 symptom 不要求进入 formal question coverage 统计')
  lines.push(
    '- 规则定义见 [ai_visual_pool直出例外与formal_question_coverage边界_v1.md](./new-rules/ai_visual_pool直出例外与formal_question_coverage边界_v1.md)',
    ''
  )

  lines.push('## 3. 本轮已验证的三批收口', '')
  lines.push('### 3.1 19 条 ai_visual_pool 缺口收口批次', '')
  lines.push(`- batch：\`${config.batchIds.auditedGapClosure}\``)
  lines.push(`- 目标：${config.batchPurpose.auditedGapClosure}`)
  lines.push('- 验证结果：')
  lines.push('  - prod：')
  lines.push(`    - \`question_library_v5_real = ${counts19.prod.question_library_v5_real}\``)
  lines.push(`    - \`question_option_mapping_v5_real = ${counts19.prod.question_option_mapping_v5_real}\``)
  lines.push(`    - \`question_strategy_v5_real = ${counts19.prod.question_strategy_v5_real}\``)
  lines.push(`    - \`question_generation_engine = ${counts19.prod.question_generation_engine}\``)
  lines.push('  - dev：')
  lines.push(`    - \`question_library_v5_real = ${counts19.dev.question_library_v5_real}\``)
  lines.push(`    - \`question_option_mapping_v5_real = ${counts19.dev.question_option_mapping_v5_real}\``)
  lines.push(`    - \`question_strategy_v5_real = ${counts19.dev.question_strategy_v5_real}\``)
  lines.push(`    - \`question_generation_engine = ${counts19.dev.question_generation_engine}\``)
  lines.push(
    '- 结论：这 `19` 条原始缺口已全部进入正式 audited 题库链，`question_generation_engine` 仅作审计资产。',
    ''
  )

  lines.push('### 3.2 stable natural marking formal bridge 批次', '')
  lines.push(`- batch：\`${config.batchIds.stableMarkingBridge}\``)
  lines.push(`- 目标：${config.batchPurpose.stableMarkingBridge}`)
  lines.push('- 验证结果：')
  lines.push('  - prod：')
  lines.push(`    - \`question_library_v5_real = ${countsStable.prod.question_library_v5_real}\``)
  lines.push(`    - \`question_option_mapping_v5_real = ${countsStable.prod.question_option_mapping_v5_real}\``)
  lines.push(`    - \`question_strategy_v5_real = ${countsStable.prod.question_strategy_v5_real}\``)
  lines.push(`    - \`question_generation_engine = ${countsStable.prod.question_generation_engine}\``)
  lines.push('  - dev：')
  lines.push(`    - \`question_library_v5_real = ${countsStable.dev.question_library_v5_real}\``)
  lines.push(`    - \`question_option_mapping_v5_real = ${countsStable.dev.question_option_mapping_v5_real}\``)
  lines.push(`    - \`question_strategy_v5_real = ${countsStable.dev.question_strategy_v5_real}\``)
  lines.push(`    - \`question_generation_engine = ${countsStable.dev.question_generation_engine}\``)
  lines.push('')

  lines.push('### 3.3 legacy 23 条 ai_visual_pool 缺口收口批次', '')
  lines.push(`- batch：\`${config.batchIds.legacyGapClosure}\``)
  lines.push(`- 目标：${config.batchPurpose.legacyGapClosure}`)
  lines.push('- 验证结果：')
  lines.push('  - prod：')
  lines.push(`    - \`question_library_v5_real = ${counts23.prod.question_library_v5_real}\``)
  lines.push(`    - \`question_option_mapping_v5_real = ${counts23.prod.question_option_mapping_v5_real}\``)
  lines.push(`    - \`question_strategy_v5_real = ${counts23.prod.question_strategy_v5_real}\``)
  lines.push(`    - \`question_generation_engine = ${counts23.prod.question_generation_engine}\``)
  lines.push('  - dev：')
  lines.push(`    - \`question_library_v5_real = ${counts23.dev.question_library_v5_real}\``)
  lines.push(`    - \`question_option_mapping_v5_real = ${counts23.dev.question_option_mapping_v5_real}\``)
  lines.push(`    - \`question_strategy_v5_real = ${counts23.dev.question_strategy_v5_real}\``)
  lines.push(`    - \`question_generation_engine = ${counts23.dev.question_generation_engine}\``)
  lines.push('')

  lines.push('## 4. 运行时验证', '')
  lines.push('### 4.1 stable marking smoke', '')
  lines.push(
    `- 远端会话：\`${config.runtimeVerification.stableMarkingSmoke.diagnosisSessionId}\``
  )
  lines.push(`- \`questionCount = ${config.runtimeVerification.stableMarkingSmoke.start.questionCount}\``)
  lines.push(
    `- \`outcomeType = ${config.runtimeVerification.stableMarkingSmoke.final.outcomeType}\`, \`nonProblematicType = ${config.runtimeVerification.stableMarkingSmoke.final.nonProblematicType}\``,
    ''
  )
  lines.push('### 4.2 normal leaf aging 直出例外 smoke', '')
  lines.push(
    `- 远端会话：\`${config.runtimeVerification.normalLeafAgingExceptionSmoke.diagnosisSessionId}\``
  )
  lines.push(
    `- \`questionCount = ${config.runtimeVerification.normalLeafAgingExceptionSmoke.start.questionCount}\``
  )
  lines.push(
    `- \`outcomeType = ${config.runtimeVerification.normalLeafAgingExceptionSmoke.final.outcomeType}\`, \`nonProblematicType = ${config.runtimeVerification.normalLeafAgingExceptionSmoke.final.nonProblematicType}\``,
    ''
  )

  lines.push('## 5. 当前剩余 formal must-close 症状', '')
  lines.push(`- prod gap count：\`${manifest.remainingMustCloseSummary.prodGapCount}\``)
  lines.push(`- dev gap count：\`${manifest.remainingMustCloseSummary.devGapCount}\``)
  lines.push(`- union gap count：\`${manifest.remainingMustCloseSummary.unionGapCount}\``)
  lines.push(`- 当前 \`remainingMustCloseSymptoms = ${manifest.remainingMustCloseSymptoms.length}\``)
  lines.push(
    `- 当前 \`legacyPendingAuditedUpgradeSymptoms = ${manifest.legacyPendingAuditedUpgradeSymptoms.length}\``
  )
  if (manifest.remainingMustCloseSymptoms.length === 0) {
    lines.push(
      "- 说明：在 `symptoms.data_status='audited' AND symptom_type IN ('visual','hybrid') AND ai_visual_pool=yes` 的 formal 审计边界内，除设计例外 `normal_leaf_aging_stable` 外，prod/dev 两个 schema 已全部具备 audited 正式 question coverage。"
    )
  } else {
    lines.push('- 当前未收口 symptom 列表：')
    for (const item of manifest.legacyPendingAuditedUpgradeSymptoms) {
      lines.push(
        `  - \`${item.symptomKey}\` / ${item.displayTextCn || '未命名'} / missingSchemas=${item.missingSchemas.join(',')}`
      )
    }
  }
  lines.push('')

  lines.push('## 6. sourceVerificationSummary', '')
  lines.push(
    `- 19-gap 权威来源集合来自 [ai_visual_pool_question_gap_closure_v1.js](/Users/jay/WebstormProjects/planting/${config.sourceVerificationSummary.auditedGapClosureGenerator})`
  )
  lines.push(
    `- legacy-23-gap 权威来源集合来自 [ai_visual_pool_legacy_gap_closure_v1.js](/Users/jay/WebstormProjects/planting/${config.sourceVerificationSummary.legacyGapClosureGenerator})`
  )
  lines.push(
    `- stable-marking bridge 生成器在 [generate-ai-visual-pool-stable-marking-audited-upgrade.mjs](/Users/jay/WebstormProjects/planting/${config.sourceVerificationSummary.stableMarkingBridgeGenerator})`
  )
  lines.push(
    `- formal artifact renderer 在 [render-ai-visual-pool-coverage-artifacts.mjs](/Users/jay/WebstormProjects/planting/${config.sourceVerificationSummary.artifactRenderer})`
  )
  lines.push('')

  lines.push('## 7. verificationQueriesOrReports', '')
  for (const item of config.verificationQueriesOrReports) {
    lines.push(`- [${path.basename(item)}](/Users/jay/WebstormProjects/planting/${item})`)
  }
  lines.push('')

  lines.push('## 8. formal 风险', '')
  lines.push(`- 当前 open formal 风险：\`${manifest.formalRisks.length}\``)
  if (!manifest.formalRisks.length) {
    lines.push('- 结果说明：')
    lines.push(`  - \`remainingMustCloseSymptoms = ${manifest.remainingMustCloseSymptoms.length}\``)
    lines.push(
      '  - `normal_leaf_aging_stable` 的 exception row 已在 prod/dev 两个 schema 都可查到'
    )
    lines.push(
      '  - `exception_by_design` 的 runtime 行为和审计态字典已完成对齐'
    )
  }
  lines.push('')

  lines.push('## 9. 外部 GPT 审核建议', '')
  lines.push(
    '1. `runtime coverage` 是否严格只按 `question_library_v5_real + question_option_mapping_v5_real + question_strategy_v5_real` 认定'
  )
  lines.push('2. `question_generation_engine` 是否仅作为审计资产，不被误计入 runtime coverage')
  lines.push('3. `normal_leaf_aging_stable` 是否被清晰标注为 `direct-output audited exception`')
  lines.push(
    '4. `remainingMustCloseSymptoms` 是否已经归零，且 prod/dev 两个 schema 是否都能查到 `normal_leaf_aging_stable` 的 exception row'
  )

  return `${lines.join('\n')}\n`
}

const result = await verifyAiVisualPoolFormalCoverage()
const manifest = buildManifest(result)
const summaryDoc = buildSummaryDoc(result, manifest)

ensureParentDir(summaryDocPath)
ensureParentDir(manifestPath)
fs.writeFileSync(summaryDocPath, summaryDoc, 'utf8')
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

console.log(
  JSON.stringify(
    {
      ok: true,
      outputs: {
        summaryDoc: path.relative(repoRoot, summaryDocPath),
        manifest: path.relative(repoRoot, manifestPath)
      },
      remainingMustCloseSymptoms: manifest.remainingMustCloseSymptoms.length,
      formalRiskCount: manifest.formalRisks.length
    },
    null,
    2
  )
)
