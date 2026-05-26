#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeBool(value = '', fallback = false) {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) {return fallback}
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {return true}
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {return false}
  return fallback
}

function parseCsvLine(line = '') {
  const cells = []
  let current = ''
  let inQuotes = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (char === ',' && !inQuotes) {
      cells.push(current)
      current = ''
      continue
    }

    current += char
  }

  cells.push(current)
  return cells.map(cell => cell.trim())
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function safeJsonParse(value, fallback = null) {
  try {
    return JSON.parse(value)
  } catch (error) {
    if (fallback !== null) {
      return fallback
    }
    throw error
  }
}

async function loadCsvRows(csvPath) {
  const content = await fs.readFile(csvPath, 'utf8')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  assertCondition(lines.length > 1, `CSV 内容为空: ${csvPath}`)

  const headers = parseCsvLine(lines[0]).map(item => normalizeText(item).toLowerCase())
  const labelIndex = headers.indexOf('label')
  const fileNameIndex = headers.indexOf('file_name')
  const plantCatalogIdIndex = headers.indexOf('plant_catalog_id')
  const plantNameIndex = headers.indexOf('plant_name')
  const notesIndex = headers.indexOf('notes')

  assertCondition(labelIndex !== -1, 'CSV 缺少 label 列')
  assertCondition(fileNameIndex !== -1, 'CSV 缺少 file_name 列')
  assertCondition(plantCatalogIdIndex !== -1, 'CSV 缺少 plant_catalog_id 列')

  return lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    return {
      label: normalizeText(cells[labelIndex] || ''),
      fileName: normalizeText(cells[fileNameIndex] || ''),
      plantCatalogId: normalizeText(cells[plantCatalogIdIndex] || ''),
      plantName: normalizeText(cells[plantNameIndex] || ''),
      notes: normalizeText(cells[notesIndex] || '')
    }
  }).filter(item => item.label && item.fileName)
}

function buildCoverage(rows = [], labels = []) {
  const coverage = {}
  for (const label of labels) {
    coverage[label] = {
      total: 0,
      mapped: 0,
      unmapped: 0,
      missingFiles: []
    }
  }

  for (const row of rows) {
    if (!coverage[row.label]) {
      coverage[row.label] = {
        total: 0,
        mapped: 0,
        unmapped: 0,
        missingFiles: []
      }
    }

    coverage[row.label].total += 1
    if (row.plantCatalogId) {
      coverage[row.label].mapped += 1
    } else {
      coverage[row.label].unmapped += 1
      coverage[row.label].missingFiles.push(row.fileName)
    }
  }

  return coverage
}

