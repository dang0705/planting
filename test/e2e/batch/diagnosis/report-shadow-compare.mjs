#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!String(arg || '').startsWith('--')) {return result}
    const [rawKey, ...rest] = String(arg || '').slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function safeJsonParse(value, fallback = null) {
  if (value === null || value === undefined || value === '') {return fallback}
  if (typeof value === 'object') {return value}
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`无法解析 JSON: ${error.message}`)
  }
}

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeStringList(values = []) {
  return (Array.isArray(values) ? values : [])
    .map(item => normalizeText(item))
    .filter(Boolean)
}

async function collectJsonFiles(inputPath) {
  const resolvedPath = path.resolve(String(inputPath || '').trim())
  const stats = await fs.stat(resolvedPath)

  if (stats.isFile()) {
    return [resolvedPath]
  }

  if (!stats.isDirectory()) {
    throw new Error(`输入路径不是文件或目录: ${resolvedPath}`)
  }

  const files = []

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true })
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name)
      if (entry.isDirectory()) {
        await walk(absolutePath)
        continue
      }

      if (entry.isFile() && absolutePath.toLowerCase().endsWith('.json')) {
        files.push(absolutePath)
      }
    }
  }

  await walk(resolvedPath)
  return files.sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
}

function unwrapCandidateContainer(node) {
  if (Array.isArray(node)) {
    return node
  }

  if (!node || typeof node !== 'object') {
    return []
  }

  if (Array.isArray(node.items)) {
    return node.items
  }

  if (Array.isArray(node.data)) {
    return node.data
  }

  if (node.data && typeof node.data === 'object') {
    return unwrapCandidateContainer(node.data)
  }

  return [node]
}

function normalizeShadowCompareSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    enabled: Number(summary?.enabled ?? 0) ? 1 : 0,
    compareStatus: normalizeText(summary?.compareStatus || summary?.compare_status || 'disabled') || 'disabled',
    comparedImageCount: Number(summary?.comparedImageCount ?? summary?.compared_image_count ?? 0),
    succeededImageCount: Number(summary?.succeededImageCount ?? summary?.succeeded_image_count ?? 0),
    skippedImageCount: Number(summary?.skippedImageCount ?? summary?.skipped_image_count ?? 0),
    failedImageCount: Number(summary?.failedImageCount ?? summary?.failed_image_count ?? 0),
    providers: normalizeStringList(summary?.providers),
    modelNames: normalizeStringList(summary?.modelNames || summary?.model_names)
  }
}

function normalizeVisualAggregateSummary(summary = null) {
  if (!summary || typeof summary !== 'object') {
    return null
  }

  return {
    visualCallBatchId:
      normalizeText(summary?.visualCallBatchId || summary?.visual_call_batch_id || '') || null,
    effectiveImageCount: Number(summary?.effectiveImageCount ?? summary?.effective_image_count ?? 0),
    aggregateQualityGrade:
      normalizeText(summary?.aggregateQualityGrade || summary?.aggregate_quality_grade || ''),
    aggregateAnalyzability:
      normalizeText(summary?.aggregateAnalyzability || summary?.aggregate_analyzability || ''),
    routePrimaryAction:
      normalizeText(summary?.routePrimaryAction || summary?.route_primary_action || ''),
    shadowCompareSummary: normalizeShadowCompareSummary(
      summary?.shadowCompareSummary || summary?.shadow_compare_summary
    )
  }
}

function normalizeVisualBatchTrace(trace = null) {
  if (!trace || typeof trace !== 'object') {
    return null
  }

  return {
    currentVisualCallBatchId:
      normalizeText(trace?.currentVisualCallBatchId || trace?.current_visual_call_batch_id || '') || null,
    originVisualCallBatchId:
      normalizeText(trace?.originVisualCallBatchId || trace?.origin_visual_call_batch_id || '') || null,
    supersedeApplied: Number(trace?.supersedeApplied ?? trace?.supersede_applied ?? 0) ? 1 : 0
  }
}

