import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { aiVisualPoolCoverageConfig } from './lib/ai-visual-pool-coverage-config.mjs'

const require = createRequire(import.meta.url)
const cloudbase = require('../cloudfunctions/layer/node_modules/@cloudbase/node-sdk')

const verificationConfig = {
  env: aiVisualPoolCoverageConfig.verifiedEnvId,
  prodSchema: aiVisualPoolCoverageConfig.verifiedSchemas.prod,
  devSchema: aiVisualPoolCoverageConfig.verifiedSchemas.dev,
  secretId: aiVisualPoolCoverageConfig.secretId,
  secretKey: aiVisualPoolCoverageConfig.secretKey,
  batchIds: aiVisualPoolCoverageConfig.batchIds,
  exceptionKeys: aiVisualPoolCoverageConfig.exceptionKeys
}

const app = cloudbase.init({
  env: verificationConfig.env,
  secretId: verificationConfig.secretId,
  secretKey: verificationConfig.secretKey
})

const models = app.models

async function run(sql) {
  const res = await models.$runSQL(sql, {})
  return res?.data?.executeResultList || []
}

async function collect(schema, { batchIds, exceptionKeys }) {
  const tables = [
    'question_library_v5_real',
    'question_option_mapping_v5_real',
    'question_strategy_v5_real',
    'question_generation_engine'
  ]
  const batchCounts = {}

  for (const [batchKey, batchId] of Object.entries(batchIds)) {
    batchCounts[batchKey] = {}
    for (const table of tables) {
      const auditedWhere =
        table === 'question_generation_engine'
          ? "review_status = 'audited'"
          : "data_status = 'audited' AND review_status = 'audited'"
      const rows = await run(
        `SELECT COUNT(*) AS count
         FROM \`${schema}\`.\`${table}\`
         WHERE source_batch_id = '${batchId}'
           AND ${auditedWhere}`
      )
      batchCounts[batchKey][table] = Number(rows[0]?.count || 0)
    }
  }

  const gaps = await run(`
    SELECT s.symptom_key, s.display_text_cn
    FROM \`${schema}\`.symptoms s
    WHERE s.data_status = 'audited'
      AND s.symptom_type IN ('visual', 'hybrid')
      AND JSON_UNQUOTE(s.ai_visual_pool) = 'yes'
      AND s.symptom_key NOT IN (${exceptionKeys.map(item => `'${item}'`).join(', ')})
      AND NOT EXISTS (
        SELECT 1
        FROM \`${schema}\`.question_library_v5_real q
        WHERE q.target_symptom_key = s.symptom_key
          AND q.data_status = 'audited'
          AND q.review_status = 'audited'
          AND EXISTS (
            SELECT 1
            FROM \`${schema}\`.question_option_mapping_v5_real qo
            WHERE qo.question_key = q.question_key
              AND qo.data_status = 'audited'
              AND qo.review_status = 'audited'
          )
          AND EXISTS (
            SELECT 1
            FROM \`${schema}\`.question_strategy_v5_real qs
            WHERE qs.question_key = q.question_key
              AND qs.data_status = 'audited'
              AND qs.review_status = 'audited'
          )
      )
    ORDER BY s.symptom_key ASC
  `)

  const exceptionRows = await run(`
    SELECT symptom_key, display_text_cn, data_status, signal_reliability
    FROM \`${schema}\`.symptoms
    WHERE symptom_key IN (${exceptionKeys.map(item => `'${item}'`).join(', ')})
  `)

  return {
    batchCounts,
    gaps,
    exceptionRows
  }
}

export async function verifyAiVisualPoolFormalCoverage(config = verificationConfig) {
  return {
    prod: await collect(config.prodSchema, config),
    dev: await collect(config.devSchema, config)
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const result = await verifyAiVisualPoolFormalCoverage()
  console.log(JSON.stringify(result, null, 2))
}
