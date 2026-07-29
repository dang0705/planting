#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

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

function buildImageMarkdown(reportFile, repoRoot, label, fileName) {
  const imagePath = path.resolve(repoRoot, 'plant-sample', 'symptoms', label, fileName)
  const relativePath = path.relative(path.dirname(reportFile), imagePath).split(path.sep).join('/')
  return `![${fileName}](${relativePath})`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const repoRoot = path.resolve(args.root || '.')
  const csvPath = path.resolve(args.csv || 'docs/mvp-simplify/codex/症状样本物种映射模板_v1.csv')
  const outPath = path.resolve(
    args.out || 'docs/mvp-simplify/codex/reports/symptom_mapping_review_v1.md'
  )

  const content = await fs.readFile(csvPath, 'utf8')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  assertCondition(lines.length > 1, `CSV 内容为空: ${csvPath}`)

  const headers = parseCsvLine(lines[0]).map(header => normalizeText(header))
  const labelIndex = headers.indexOf('label')
  const fileNameIndex = headers.indexOf('file_name')
  const plantCatalogIdIndex = headers.indexOf('plant_catalog_id')
  const plantNameIndex = headers.indexOf('plant_name')
  const notesIndex = headers.indexOf('notes')

  assertCondition(labelIndex !== -1, 'CSV 缺少 label 列')
  assertCondition(fileNameIndex !== -1, 'CSV 缺少 file_name 列')

  const rows = lines.slice(1).map(line => {
    const cells = parseCsvLine(line)
    return {
      label: normalizeText(cells[labelIndex] || ''),
      fileName: normalizeText(cells[fileNameIndex] || ''),
      plantCatalogId: normalizeText(cells[plantCatalogIdIndex] || ''),
      plantName: normalizeText(cells[plantNameIndex] || ''),
      notes: normalizeText(cells[notesIndex] || '')
    }
  }).filter(item => item.label && item.fileName)

  const groups = rows.reduce((result, row) => {
    if (!result[row.label]) {
      result[row.label] = []
    }
    result[row.label].push(row)
    return result
  }, {})

  const sortedLabels = Object.keys(groups).sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
  const output = []
  output.push('# 症状样本物种映射人工复核看板 v1')
  output.push('')
  output.push(`来源 CSV: \`${path.relative(repoRoot, csvPath).split(path.sep).join('/')}\``)
  output.push('')
  output.push('说明：')
  output.push('')
  output.push('1. 逐条看图')
  output.push('2. 回填 `plant_catalog_id` / `plant_name` / `notes` 到源 CSV')
  output.push('3. 回填后可直接用批量 smoke 运行器消费该 CSV')
  output.push('')

  for (const label of sortedLabels) {
    output.push(`## ${label}`)
    output.push('')

    for (const row of groups[label]) {
      output.push(`### ${row.fileName}`)
      output.push('')
      output.push(buildImageMarkdown(outPath, repoRoot, row.label, row.fileName))
      output.push('')
      output.push(`- label: \`${row.label}\``)
      output.push(`- file_name: \`${row.fileName}\``)
      output.push(`- plant_catalog_id: \`${row.plantCatalogId || '待补充'}\``)
      output.push(`- plant_name: \`${row.plantName || '待补充'}\``)
      output.push(`- notes: \`${row.notes || '待补充'}\``)
      output.push('')
    }
  }

  await fs.mkdir(path.dirname(outPath), { recursive: true })
  await fs.writeFile(outPath, `${output.join('\n')}\n`, 'utf8')
  process.stdout.write(`${outPath}\n`)
}

main().catch(error => {
  console.error(error && (error.stack || error.message || error))
  process.exit(1)
})