function extractCaseRecord(candidate = {}, sourceFile = '', index = 0) {
  const visualAggregateSummary = normalizeVisualAggregateSummary(
    candidate?.visualAggregateSummary ||
      candidate?.visual_aggregate_summary ||
      candidate?.visualAggregateResult ||
      candidate?.visual_call_aggregate_result ||
      null
  )
  const shadowCompareSummary =
    normalizeShadowCompareSummary(candidate?.shadowCompareSummary || candidate?.shadow_compare_summary) ||
    visualAggregateSummary?.shadowCompareSummary ||
    null
  const visualBatchTrace = normalizeVisualBatchTrace(
    candidate?.visualBatchTrace || candidate?.visual_batch_trace || null
  )

  return {
    caseId:
      normalizeText(
        candidate?.resultId ||
          candidate?.diagnosisSessionId ||
          candidate?.recordId ||
          candidate?.historyId ||
          ''
      ) || `${path.basename(sourceFile)}#${index + 1}`,
    sourceFile,
    outcomeType: normalizeText(candidate?.outcomeType || ''),
    routePrimaryAction:
      normalizeText(candidate?.routePrimaryAction || visualAggregateSummary?.routePrimaryAction || ''),
    latestVisualCallBatchId:
      normalizeText(candidate?.latestVisualCallBatchId || visualAggregateSummary?.visualCallBatchId || '') || null,
    visualBatchTrace,
    visualAggregateSummary,
    shadowCompareSummary,
    shadowEnabled: Number(shadowCompareSummary?.enabled ?? 0) ? 1 : 0,
    compareStatus: shadowCompareSummary?.compareStatus || 'disabled'
  }
}

function bumpCount(counter, key, increment = 1) {
  if (!key) {return}
  counter[key] = Number(counter[key] || 0) + increment
}

function buildAggregateReport(records = []) {
  const byStatus = {}
  const providerCounts = {}
  const modelCounts = {}

  const totals = {
    caseCount: records.length,
    shadowEnabledCaseCount: 0,
    disabledCaseCount: 0,
    partialOrSucceededCaseCount: 0,
    skippedCaseCount: 0,
    failedCaseCount: 0,
    comparedImageCount: 0,
    succeededImageCount: 0,
    skippedImageCount: 0,
    failedImageCount: 0
  }

  for (const record of records) {
    const summary = record.shadowCompareSummary
    const status = record.compareStatus || 'disabled'

    bumpCount(byStatus, status)

    if (!summary || !record.shadowEnabled) {
      totals.disabledCaseCount += 1
      continue
    }

    totals.shadowEnabledCaseCount += 1
    totals.comparedImageCount += Number(summary.comparedImageCount || 0)
    totals.succeededImageCount += Number(summary.succeededImageCount || 0)
    totals.skippedImageCount += Number(summary.skippedImageCount || 0)
    totals.failedImageCount += Number(summary.failedImageCount || 0)

    if (status === 'partial_or_succeeded') {
      totals.partialOrSucceededCaseCount += 1
    } else if (status === 'skipped') {
      totals.skippedCaseCount += 1
    } else if (status === 'failed') {
      totals.failedCaseCount += 1
    }

    normalizeStringList(summary.providers).forEach(provider => bumpCount(providerCounts, provider))
    normalizeStringList(summary.modelNames).forEach(modelName => bumpCount(modelCounts, modelName))
  }

  return {
    generatedAt: new Date().toISOString(),
    totals,
    byStatus,
    providerCounts,
    modelCounts,
    cases: records
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputPath = normalizeText(args.input || '')
  const inlineJson = normalizeText(args.json || '')

  if (!inputPath && !inlineJson) {
    throw new Error('请提供 --input=<json文件或目录> 或 --json=<json字符串>')
  }

  const records = []

  if (inlineJson) {
    const payload = safeJsonParse(inlineJson, null)
    unwrapCandidateContainer(payload).forEach((candidate, index) => {
      records.push(extractCaseRecord(candidate, '<inline-json>', index))
    })
  }

  if (inputPath) {
    const files = await collectJsonFiles(inputPath)
    for (const filePath of files) {
      const content = await fs.readFile(filePath, 'utf8')
      const payload = safeJsonParse(content, null)
      unwrapCandidateContainer(payload).forEach((candidate, index) => {
        records.push(extractCaseRecord(candidate, filePath, index))
      })
    }
  }

  if (!records.length) {
    throw new Error('没有解析到可用的诊断结果记录')
  }

  const report = buildAggregateReport(records)
  const output = JSON.stringify(report, null, 2)

  if (args.output) {
    const outputPath = path.resolve(String(args.output).trim())
    await fs.writeFile(outputPath, `${output}\n`, 'utf8')
  }

  process.stdout.write(`${output}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.message || error}\n`)
  process.exitCode = 1
})
