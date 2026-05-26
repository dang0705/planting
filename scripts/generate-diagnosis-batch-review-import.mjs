import fs from 'node:fs/promises'
import path from 'node:path'

const projectRoot = '/Users/jay/WebstormProjects/planting'
const reportPath = path.join(
  projectRoot,
  'scripts/terminal-e2e/manifests/plant-sample-combination-audit.report.json'
)
const outputDir = path.join(projectRoot, 'tmp/import-sql/diagnosis')
const schemaFilePath = path.join(outputDir, '36-diagnosis-batch-review-schema.sql')
const manifestFilePath = path.join(outputDir, '37-diagnosis-batch-review-import.manifest.json')
const insertChunkSize = 40

function escapeSqlString(value = '') {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .split('\0')
    .join('')
}

function toSqlValue(value) {
  if (value === null || value === undefined) {
    return 'NULL'
  }
  return `'${escapeSqlString(value)}'`
}

function toSqlNumber(value, fallback = 0) {
  const normalized = Number(value)
  if (!Number.isFinite(normalized)) {
    return String(fallback)
  }
  return String(normalized)
}

function toSqlDateTime(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'NULL'
  }
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  const hours = `${date.getHours()}`.padStart(2, '0')
  const minutes = `${date.getMinutes()}`.padStart(2, '0')
  const seconds = `${date.getSeconds()}`.padStart(2, '0')
  return `'${year}-${month}-${day} ${hours}:${minutes}:${seconds}'`
}

function buildSchemaSql() {
  return `CREATE TABLE IF NOT EXISTS diagnosis_batch_reviews (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  diagnosis_id VARCHAR(64) NOT NULL,
  batch_source VARCHAR(64) NOT NULL DEFAULT 'plant-sample-combination-audit',
  source_schema VARCHAR(64) NOT NULL DEFAULT '',
  batch_generated_at DATETIME NULL,
  sample_label VARCHAR(64) NOT NULL DEFAULT '',
  sample_file_name VARCHAR(255) NOT NULL DEFAULT '',
  sample_absolute_path TEXT NULL,
  answer_path_signature TEXT NULL,
  answer_path_json LONGTEXT NULL,
  rounds_used INT NOT NULL DEFAULT 0,
  question_count INT NOT NULL DEFAULT 0,
  observed_evidence_count INT NOT NULL DEFAULT 0,
  diagnosis_direction_labels_json LONGTEXT NULL,
  _openid VARCHAR(64) DEFAULT '' NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_diagnosis_batch_reviews_diagnosis_id (diagnosis_id),
  KEY idx_diagnosis_batch_reviews_generated_at (batch_generated_at),
  KEY idx_diagnosis_batch_reviews_label (sample_label),
  KEY idx_diagnosis_batch_reviews_source (batch_source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`
}

function buildInsertSql(rows = [], generatedAt = '') {
  const values = rows.map(row => {
    const answerPathJson = JSON.stringify(Array.isArray(row.answerPath) ? row.answerPath : [])
    const directionLabelsJson = JSON.stringify(
      Array.isArray(row.diagnosisDirectionLabels) ? row.diagnosisDirectionLabels : []
    )

    return `(
${toSqlValue(row.diagnosisSessionId)},
${toSqlValue('plant-sample-combination-audit')},
${toSqlValue(row.sourceSchema || '')},
${toSqlDateTime(row.batchGeneratedAt || generatedAt)},
${toSqlValue(row.label || '')},
${toSqlValue(row.fileName || '')},
${toSqlValue(row.absolutePath || '')},
${toSqlValue(row.answerPathSignature || '')},
${toSqlValue(answerPathJson)},
${toSqlNumber(row.roundsUsed || 0)},
${toSqlNumber(row.questionCount || 0)},
${toSqlNumber(row.observedEvidenceCount || 0)},
${toSqlValue(directionLabelsJson)},
${toSqlDateTime(generatedAt)},
${toSqlDateTime(generatedAt)}
)`
  })

  return `INSERT INTO diagnosis_batch_reviews (
  diagnosis_id,
  batch_source,
  source_schema,
  batch_generated_at,
  sample_label,
  sample_file_name,
  sample_absolute_path,
  answer_path_signature,
  answer_path_json,
  rounds_used,
  question_count,
  observed_evidence_count,
  diagnosis_direction_labels_json,
  created_at,
  updated_at
) VALUES
${values.join(',\n')}
ON DUPLICATE KEY UPDATE
  batch_source = VALUES(batch_source),
  source_schema = VALUES(source_schema),
  batch_generated_at = VALUES(batch_generated_at),
  sample_label = VALUES(sample_label),
  sample_file_name = VALUES(sample_file_name),
  sample_absolute_path = VALUES(sample_absolute_path),
  answer_path_signature = VALUES(answer_path_signature),
  answer_path_json = VALUES(answer_path_json),
  rounds_used = VALUES(rounds_used),
  question_count = VALUES(question_count),
  observed_evidence_count = VALUES(observed_evidence_count),
  diagnosis_direction_labels_json = VALUES(diagnosis_direction_labels_json),
  updated_at = VALUES(updated_at);`
}

async function main() {
  const raw = await fs.readFile(reportPath, 'utf8')
  const report = JSON.parse(raw)
  const sourceSchema = String(report?.schema || '').trim()
  const generatedAt = String(report?.generatedAt || '').trim()
  const deduped = new Map()

  for (const item of Array.isArray(report?.results) ? report.results : []) {
    const diagnosisSessionId = String(item?.diagnosisSessionId || '').trim()
    if (!diagnosisSessionId) {continue}
    if (deduped.has(diagnosisSessionId)) {continue}
    deduped.set(diagnosisSessionId, {
      ...item,
      sourceSchema,
      batchGeneratedAt: generatedAt
    })
  }

  const rows = Array.from(deduped.values())

  await fs.mkdir(outputDir, { recursive: true })
  await fs.writeFile(schemaFilePath, `${buildSchemaSql()}\n`, 'utf8')

  const importFiles = []
  let chunkIndex = 0
  for (let offset = 0; offset < rows.length; offset += insertChunkSize) {
    chunkIndex += 1
    const chunkRows = rows.slice(offset, offset + insertChunkSize)
    const chunkFilePath = path.join(
      outputDir,
      `37-diagnosis-batch-review-import.part-${String(chunkIndex).padStart(2, '0')}.sql`
    )
    await fs.writeFile(chunkFilePath, `${buildInsertSql(chunkRows, generatedAt)}\n`, 'utf8')
    importFiles.push({
      filePath: chunkFilePath,
      rowCount: chunkRows.length
    })
  }

  await fs.writeFile(
    manifestFilePath,
    JSON.stringify(
      {
        generatedAt,
        sourceSchema,
        rowCount: rows.length,
        importFiles,
        diagnosisSessionIds: rows.map(row => row.diagnosisSessionId)
      },
      null,
      2
    ),
    'utf8'
  )

  console.log(
    JSON.stringify(
      {
        schemaFilePath,
        importFiles,
        manifestFilePath,
        rowCount: rows.length
      },
      null,
      2
    )
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
