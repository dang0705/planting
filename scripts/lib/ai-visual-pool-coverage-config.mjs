const cloudbaseSecretId = String(
  process.env.CLOUDBASE_SECRET_ID ||
  process.env.TENCENT_SECRET_ID ||
  process.env.TENCENTCLOUD_SECRETID ||
  ''
).trim()
const cloudbaseSecretKey = String(
  process.env.CLOUDBASE_SECRET_KEY ||
  process.env.TENCENT_SECRET_KEY ||
  process.env.TENCENTCLOUD_SECRETKEY ||
  ''
).trim()

export const aiVisualPoolCoverageConfig = {
  verifiedAt: '2026-04-13',
  verifiedEnvId: 'cloud1-2grufevs395a9d5e',
  verifiedSchemas: {
    prod: 'cloud1-2grufevs395a9d5e',
    dev: 'cloud1_dev'
  },
  secretId: cloudbaseSecretId,
  secretKey: cloudbaseSecretKey,
  batchIds: {
    auditedGapClosure: 'batch_20260413_ai_visual_pool_gap_closure',
    legacyGapClosure: 'batch_20260413_ai_visual_pool_legacy_gap_closure',
    stableMarkingBridge: 'batch_20260413_ai_visual_np_gap_closure'
  },
  batchPurpose: {
    auditedGapClosure: 'close original 19 ai_visual_pool formal audited question gaps',
    legacyGapClosure:
      'close remaining 23 legacy ai_visual_pool formal audited question gaps and sync prod audited assets to cloud1_dev',
    stableMarkingBridge: 'bridge stable_natural_marking_pattern into formal audited question coverage'
  },
  exceptionKeys: ['normal_leaf_aging_stable'],
  criteria: {
    table: 'symptoms',
    filters: {
      data_status: 'audited',
      symptom_type: ['visual', 'hybrid'],
      ai_visual_pool: 'yes'
    },
    runtimeCoverageDefinition:
      "question_library_v5_real.data_status='audited' AND question_library_v5_real.review_status='audited' AND question_option_mapping_v5_real.data_status='audited' AND question_option_mapping_v5_real.review_status='audited' AND question_strategy_v5_real.data_status='audited' AND question_strategy_v5_real.review_status='audited'",
    excludedFromFormalCoverageByDesign: ['normal_leaf_aging_stable'],
    notCountedAsFormalRuntimeCoverage: ['question_generation_engine']
  },
  sourceVerificationSummary: {
    auditedGapClosureGenerator: 'scripts/curation/ai_visual_pool_question_gap_closure_v1.js',
    legacyGapClosureGenerator: 'scripts/curation/ai_visual_pool_legacy_gap_closure_v1.js',
    auditedGapClosureSqlGenerator: 'scripts/generate-ai-visual-pool-question-gap-closure.mjs',
    legacyGapClosureSqlGenerator: 'scripts/generate-ai-visual-pool-legacy-gap-closure.mjs',
    stableMarkingBridgeGenerator: 'scripts/generate-ai-visual-pool-stable-marking-audited-upgrade.mjs',
    sqlVerifier: 'scripts/verify-ai-visual-pool-stable-gap-closure.mjs',
    artifactRenderer: 'scripts/render-ai-visual-pool-coverage-artifacts.mjs',
    runtimeSmoke: 'scripts/terminal-e2e/cloudbase-http-check.mjs'
  },
  verificationQueriesOrReports: [
    'scripts/verify-ai-visual-pool-stable-gap-closure.mjs',
    'scripts/render-ai-visual-pool-coverage-artifacts.mjs',
    'scripts/terminal-e2e/cloudbase-http-check.mjs',
    'docs/ai_visual_pool_question_gap_closure_compare_v1.md',
    'docs/ai_visual_pool_19_gap_closure_compare_v1.md',
    'docs/ai_visual_pool_legacy_gap_closure_compare_v1.md'
  ],
  runtimeVerification: {
    stableMarkingSmoke: {
      diagnosisSessionId: 'diag_1776063700957_6x91qqbj',
      start: {
        stage: 'followup',
        routePrimaryAction: 'ask_first',
        questionCount: 3
      },
      final: {
        outcomeType: 'non_problematic',
        nonProblematicType: 'stable_natural_marking',
        stopReason: 'non_problematic_output_ready'
      }
    },
    normalLeafAgingExceptionSmoke: {
      diagnosisSessionId: 'diag_1776063707045_6rj7jbtx',
      start: {
        stage: 'final',
        questionCount: 0
      },
      final: {
        outcomeType: 'non_problematic',
        nonProblematicType: 'normal_leaf_aging',
        stopReason: 'non_problematic_output_ready'
      }
    }
  }
}
