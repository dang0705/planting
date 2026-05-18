#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.heic'])

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeText(value = '') {
  return String(value || '').trim().toLowerCase()
}

function normalizeInteger(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function sanitizeCaseKey(value = '') {
  return String(value || '')
    .trim()
    .replace(/\.[^.]+$/, '')
    .replace(/[^A-Za-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function safeJsonParse(value, fallback) {
  if (!value) {return fallback}
  try {
    return JSON.parse(value)
  } catch (error) {
    throw new Error(`无法解析 JSON: ${error.message}`)
  }
}

function parseCsvArg(value = '') {
  return String(value || '')
    .split(',')
    .map(item => String(item || '').trim())
    .filter(Boolean)
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

function isRetryableChildError(errorText = '') {
  const message = String(errorText || '').toLowerCase()
  return (
    message.includes('fetch failed') ||
    message.includes('enotfound') ||
    message.includes('econnreset') ||
    message.includes('aborted') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('socket hang up')
  )
}

function sleep(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, Number(ms || 0)))
}

function buildCleanChildEnv() {
  const env = { ...process.env }
  Object.keys(env).forEach(key => {
    if (String(key || '').toLowerCase().startsWith('npm_')) {
      delete env[key]
    }
  })
  delete env.NODE_OPTIONS
  return env
}

async function loadCsvPlantMap(csvPath = '') {
  const resolvedPath = String(csvPath || '').trim()
  if (!resolvedPath) {
    return {}
  }

  const content = await fs.readFile(path.resolve(resolvedPath), 'utf8')
  const lines = content
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {
    return {}
  }

  const [headerLine, ...dataLines] = lines
  const headers = parseCsvLine(headerLine).map(item => normalizeText(item))
  const labelIndex = headers.indexOf('label')
  const fileNameIndex = headers.indexOf('file_name')
  const plantCatalogIdIndex = headers.indexOf('plant_catalog_id')

  if (labelIndex === -1 || fileNameIndex === -1 || plantCatalogIdIndex === -1) {
    throw new Error(`CSV 缺少必要列: ${resolvedPath}`)
  }

  const mapping = {}
  for (const line of dataLines) {
    const cells = parseCsvLine(line)
    const label = normalizeText(cells[labelIndex] || '')
    const fileName = normalizeText(cells[fileNameIndex] || '')
    const plantCatalogId = String(cells[plantCatalogIdIndex] || '').trim()

    if (!label || !fileName || !plantCatalogId) {
      continue
    }

    mapping[`${label}::${fileName}`] = plantCatalogId
  }

  return mapping
}

async function collectCases(samplesDir, { label = '', limit = 0 } = {}) {
  const resolvedDir = path.resolve(String(samplesDir || '').trim())
  const entries = await fs.readdir(resolvedDir, { withFileTypes: true })
  const normalizedLabel = normalizeText(label)
  const cases = []
  const directories = entries.filter(entry => entry.isDirectory())

  if (!directories.length) {
    const inferredLabel = path.basename(resolvedDir)
    if (!normalizedLabel || normalizeText(inferredLabel) === normalizedLabel) {
      for (const file of entries) {
        if (!file.isFile()) {continue}
        const extension = normalizeText(path.extname(file.name))
        if (!DEFAULT_EXTENSIONS.has(extension)) {continue}
        cases.push({
          label: inferredLabel,
          absolutePath: path.join(resolvedDir, file.name),
          fileName: file.name
        })
      }
    }
    return limit > 0 ? cases.slice(0, limit) : cases
  }

  for (const entry of directories) {
    if (normalizedLabel && normalizeText(entry.name) !== normalizedLabel) {continue}

    const labelDir = path.join(resolvedDir, entry.name)
    const files = await fs.readdir(labelDir, { withFileTypes: true })
    for (const file of files) {
      if (!file.isFile()) {continue}
      const extension = normalizeText(path.extname(file.name))
      if (!DEFAULT_EXTENSIONS.has(extension)) {continue}

      cases.push({
        label: entry.name,
        absolutePath: path.join(labelDir, file.name),
        fileName: file.name
      })
    }
  }

  cases.sort((left, right) => left.absolutePath.localeCompare(right.absolutePath, 'zh-Hans-CN'))
  return limit > 0 ? cases.slice(0, limit) : cases
}

async function loadCaseGroups(args = {}) {
  const inlineGroups = String(args['case-groups-json'] || '').trim()
  const fileGroupsPath = String(args['case-groups-file'] || '').trim()

  if (!inlineGroups && !fileGroupsPath) {
    return []
  }

  const rawGroups = fileGroupsPath
    ? await fs.readFile(path.resolve(fileGroupsPath), 'utf8')
    : inlineGroups
  const parsed = safeJsonParse(rawGroups, [])
  assertCondition(Array.isArray(parsed), 'case groups 必须是 JSON 数组')

  return parsed.map((item, index) => {
    const expected = item?.expected && typeof item.expected === 'object' ? item.expected : {}
    const rawImagePaths = Array.isArray(item?.images)
      ? item.images
      : parseCsvArg(item?.imagePaths || item?.image_paths || item?.imagePath || item?.image_path || '')
    assertCondition(rawImagePaths.length > 0, `caseGroups[${index}] 缺少 images`)
    assertCondition(rawImagePaths.length <= 5, `caseGroups[${index}] 图片数量超过 5 张`)

    const absolutePaths = rawImagePaths.map(imagePath => path.resolve(String(imagePath || '').trim()))
    const label = String(item?.label || `group_${index + 1}`).trim() || `group_${index + 1}`
    const caseKey =
      sanitizeCaseKey(item?.caseKey || item?.case_key || `${label}_${path.basename(absolutePaths[0])}`) ||
      `group_${index + 1}`
    const inputSlotTypes = Array.isArray(item?.inputSlotTypes)
      ? item.inputSlotTypes.map(slot => String(slot || '').trim()).filter(Boolean)
      : parseCsvArg(item?.inputSlotTypes || item?.input_slot_types || '')

    return {
      label,
      caseKey,
      fileName: String(item?.fileName || item?.file_name || path.basename(absolutePaths[0])).trim(),
      absolutePath: absolutePaths[0],
      absolutePaths,
      imageCount: absolutePaths.length,
      inputSlotTypes,
      plantCatalogId: String(item?.plantCatalogId || item?.plant_catalog_id || '').trim(),
      expectOutcome: String(item?.expectOutcome || item?.expect_outcome || expected?.outcome || '').trim(),
      expectNonProblematicType: String(
        item?.expectNonProblematicType ||
          item?.expect_non_problematic_type ||
          expected?.nonProblematicType ||
          ''
      ).trim(),
      expectProblemKey: String(item?.expectProblemKey || item?.expect_problem_key || expected?.problemKey || '').trim(),
      expectRoutePrimaryAction: String(
        item?.expectRoutePrimaryAction ||
          item?.expect_route_primary_action ||
          expected?.routePrimaryAction ||
          ''
      ).trim(),
      expectIdentityResolutionStatus: String(
        item?.expectIdentityResolutionStatus ||
          item?.expect_identity_resolution_status ||
          expected?.identityResolutionStatus ||
          ''
      ).trim(),
      expectTaxonomyMatchStatus: String(
        item?.expectTaxonomyMatchStatus ||
          item?.expect_taxonomy_match_status ||
          expected?.taxonomyMatchStatus ||
          ''
      ).trim(),
      expectObservedEvidenceSymptomKeys: Array.isArray(item?.expectObservedEvidenceSymptomKeys)
        ? item.expectObservedEvidenceSymptomKeys.map(value => String(value || '').trim()).filter(Boolean)
        : Array.isArray(item?.expect_observed_evidence_symptom_keys)
          ? item.expect_observed_evidence_symptom_keys.map(value => String(value || '').trim()).filter(Boolean)
          : Array.isArray(expected?.observedEvidenceSymptomKeys)
            ? expected.observedEvidenceSymptomKeys.map(value => String(value || '').trim()).filter(Boolean)
            : parseCsvArg(
                item?.expectObservedEvidenceSymptomKeys || item?.expect_observed_evidence_symptom_keys || ''
              ),
      minObservedSymptoms: normalizeInteger(
        item?.minObservedSymptoms ?? item?.min_observed_symptoms ?? expected?.minObservedSymptoms,
        0
      ),
      minObservedEvidenceCount: normalizeInteger(
        item?.minObservedEvidenceCount ?? item?.min_observed_evidence_count ?? expected?.minObservedEvidenceCount,
        0
      ),
      expectFollowUpRequired:
        item?.expectFollowUpRequired ??
        item?.expect_follow_up_required ??
        expected?.followUpRequired ??
        '',
      expectFastConvergenceApplied:
        item?.expectFastConvergenceApplied ??
        item?.expect_fast_convergence_applied ??
        expected?.fastConvergenceApplied ??
        '',
      expectFastConvergencePolicy: String(
        item?.expectFastConvergencePolicy ||
          item?.expect_fast_convergence_policy ||
          expected?.fastConvergencePolicy ||
          ''
      )
    }
  })
}

function resolvePlantCatalogId(caseItem, { plantCatalogId = '', plantMap = {}, csvPlantMap = {} } = {}) {
  if (caseItem?.plantCatalogId) {
    return String(caseItem.plantCatalogId).trim()
  }

  const exactKey = `${normalizeText(caseItem.label)}::${normalizeText(caseItem.fileName)}`
  if (csvPlantMap[exactKey]) {
    return String(csvPlantMap[exactKey]).trim()
  }

  const haystack = normalizeText(`${caseItem.fileName} ${caseItem.absolutePath}`)
  const normalizedEntries = Object.entries(plantMap || {})
    .map(([key, value]) => [normalizeText(key), String(value || '').trim()])
    .filter(([key, value]) => key && value)

  for (const [keyword, value] of normalizedEntries) {
    if (haystack.includes(keyword)) {
      return value
    }
  }

  if (plantCatalogId) {
    return String(plantCatalogId).trim()
  }

  throw new Error(`未能为样本解析 plantCatalogId: ${caseItem.absolutePath}`)
}

function buildOpenId(caseItem, prefix = 'batch_visual') {
  const labelKey = sanitizeCaseKey(caseItem.label || 'unknown')
  const rawFileKey = sanitizeCaseKey(caseItem.caseKey || caseItem.fileName || crypto.randomUUID())
  const prefixKey = sanitizeCaseKey(prefix || 'batch_visual')
  const hashKey = crypto
    .createHash('sha1')
    .update(
      `${(Array.isArray(caseItem.absolutePaths) ? caseItem.absolutePaths : [caseItem.absolutePath]).join('::')}::${caseItem.fileName || ''}`
    )
    .digest('hex')
    .slice(0, 12)
  const trimmedFileKey = rawFileKey.slice(0, 16)
  return `anon_dev_${prefixKey}_${labelKey}_${trimmedFileKey}_${hashKey}`.slice(0, 64)
}

async function runVisualSmokeCase(envId, caseItem, args, plantCatalogId) {
  const scriptPath = path.join(__dirname, 'cloudbase-http-check.mjs')
  const openid = buildOpenId(caseItem, args['openid-prefix'] || 'visual_batch')
  const imagePaths = Array.isArray(caseItem.absolutePaths) && caseItem.absolutePaths.length
    ? caseItem.absolutePaths
    : [caseItem.absolutePath]
  const childArgs = [
    scriptPath,
    `--env=${envId}`,
    '--smoke=diagnose-visual',
    `--plant-catalog-id=${plantCatalogId}`,
    `--openid=${openid}`,
    `--app-env=${args['app-env'] || 'development'}`,
    '--anonymous-dev-identity=true',
    `--keep-uploaded-image=${args['keep-uploaded-image'] || 'false'}`
  ]

  if (imagePaths.length > 1) {
    childArgs.push(`--image-paths=${imagePaths.join(',')}`)
  } else {
    childArgs.push(`--image-path=${imagePaths[0]}`)
  }

  if (Array.isArray(caseItem.inputSlotTypes) && caseItem.inputSlotTypes.length) {
    childArgs.push(`--input-slot-types=${caseItem.inputSlotTypes.join(',')}`)
  }

  if (caseItem.expectOutcome) {
    childArgs.push(`--expect-outcome=${caseItem.expectOutcome}`)
  }
  if (caseItem.expectNonProblematicType) {
    childArgs.push(`--expect-non-problematic-type=${caseItem.expectNonProblematicType}`)
  }
  if (caseItem.expectProblemKey) {
    childArgs.push(`--expect-problem-key=${caseItem.expectProblemKey}`)
  }
  if (caseItem.expectRoutePrimaryAction) {
    childArgs.push(`--expect-route-primary-action=${caseItem.expectRoutePrimaryAction}`)
  }
  if (caseItem.expectIdentityResolutionStatus) {
    childArgs.push(`--expect-identity-resolution-status=${caseItem.expectIdentityResolutionStatus}`)
  }
  if (caseItem.expectTaxonomyMatchStatus) {
    childArgs.push(`--expect-taxonomy-match-status=${caseItem.expectTaxonomyMatchStatus}`)
  }
  if (
    Array.isArray(caseItem.expectObservedEvidenceSymptomKeys) &&
    caseItem.expectObservedEvidenceSymptomKeys.length
  ) {
    childArgs.push(
      `--expect-observed-evidence-symptom-keys=${caseItem.expectObservedEvidenceSymptomKeys.join(',')}`
    )
  }
  if (Number(caseItem.minObservedSymptoms || 0) > 0) {
    childArgs.push(`--min-observed-symptoms=${Number(caseItem.minObservedSymptoms || 0)}`)
  }
  if (Number(caseItem.minObservedEvidenceCount || 0) > 0) {
    childArgs.push(`--min-observed-evidence-count=${Number(caseItem.minObservedEvidenceCount || 0)}`)
  }
  if (String(caseItem.expectFollowUpRequired || '').trim()) {
    childArgs.push(`--expect-follow-up-required=${caseItem.expectFollowUpRequired}`)
  }
  if (String(caseItem.expectFastConvergenceApplied || '').trim()) {
    childArgs.push(`--expect-fast-convergence-applied=${caseItem.expectFastConvergenceApplied}`)
  }
  if (String(caseItem.expectFastConvergencePolicy || '').trim()) {
    childArgs.push(`--expect-fast-convergence-policy=${caseItem.expectFastConvergencePolicy}`)
  }

  const passthroughArgs = [
    'answer-pattern',
    'retry-delay-ms',
    'start-retries',
    'start-mode',
    'answer-retries',
    'upload-retries',
    'cleanup-retries',
    'max-followup-loops',
    'min-observed-symptoms',
    'image-max-age',
    'skip-auth',
    'force-anonymous-auth',
    'use-inline-image'
  ]

  passthroughArgs.forEach(key => {
    if (args[key] !== undefined && args[key] !== '') {
      childArgs.push(`--${key}=${args[key]}`)
    }
  })

  const maxAttempts = Math.max(1, Number(args['case-retries'] || 3))
  const retryDelayMs = Math.max(0, Number(args['case-retry-delay-ms'] || 1500))
  let lastErrorText = ''

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const { stdout } = await execFileAsync('node', childArgs, {
        cwd: path.resolve(__dirname, '..', '..'),
        env: buildCleanChildEnv(),
        maxBuffer: 1024 * 1024 * 20
      })
      const parsed = safeJsonParse(stdout, null)
      if (!parsed || typeof parsed !== 'object' || !parsed.smoke || typeof parsed.smoke !== 'object') {
        throw new Error(
          `child stdout 协议损坏，未返回 smoke JSON: ${String(stdout || '').slice(0, 1200)}`
        )
      }
      const smoke = parsed?.smoke || {}
      return {
        ok: true,
        label: caseItem.label,
        caseKey: caseItem.caseKey || '',
        fileName: caseItem.fileName,
        absolutePath: caseItem.absolutePath,
        absolutePaths: imagePaths,
        imageCount: imagePaths.length,
        inputSlotTypes: caseItem.inputSlotTypes || [],
        expected: {
          outcomeType: caseItem.expectOutcome || '',
          nonProblematicType: caseItem.expectNonProblematicType || '',
          problemKey: caseItem.expectProblemKey || '',
          routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
          identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
          taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || '',
          observedEvidenceSymptomKeys: caseItem.expectObservedEvidenceSymptomKeys || [],
          minObservedSymptoms: Number(caseItem.minObservedSymptoms || 0),
          minObservedEvidenceCount: Number(caseItem.minObservedEvidenceCount || 0),
          followUpRequired: String(caseItem.expectFollowUpRequired || '').trim(),
          fastConvergenceApplied: String(caseItem.expectFastConvergenceApplied || '').trim(),
          fastConvergencePolicy: String(caseItem.expectFastConvergencePolicy || '').trim()
        },
        plantCatalogId,
        openid,
        attempt,
        diagnosisSessionId: smoke?.start?.diagnosisSessionId || '',
        historyId: smoke?.history?.historyId || '',
        outcomeType: smoke?.answer?.outcomeType || '',
        nonProblematicType: smoke?.answer?.nonProblematicType || '',
        problemId: smoke?.answer?.problemId || '',
        problemKey: smoke?.answer?.problemKey || '',
        routePrimaryAction: smoke?.answer?.routePrimaryAction || smoke?.start?.routePrimaryAction || '',
        followUpRequired: Boolean(smoke?.answer?.followUpRequired),
        fastConvergenceApplied: Boolean(smoke?.answer?.fastConvergenceApplied),
        fastConvergencePolicy: smoke?.answer?.fastConvergencePolicy || '',
        identityResolutionStatus:
          smoke?.answer?.identityResolutionStatus ||
          smoke?.result?.identityResolutionStatus ||
          smoke?.start?.identityResolutionStatus ||
          '',
        taxonomyMatchStatus:
          smoke?.answer?.taxonomyMatchStatus ||
          smoke?.result?.taxonomyMatchStatus ||
          smoke?.start?.taxonomyMatchStatus ||
          '',
        displayName: smoke?.answer?.displayName || '',
        severity: smoke?.answer?.severity || '',
        startStage: smoke?.start?.stage || '',
        startQuestionCount: Number(smoke?.start?.questionCount || 0),
        startObservedSymptomsCount: Number(smoke?.start?.observedSymptomsCount || 0),
        resultObservedSymptomsCount: Number(smoke?.result?.observedSymptomsCount || 0),
        resultObservedSymptomKeys: Array.isArray(smoke?.result?.observedSymptomKeys)
          ? smoke.result.observedSymptomKeys
          : [],
        resultObservedEvidenceSetCount: Number(smoke?.result?.observedEvidenceSetCount || 0),
        resultObservedEvidenceSymptomKeys: Array.isArray(smoke?.result?.observedEvidenceSymptomKeys)
          ? smoke.result.observedEvidenceSymptomKeys
          : [],
        cleanupDeleted: Boolean(smoke?.cleanup?.deleted),
        raw: parsed
      }
    } catch (error) {
      lastErrorText = String(error?.stderr || error?.stdout || error?.message || error || '').trim()
      if (!isRetryableChildError(lastErrorText) || attempt >= maxAttempts) {
        return {
          ok: false,
          label: caseItem.label,
          caseKey: caseItem.caseKey || '',
          fileName: caseItem.fileName,
          absolutePath: caseItem.absolutePath,
          absolutePaths: imagePaths,
          imageCount: imagePaths.length,
          inputSlotTypes: caseItem.inputSlotTypes || [],
          expected: {
            outcomeType: caseItem.expectOutcome || '',
            nonProblematicType: caseItem.expectNonProblematicType || '',
            problemKey: caseItem.expectProblemKey || '',
            routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
            identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
            taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || '',
            observedEvidenceSymptomKeys: caseItem.expectObservedEvidenceSymptomKeys || [],
            minObservedSymptoms: Number(caseItem.minObservedSymptoms || 0),
            minObservedEvidenceCount: Number(caseItem.minObservedEvidenceCount || 0),
            followUpRequired: String(caseItem.expectFollowUpRequired || '').trim(),
            fastConvergenceApplied: String(caseItem.expectFastConvergenceApplied || '').trim(),
            fastConvergencePolicy: String(caseItem.expectFastConvergencePolicy || '').trim()
          },
          plantCatalogId,
          openid,
          attempt,
          identityResolutionStatus: '',
          taxonomyMatchStatus: '',
          error: lastErrorText
        }
      }

      await sleep(retryDelayMs)
    }
  }

  return {
    ok: false,
    label: caseItem.label,
    caseKey: caseItem.caseKey || '',
    fileName: caseItem.fileName,
    absolutePath: caseItem.absolutePath,
    absolutePaths: imagePaths,
    imageCount: imagePaths.length,
    inputSlotTypes: caseItem.inputSlotTypes || [],
    expected: {
      outcomeType: caseItem.expectOutcome || '',
      nonProblematicType: caseItem.expectNonProblematicType || '',
      problemKey: caseItem.expectProblemKey || '',
      routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
      identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
      taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || '',
      observedEvidenceSymptomKeys: caseItem.expectObservedEvidenceSymptomKeys || [],
      minObservedSymptoms: Number(caseItem.minObservedSymptoms || 0),
      minObservedEvidenceCount: Number(caseItem.minObservedEvidenceCount || 0),
      followUpRequired: String(caseItem.expectFollowUpRequired || '').trim(),
      fastConvergenceApplied: String(caseItem.expectFastConvergenceApplied || '').trim(),
      fastConvergencePolicy: String(caseItem.expectFastConvergencePolicy || '').trim()
    },
    plantCatalogId,
    openid,
    attempt: maxAttempts,
    identityResolutionStatus: '',
    taxonomyMatchStatus: '',
    error: lastErrorText
  }
}

function buildSummary(results = []) {
  const summary = {
    total: results.length,
    success: 0,
    failed: 0,
    skipped: 0,
    byLabel: {}
  }

  for (const item of results) {
    const label = item.label || 'unknown'
    if (!summary.byLabel[label]) {
      summary.byLabel[label] = {
        total: 0,
        success: 0,
        failed: 0,
        skipped: 0
      }
    }

    summary.byLabel[label].total += 1
    if (item.skipped) {
      summary.skipped += 1
      summary.byLabel[label].skipped += 1
    } else if (item.ok) {
      summary.success += 1
      summary.byLabel[label].success += 1
    } else {
      summary.failed += 1
      summary.byLabel[label].failed += 1
    }
  }

  return summary
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const envId = String(args.env || process.env.CLOUDBASE_ENV_ID || '').trim()
  const samplesDir = String(args['samples-dir'] || '').trim()
  const explicitCaseGroups = await loadCaseGroups(args)

  assertCondition(envId, '缺少 --env=cloudbase-env-id')
  assertCondition(samplesDir || explicitCaseGroups.length > 0, '缺少 --samples-dir 或 --case-groups-json/--case-groups-file')

  const plantMap = safeJsonParse(args['plant-map-json'], {})
  const csvPlantMap = await loadCsvPlantMap(args['plant-map-csv'] || '')
  const cases = explicitCaseGroups.length
    ? explicitCaseGroups
    : await collectCases(samplesDir, {
        label: args.label || '',
        limit: normalizeInteger(args.limit, 0)
      })
  const skipUnmapped = normalizeText(args['skip-unmapped'] || '') === 'true'

  assertCondition(cases.length > 0, explicitCaseGroups.length ? '未找到可执行 case groups' : `未找到可执行样本: ${samplesDir}`)

  const results = []
  for (const caseItem of cases) {
    let plantCatalogId = ''
    try {
      plantCatalogId = resolvePlantCatalogId(caseItem, {
        plantCatalogId: args['plant-catalog-id'] || '',
        plantMap,
        csvPlantMap
      })
    } catch (error) {
      if (!skipUnmapped) {
        throw error
      }

      results.push({
        ok: false,
        skipped: true,
        label: caseItem.label,
        caseKey: caseItem.caseKey || '',
        fileName: caseItem.fileName,
        absolutePath: caseItem.absolutePath,
        absolutePaths: caseItem.absolutePaths || [caseItem.absolutePath],
        imageCount: Number(caseItem.imageCount || 1),
        inputSlotTypes: caseItem.inputSlotTypes || [],
        expected: {
          outcomeType: caseItem.expectOutcome || '',
          nonProblematicType: caseItem.expectNonProblematicType || '',
          problemKey: caseItem.expectProblemKey || '',
          routePrimaryAction: caseItem.expectRoutePrimaryAction || '',
          identityResolutionStatus: caseItem.expectIdentityResolutionStatus || '',
          taxonomyMatchStatus: caseItem.expectTaxonomyMatchStatus || '',
          observedEvidenceSymptomKeys: caseItem.expectObservedEvidenceSymptomKeys || [],
          minObservedSymptoms: Number(caseItem.minObservedSymptoms || 0),
          minObservedEvidenceCount: Number(caseItem.minObservedEvidenceCount || 0)
        },
        plantCatalogId: '',
        openid: '',
        error: String(error?.message || error || '').trim()
      })
      continue
    }
    const result = await runVisualSmokeCase(envId, caseItem, args, plantCatalogId)
    results.push(result)
  }

  const output = {
    generatedAt: new Date().toISOString(),
    envId,
    samplesDir: samplesDir ? path.resolve(samplesDir) : '',
    caseGroupsCount: explicitCaseGroups.length,
    label: args.label || '',
    limit: normalizeInteger(args.limit, 0),
    summary: buildSummary(results),
    results: results.map(item => ({
      ok: item.ok,
      skipped: Boolean(item.skipped),
      label: item.label,
      caseKey: item.caseKey || '',
      fileName: item.fileName,
      absolutePath: item.absolutePath,
      absolutePaths: item.absolutePaths || [item.absolutePath],
      imageCount: Number(item.imageCount || 1),
      inputSlotTypes: item.inputSlotTypes || [],
      expected: item.expected || {
        outcomeType: '',
        nonProblematicType: '',
        problemKey: '',
        routePrimaryAction: '',
        identityResolutionStatus: '',
        taxonomyMatchStatus: '',
        observedEvidenceSymptomKeys: [],
        minObservedSymptoms: 0,
        minObservedEvidenceCount: 0
      },
      plantCatalogId: item.plantCatalogId,
      openid: item.openid,
      diagnosisSessionId: item.diagnosisSessionId || '',
      historyId: item.historyId || '',
      outcomeType: item.outcomeType || '',
      nonProblematicType: item.nonProblematicType || '',
      problemId: item.problemId || '',
      problemKey: item.problemKey || '',
      routePrimaryAction: item.routePrimaryAction || '',
      identityResolutionStatus: item.identityResolutionStatus || '',
      taxonomyMatchStatus: item.taxonomyMatchStatus || '',
      displayName: item.displayName || '',
      severity: item.severity || '',
      startStage: item.startStage || '',
      startQuestionCount: item.startQuestionCount || 0,
      startObservedSymptomsCount: item.startObservedSymptomsCount || 0,
      resultObservedSymptomsCount: item.resultObservedSymptomsCount || 0,
      resultObservedSymptomKeys: item.resultObservedSymptomKeys || [],
      resultObservedEvidenceSetCount: item.resultObservedEvidenceSetCount || 0,
      resultObservedEvidenceSymptomKeys: item.resultObservedEvidenceSymptomKeys || [],
      cleanupDeleted: Boolean(item.cleanupDeleted),
      error: item.error || ''
    }))
  }

  if (args['report-file']) {
    const reportFile = path.resolve(String(args['report-file']).trim())
    await fs.mkdir(path.dirname(reportFile), { recursive: true })
    await fs.writeFile(reportFile, `${JSON.stringify(output, null, 2)}\n`, 'utf8')
  }

  await writeJsonAndExit(output, output.summary.failed > 0 ? 1 : 0)
}

function writeJsonAndExit(payload, exitCode = 0) {
  return new Promise(resolve => {
    const text = `${JSON.stringify(payload, null, 2)}\n`
    process.stdout.write(text, () => {
      process.exit(exitCode)
      resolve()
    })
  })
}

main().catch(error => {
  console.error(error && (error.stack || error.message || error))
  process.exit(1)
})