async function collectLabels(samplesDir, explicitLabels = '', csvRows = []) {
  const requested = String(explicitLabels || '')
    .split(',')
    .map(item => normalizeText(item))
    .filter(Boolean)

  if (requested.length) {
    return requested
  }

  const csvLabels = Array.from(new Set(
    (csvRows || [])
      .map(item => normalizeText(item.label))
      .filter(Boolean)
  )).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))

  if (csvLabels.length) {
    return csvLabels
  }

  const entries = await fs.readdir(samplesDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

async function runBatchCommand({
  envId,
  samplesDir,
  label,
  csvPath,
  reportFile,
  answerPattern,
  appEnv,
  openidPrefix,
  keepUploadedImage
}) {
  const scriptPath = path.join(__dirname, 'run-visual-symptom-batch.mjs')
  const childArgs = [
    scriptPath,
    `--env=${envId}`,
    `--samples-dir=${samplesDir}`,
    `--label=${label}`,
    `--plant-map-csv=${csvPath}`,
    '--skip-unmapped=true',
    `--answer-pattern=${answerPattern}`,
    `--app-env=${appEnv}`,
    `--openid-prefix=${openidPrefix}`,
    `--keep-uploaded-image=${keepUploadedImage}`,
    `--report-file=${reportFile}`
  ]

  const { stdout } = await execFileAsync('node', childArgs, {
    cwd: path.resolve(__dirname, '..', '..'),
    maxBuffer: 1024 * 1024 * 20
  })

  const parsed = safeJsonParse(stdout, null)
  assertCondition(
    parsed && typeof parsed === 'object' && parsed.summary && typeof parsed.summary === 'object',
    `child stdout 协议损坏，未返回 suite JSON: ${String(stdout || '').slice(0, 500)}`
  )
  return parsed
}

function summarizeSuite(labelResults = [], coverage = {}) {
  const resultMap = Object.fromEntries(labelResults.map(item => [item.label, item]))
  const summary = {
    labels: Object.keys(coverage).length,
    runnableLabels: 0,
    blockedLabels: 0,
    totalCases: 0,
    mappedCases: 0,
    unmappedCases: 0,
    fullyRunnableCases: 0,
    blockedCases: 0,
    totalSuccess: 0,
    totalFailed: 0,
    totalSkipped: 0
  }

  for (const [label, labelCoverage] of Object.entries(coverage)) {
    summary.totalCases += Number(labelCoverage.total || 0)
    summary.mappedCases += Number(labelCoverage.mapped || 0)
    summary.unmappedCases += Number(labelCoverage.unmapped || 0)

    if (!labelCoverage.total || labelCoverage.unmapped > 0) {
      summary.blockedLabels += 1
      summary.blockedCases += Number(labelCoverage.total || 0)
      summary.totalSkipped += Number(labelCoverage.total || 0)
      continue
    }

    summary.runnableLabels += 1
    summary.fullyRunnableCases += Number(labelCoverage.total || 0)

    const item = resultMap[label]
    if (!item) {
      continue
    }

    summary.totalSuccess += Number(item.summary?.success || 0)
    summary.totalFailed += Number(item.summary?.failed || 0)
    summary.totalSkipped += Number(item.summary?.skipped || 0)
  }

  return summary
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(args.root || '.')
  const envId = normalizeText(args.env || process.env.CLOUDBASE_ENV_ID || '')
  const samplesDir = path.resolve(args['samples-dir'] || path.join(repoRoot, 'plant-sample', 'symptoms'))
  const csvPath = path.resolve(
    args['plant-map-csv'] || path.join(repoRoot, 'docs', 'mvp-simplify', 'codex', '症状样本物种映射模板_v1.csv')
  )
  const outDir = path.resolve(args['out-dir'] || path.join(repoRoot, 'docs', 'mvp-simplify', 'codex', 'reports'))
  const validateOnly = normalizeBool(args['validate-only'], false)
  const answerPattern = normalizeText(args['answer-pattern'] || 'unknown') || 'unknown'
  const appEnv = normalizeText(args['app-env'] || 'development') || 'development'
  const openidPrefix = normalizeText(args['openid-prefix'] || 'visual_suite') || 'visual_suite'
  const keepUploadedImage = normalizeText(args['keep-uploaded-image'] || 'false') || 'false'

  const rows = await loadCsvRows(csvPath)
  const labels = await collectLabels(samplesDir, args.labels || '', rows)
  const coverage = buildCoverage(rows, labels)

  const output = {
    generatedAt: new Date().toISOString(),
    envId,
    samplesDir,
    csvPath,
    validateOnly,
    answerPattern,
    coverage,
    labelResults: [],
    summary: {
      labels: labels.length,
      runnableLabels: 0,
      blockedLabels: 0,
      totalCases: 0,
      mappedCases: 0,
      unmappedCases: 0,
      fullyRunnableCases: 0,
      blockedCases: 0,
      totalSuccess: 0,
      totalFailed: 0,
      totalSkipped: 0
    }
  }

  await fs.mkdir(outDir, { recursive: true })

  if (!validateOnly) {
    assertCondition(envId, '缺少 --env=cloudbase-env-id')

    for (const label of labels) {
      const labelCoverage = coverage[label] || { total: 0, mapped: 0, unmapped: 0, missingFiles: [] }
      if (!labelCoverage.total || labelCoverage.unmapped > 0) {
        output.labelResults.push({
          label,
          runnable: false,
          reportFile: '',
          summary: {
            total: labelCoverage.total || 0,
            success: 0,
            failed: 0,
            skipped: labelCoverage.total || 0
          },
          reason: !labelCoverage.total ? 'csv_missing_label_rows' : 'csv_mapping_incomplete'
        })
        continue
      }

      const reportFile = path.join(outDir, `visual_${label}_suite_${answerPattern}_v1.json`)
      const result = await runBatchCommand({
        envId,
        samplesDir,
        label,
        csvPath,
        reportFile,
        answerPattern,
        appEnv,
        openidPrefix,
        keepUploadedImage
      })

      output.labelResults.push({
        label,
        runnable: true,
        reportFile,
        summary: result?.summary || {},
        reason: ''
      })
    }
  }

  output.summary = summarizeSuite(output.labelResults, coverage)

  const reportName = validateOnly
    ? 'visual_symptom_suite_validation_v1.json'
    : `visual_symptom_suite_${answerPattern}_v1.json`
  const reportPath = path.join(outDir, reportName)
  await fs.writeFile(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  console.log(JSON.stringify({ ...output, reportPath }, null, 2))
}

main().catch(error => {
  console.error(error && (error.stack || error.message || error))
  process.exit(1)
})
