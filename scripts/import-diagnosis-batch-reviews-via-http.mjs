import fs from 'node:fs/promises'
import path from 'node:path'

const projectRoot = '/Users/jay/WebstormProjects/planting'
const reportPath = path.join(
  projectRoot,
  'scripts/terminal-e2e/manifests/plant-sample-combination-audit.report.json'
)
const baseUrl =
  process.env.DIAGNOSIS_REVIEW_IMPORT_BASE_URL ||
  'http://localhost:5173/__tcb_functions__/diagnose-http'
const openid = process.env.DIAGNOSIS_REVIEW_IMPORT_OPENID || 'dev_terminal_diagnosis_review_h5'
const chunkSize = Number(process.env.DIAGNOSIS_REVIEW_IMPORT_CHUNK_SIZE || 40)
const appEnv = process.env.DIAGNOSIS_REVIEW_IMPORT_APP_ENV || 'development'
const batchSource =
  process.env.DIAGNOSIS_REVIEW_IMPORT_BATCH_SOURCE || 'plant-sample-combination-audit'

function dedupeResults(results = [], generatedAt = '', sourceSchema = '') {
  const deduped = new Map()
  for (const item of Array.isArray(results) ? results : []) {
    const diagnosisSessionId = String(item?.diagnosisSessionId || '').trim()
    if (!diagnosisSessionId || deduped.has(diagnosisSessionId)) {
      continue
    }
    deduped.set(diagnosisSessionId, {
      diagnosisSessionId,
      sourceSchema,
      batchGeneratedAt: generatedAt,
      label: item?.label || '',
      fileName: item?.fileName || '',
      absolutePath: item?.absolutePath || '',
      answerPathSignature: item?.answerPathSignature || '',
      answerPath: Array.isArray(item?.answerPath) ? item.answerPath : [],
      roundsUsed: Number(item?.roundsUsed || 0),
      questionCount: Number(item?.questionCount || 0),
      observedEvidenceCount: Number(item?.observedEvidenceCount || 0),
      diagnosisDirectionLabels: Array.isArray(item?.diagnosisDirectionLabels)
        ? item.diagnosisDirectionLabels
        : []
    })
  }
  return Array.from(deduped.values())
}

async function postChunk(records = []) {
  const response = await fetch(
    `${baseUrl}/diagnosis/feedback?skipAuth=true&openid=${encodeURIComponent(openid)}&webfn=true&appEnv=${encodeURIComponent(appEnv)}&action=importBatch`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        action: 'importBatch',
        skipAuth: true,
        openid,
        appEnv,
        batchSource,
        records
      })
    }
  )

  const json = await response.json()
  if (!response.ok || Number(json?.code || 500) !== 200) {
    throw new Error(`import_batch_failed:${response.status}:${JSON.stringify(json)}`)
  }
  return json?.data || {}
}

async function main() {
  const raw = await fs.readFile(reportPath, 'utf8')
  const report = JSON.parse(raw)
  const rows = dedupeResults(report?.results, report?.generatedAt, report?.schema)
  const chunks = []

  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    chunks.push(rows.slice(offset, offset + chunkSize))
  }

  const imported = []
  for (let index = 0; index < chunks.length; index += 1) {
    const data = await postChunk(chunks[index])
    imported.push({
      chunkIndex: index + 1,
      upsertedCount: Number(data?.upsertedCount || 0)
    })
  }

  console.log(
    JSON.stringify(
      {
        rowCount: rows.length,
        chunkSize,
        appEnv,
        batchSource,
        chunks: imported
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
