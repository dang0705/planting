#!/usr/bin/env node

import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

import { aiVisualPoolCoverageConfig } from './lib/ai-visual-pool-coverage-config.mjs'

const require = createRequire(import.meta.url)
const cloudbase = require('../cloudfunctions/layer/node_modules/@cloudbase/node-sdk')
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const repoRoot = path.resolve(__dirname, '..')
const defaultEnv = aiVisualPoolCoverageConfig.verifiedEnvId || 'cloud1-2grufevs395a9d5e'
const defaultSchema = 'cloud1_dev'

const defaultRuntimeCsvCandidates = [
  path.join(repoRoot, 'docs', 'new-rules', 'symptom_classes_completed_v3_final_unblocked.csv'),
  path.join(repoRoot, 'docs', 'symptom_classes_completed_v3_final_unblocked.csv'),
  path.join(repoRoot, 'docs', 'new-rules', 'symptom_class_mapping_completed_v3_final_unblocked.csv'),
  path.join(repoRoot, 'docs', 'symptom_class_mapping_completed_v3_final_unblocked.csv'),
  path.join(repoRoot, 'docs', 'new-rules', 'class_question_group_strategy_completed_v3_final_unblocked.csv'),
  path.join(repoRoot, 'docs', 'class_question_group_strategy_completed_v3_final_unblocked.csv')
]

const runtimeTables = {
  symptom_classes: 'symptom_classes',
  symptom_class_mapping: 'symptom_class_mapping',
  class_question_group_strategy: 'class_question_group_strategy'
}

function pickExistingFile(...candidates) {
  const candidatesFromEnv = candidates
    .flatMap(item => (Array.isArray(item) ? item : [item]))
    .map(item => String(item || '').trim())
    .filter(Boolean)

  for (const filePath of candidatesFromEnv) {
    try {
      if (filePath && fsSync.statSync(filePath).isFile()) {
        return filePath
      }
    } catch {
      // continue
    }
  }

  return null
}

function assertSqlFileReadable(sqlPath) {
  const resolvedSqlPath = path.resolve(repoRoot, String(sqlPath || '').trim())
  try {
    return fsSync.statSync(resolvedSqlPath).isFile() ? resolvedSqlPath : ''
  } catch {
    return ''
  }
}

async function ensureRuntimeTablesExist(
  models,
  schema,
  ddlMode = false,
  ddlSqlPath = '',
  ddlExecutable = false
) {
  const tables = Object.values(runtimeTables)

  for (const table of tables) {
    try {
      await models.$runSQL(`SELECT 1 FROM \`${schema}\`.\`${table}\` LIMIT 0`)
      continue
    } catch (error) {
      const message = String(error?.message || '').toLowerCase()
      const code = String(error?.code || error?.data?.code || '').toLowerCase()
      const hasHint =
        message.includes("doesn't exist") ||
        message.includes('er_no_such_table') ||
        message.includes('unknown table') ||
        message.includes('1146') ||
        code.includes('er_no_such_table') ||
        code.includes('1146')

      if (!hasHint) {
        throw error
      }

      if (!ddlMode) {
        const hint = ddlSqlPath
          ? `请先运行 `
            + `${ddlSqlPath} 的建表 SQL（确保运行脚本已成功建立 runtime 表）。`
          : '请先确认目标库已存在 3 张症状模式运行时表。'

        throw new Error(`表不存在: ${table}. ${hint}`)
      }

      const signatureHint = error?.message?.includes('SIGN_PARAM_INVALID')
        ? '当前签名仍拒绝建表执行：请确认凭据是否可执行 SQL 建表（或改用控制台 SQL 页手工执行后重试）。'
        : ddlExecutable
          ? '建表 SQL 执行失败，请检查签名权限与建表脚本。'
          : '当前环境不支持通过 SDK 自动建表（$runSQLRaw 不可用或不支持 DDL），请先到控制台执行建表 SQL。'

      throw new Error(`表不存在且 ddl=true 下建表失败: ${table}. ${signatureHint}`)
    }
  }
}

function resolveRuntimeCsvPath(argValue, primaryPath, fallbackPath) {
  const userPath = String(argValue || '').trim()

  if (userPath) {
    const resolvedUserPath = path.isAbsolute(userPath)
      ? userPath
      : path.resolve(process.cwd(), userPath)

    if (!pickExistingFile(resolvedUserPath)) {
      throw new Error(`未找到运行时同步文件: ${resolvedUserPath}`)
    }
    return resolvedUserPath
  }

  const resolved = pickExistingFile(primaryPath, fallbackPath)
  if (!resolved) {
    throw new Error(`未找到运行时同步文件，已尝试路径: ${primaryPath} ${fallbackPath}`)
  }

  return resolved
}

function parseArgs(argv = []) {
  return argv.reduce((acc, arg) => {
    if (!arg.startsWith('--')) {return acc}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    acc[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return acc
  }, {})
}

function normalizeBoolean(value = '') {
  const normalized = String(value || '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {return 1}
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {return 0}
  return 0
}

function normalizeNumber(value, fallback = 0) {
  const number = Number(value)
  if (!Number.isFinite(number)) {return fallback}
  return number
}

function normalizeDate() {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

function hasDdlCapability(models) {
  return typeof models.$runSQLRaw === 'function'
}

async function canCreateTablesViaDDL(models) {
  if (!hasDdlCapability(models)) {
    return false
  }

  const probeTable = `__cb_symptom_class_runtime_probe_${Date.now()}`
  const createProbe = `CREATE TABLE \`${probeTable}\` (id INT NOT NULL) ENGINE=InnoDB`
  const dropProbe = `DROP TABLE IF EXISTS \`${probeTable}\``

  try {
    await models.$runSQLRaw(createProbe, {})
    await models.$runSQLRaw(dropProbe, {})
    return true
  } catch {
    try {
      await models.$runSQLRaw(dropProbe, {})
    } catch {
      // best effort cleanup if table was created
    }
    return false
  }
}

function sanitizeIdentifier(value = '') {
  return String(value || '').trim().replace(/`/g, '')
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
  return cells.map(cell => String(cell || '').trim())
}

function parseCsv(content = '') {
  const lines = content
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  if (!lines.length) {return []}

  const headers = parseCsvLine(lines[0]).map(item => String(item || '').trim())
  const rows = []

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line) {continue}
    const cells = parseCsvLine(line)
    if (!cells.length) {continue}

    const row = {}
    headers.forEach((header, headerIndex) => {
      row[header] = (cells[headerIndex] ?? '').trim()
    })
    rows.push(row)
  }

  return rows
}

function sqlString(value = '') {
  if (value === null || value === undefined) {return 'NULL'}
  return `'${String(value)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .split('\0')
    .join('')}'`
}

function sqlNumber(value = '', fallback = 0) {
  if (value === null || value === undefined || value === '') {return String(fallback)}
  return String(normalizeNumber(value, fallback))
}

function sqlBoolean(value = '') {
  return String(normalizeBoolean(value))
}

function buildInsertSql(target, rows, columns, keyColumns = []) {
  const filteredRows = rows
    .map(row => columns.map(column => row[column]))
    .filter(values => values.every(value => value !== undefined))

  if (!filteredRows.length) {return ''}

  const insertColumns = columns.map(column => `\`${column}\``).join(', ')
  const valueRows = filteredRows.map(values => `(${values.join(', ')})`).join(',\n')
  const updateColumns = columns
    .filter(column => !keyColumns.includes(column))
    .map(column => `\`${column}\` = VALUES(\`${column}\`)`)
    .join(', ')

  return [
    `INSERT INTO \`${target.schema}\`.\`${target.table}\` (${insertColumns})`,
    `VALUES ${valueRows}`,
    `ON DUPLICATE KEY UPDATE ${updateColumns};`
  ].join('\n')
}

async function runSQL(models, sql, options = {}) {
  if (!String(sql || '').trim()) {return []}
  const { allowDdl = false } = options
  const segments = String(sql)
    .split(';')
    .map(item => String(item || '').trim())
    .filter(Boolean)
  const results = []

  for (const segment of segments) {
    const current = `${segment};`
    const shortPreview = current.replace(/\s+/g, ' ').trim().slice(0, 180)
    const lower = current.toLowerCase()
    const isDdl =
      lower.startsWith('create ')
      || lower.startsWith('drop ')
      || lower.startsWith('truncate ')
      || lower.startsWith('alter ')
      || lower.startsWith('rename ')
    try {
      const command = isDdl && allowDdl && typeof models.$runSQLRaw === 'function'
        ? models.$runSQLRaw(current, {})
        : models.$runSQL(current, {})

      results.push(await command)
    } catch (error) {
      if (isDdl && !allowDdl) {
        throw new Error(
          `当前任务禁止执行 DDL：${shortPreview}。如需自动建表，请开启 ddl=true 且确认接口可执行 DDL。`
        )
      }
      if (isDdl && typeof models.$runSQLRaw !== 'function') {
        throw new Error(
          `当前 SDK 不支持 DDL 的执行通道：${shortPreview}。请确认 CloudBase node-sdk 版本或改用控制台 SQL 执行器。`
        )
      }
      throw error
    }
  }

  return results
}

function normalizeClassRows(rows = []) {
  return rows
    .map(row => ({
      class_key: sanitizeIdentifier(row.class_key || row.classKey || ''),
      class_name_cn: row.class_name_cn || row.classNameCn || '',
      description: row.description || '',
      question_mode: row.question_mode || row.questionMode || '',
      class_level: row.class_level || row.classLevel || 'mode',
      parent_class_key: row.parent_class_key || row.parentClassKey || '',
      followup_enabled_v1: sqlBoolean(row.followup_enabled_v1 || row.followupEnabledV1),
      data_status: row.data_status || row.dataStatus || 'unknown',
      data_source: row.data_source || row.dataSource || '',
      audit_note: row.audit_note || row.auditNote || '',
      followup_mode_v1: row.followup_mode_v1 || row.followupModeV1 || 'disabled',
      runtime_gate_rule: row.runtime_gate_rule || row.runtimeGateRule || '',
      runtime_notes: row.runtime_notes || row.runtimeNotes || ''
    }))
    .filter(item => item.class_key)
}

function normalizeMappingRows(rows = []) {
  return rows
    .map(row => ({
      symptom_key: sanitizeIdentifier(row.symptom_key || row.symptomKey || ''),
      class_key: sanitizeIdentifier(row.class_key || row.classKey || ''),
      symptom_cn: row.symptom_cn || row.symptomCn || '',
      class_name_cn: row.class_name_cn || row.classNameCn || '',
      mapping_strength: sqlNumber(row.mapping_strength || row.mappingStrength, 0),
      is_primary: sqlBoolean(row.is_primary || row.isPrimary),
      mapping_type: row.mapping_type || row.mappingType || '',
      visual_scoring_allowed: sqlBoolean(row.visual_scoring_allowed || row.visualScoringAllowed),
      question_activation_allowed: sqlBoolean(row.question_activation_allowed || row.questionActivationAllowed),
      explanation_only_allowed: sqlBoolean(row.explanation_only_allowed || row.explanationOnlyAllowed),
      followup_enabled_v1: sqlBoolean(row.followup_enabled_v1 || row.followupEnabledV1),
      data_status: row.data_status || row.dataStatus || 'unknown',
      data_source: row.data_source || row.dataSource || '',
      audit_note: row.audit_note || row.auditNote || '',
      followup_mode_v1: row.followup_mode_v1 || row.followupModeV1 || 'disabled',
      explanation_only_semantic: row.explanation_only_semantic || row.explanationOnlySemantic || '',
      effective_question_activation_v1: sqlBoolean(row.effective_question_activation_v1 || row.effectiveQuestionActivationV1),
      runtime_policy: row.runtime_policy || row.runtimePolicy || '',
      partial_weight_factor_v1: sqlNumber(row.partial_weight_factor_v1 || row.partialWeightFactorV1, 1),
      visual_scoring_effective_v1: sqlBoolean(row.visual_scoring_effective_v1 || row.visualScoringEffectiveV1),
      primary_class_lock_allowed_v1: sqlBoolean(row.primary_class_lock_allowed_v1 || row.primaryClassLockAllowedV1)
    }))
    .filter(item => item.symptom_key && item.class_key)
}

function normalizeStrategyRows(rows = []) {
  return rows
    .map(row => ({
      class_key: sanitizeIdentifier(row.class_key || row.classKey || ''),
      class_name_cn: row.class_name_cn || row.classNameCn || '',
      group_key: sanitizeIdentifier(row.group_key || row.groupKey || ''),
      group_role: row.group_role || row.groupRole || '',
      base_priority: sqlNumber(row.base_priority || row.basePriority, 0),
      allow_when_ai_locked: sqlBoolean(row.allow_when_ai_locked || row.allowWhenAiLocked),
      max_questions_per_round: sqlNumber(row.max_questions_per_round || row.maxQuestionsPerRound, 1),
      activation_condition: row.activation_condition || row.activationCondition || '',
      class_gate_type: row.class_gate_type || row.classGateType || '',
      class_switch_allowed: sqlBoolean(row.class_switch_allowed || row.classSwitchAllowed),
      unknown_switch_policy: row.unknown_switch_policy || row.unknownSwitchPolicy || '',
      ai_locked_confirm_penalty: sqlNumber(row.ai_locked_confirm_penalty || row.aiLockedConfirmPenalty, 0),
      pseudo_symptom_allowed: sqlBoolean(row.pseudo_symptom_allowed || row.pseudoSymptomAllowed),
      data_status: row.data_status || row.dataStatus || 'unknown',
      data_source: row.data_source || row.dataSource || '',
      audit_note: row.audit_note || row.auditNote || '',
      followup_mode_v1: row.followup_mode_v1 || row.followupModeV1 || 'disabled',
      class_level_allows_runtime_v1: sqlBoolean(row.class_level_allows_runtime_v1 || row.classLevelAllowsRuntimeV1),
      group_runtime_eligibility_rule: row.group_runtime_eligibility_rule || row.groupRuntimeEligibilityRule || '',
      asset_validation_required: sqlBoolean(row.asset_validation_required || row.assetValidationRequired),
      asset_validation_minimum: row.asset_validation_minimum || row.assetValidationMinimum || '',
      semantic_admission_required: row.semantic_admission_required || row.semanticAdmissionRequired || '',
      partial_runtime_penalty_rule: row.partial_runtime_penalty_rule || row.partialRuntimePenaltyRule || '',
      effective_runtime_v1: sqlBoolean(row.effective_runtime_v1 || row.effectiveRuntimeV1),
      runtime_block_reason: row.runtime_block_reason || row.runtimeBlockReason || '',
      asset_status: row.asset_status || row.assetStatus || '',
      codex_action_required: row.codex_action_required || row.codexActionRequired || ''
    }))
    .filter(item => item.class_key && item.group_key)
}

function dedupeByKeys(rows = [], keyFields = []) {
  const map = new Map()
  for (const row of rows) {
    const key = keyFields.map(field => String(row[field] || '').trim()).join('|')
    map.set(key, row)
  }
  return Array.from(map.values())
}

async function syncData() {
  const args = parseArgs(process.argv.slice(2))
  const env = String(args.env || defaultEnv).trim()
  const schema = String(args.schema || defaultSchema).trim()
  const ddlMode = String(args.ddl || '').trim().toLowerCase() === 'true'
  const ddlSqlPath = path.resolve(
    repoRoot,
    'scripts',
    'sql',
    'ensure-symptom-class-runtime-tables.sql'
  )
  const ddlFile = assertSqlFileReadable(ddlSqlPath)
  if (ddlMode && !ddlFile) {
    throw new Error(`DDL 模式开启但建表文件不存在或不可读: ${ddlSqlPath}`)
  }

  const classCsvPath = path.resolve(
    resolveRuntimeCsvPath(
      args.classes,
      defaultRuntimeCsvCandidates[0],
      defaultRuntimeCsvCandidates[1]
    )
  )
  const mappingCsvPath = path.resolve(
    resolveRuntimeCsvPath(
      args.mappings,
      defaultRuntimeCsvCandidates[2],
      defaultRuntimeCsvCandidates[3]
    )
  )
  const strategyCsvPath = path.resolve(
    resolveRuntimeCsvPath(
      args.strategies,
      defaultRuntimeCsvCandidates[4],
      defaultRuntimeCsvCandidates[5]
    )
  )

  if (!classCsvPath) {
    throw new Error('未找到 class_symptoms 数据 CSV: 症状模式表 CSV')
  }
  if (!mappingCsvPath) {
    throw new Error('未找到 symptom_class_mapping 数据 CSV')
  }
  if (!strategyCsvPath) {
    throw new Error('未找到 class_question_group_strategy 数据 CSV')
  }

  const secretId = String(args['secret-id'] || aiVisualPoolCoverageConfig.secretId || process.env.CLOUDBASE_SECRET_ID || '')
  const secretKey = String(
    args['secret-key'] || aiVisualPoolCoverageConfig.secretKey || process.env.CLOUDBASE_SECRET_KEY || ''
  )

  if (!env) {
    throw new Error('缺少 --env')
  }

  if (!secretId || !secretKey) {
    throw new Error('缺少 secretId/secretKey')
  }

  const app = cloudbase.init({
    env,
    secretId,
    secretKey
  })
  const models = app.models
  const supportsDdl = await canCreateTablesViaDDL(models)

  if (ddlMode && !supportsDdl) {
    console.warn(
      '当前 CloudBase models $runSQLRaw 不存在，或该环境不支持通过 $runSQLRaw 执行建表/删改。'
      + ' 请先在 CloudBase 控制台执行 '
      + `${ddlSqlPath} 创建 3 张运行时表。`
    )
  }

  if (ddlMode && supportsDdl) {
    const ensureSql = await fs.readFile(ddlFile, 'utf8').catch(() => '')
    if (ensureSql) {
      await runSQL(models, ensureSql, { allowDdl: true })
    }
  }

  await ensureRuntimeTablesExist(
    models,
    schema,
    ddlMode,
    ddlSqlPath,
    supportsDdl
  )

  await runSQL(
    models,
    [
    `DELETE FROM \`${schema}\`.\`symptom_classes\`;`,
      `DELETE FROM \`${schema}\`.\`symptom_class_mapping\`;`,
      `DELETE FROM \`${schema}\`.\`class_question_group_strategy\`;`
    ].join('\n')
  )

  const [classRaw, mappingRaw, strategyRaw] = await Promise.all([
    fs.readFile(classCsvPath, 'utf8'),
    fs.readFile(mappingCsvPath, 'utf8'),
    fs.readFile(strategyCsvPath, 'utf8')
  ])

  const classRows = normalizeClassRows(parseCsv(classRaw)).map(row => {
    row.runtime_notes = row.runtime_notes || ''
    return row
  })

  const mappingRows = normalizeMappingRows(parseCsv(mappingRaw))
  const strategyRows = normalizeStrategyRows(parseCsv(strategyRaw))

  const dedupedClasses = dedupeByKeys(classRows, ['class_key'])
  const dedupedMappings = dedupeByKeys(mappingRows, ['symptom_key', 'class_key', 'mapping_type'])
  const dedupedStrategies = dedupeByKeys(strategyRows, ['class_key', 'group_key'])

  const classColumns = [
    'class_key',
    'class_name_cn',
    'description',
    'question_mode',
    'class_level',
    'parent_class_key',
    'followup_enabled_v1',
    'data_status',
    'data_source',
    'audit_note',
    'followup_mode_v1',
    'runtime_gate_rule',
    'runtime_notes'
  ]

  const mappingColumns = [
    'symptom_key',
    'class_key',
    'symptom_cn',
    'class_name_cn',
    'mapping_strength',
    'is_primary',
    'mapping_type',
    'visual_scoring_allowed',
    'question_activation_allowed',
    'explanation_only_allowed',
    'followup_enabled_v1',
    'data_status',
    'data_source',
    'audit_note',
    'followup_mode_v1',
    'explanation_only_semantic',
    'effective_question_activation_v1',
    'runtime_policy',
    'partial_weight_factor_v1',
    'visual_scoring_effective_v1',
    'primary_class_lock_allowed_v1'
  ]

  const strategyColumns = [
    'class_key',
    'class_name_cn',
    'group_key',
    'group_role',
    'base_priority',
    'allow_when_ai_locked',
    'max_questions_per_round',
    'activation_condition',
    'class_gate_type',
    'class_switch_allowed',
    'unknown_switch_policy',
    'ai_locked_confirm_penalty',
    'pseudo_symptom_allowed',
    'data_status',
    'data_source',
    'audit_note',
    'followup_mode_v1',
    'class_level_allows_runtime_v1',
    'group_runtime_eligibility_rule',
    'asset_validation_required',
    'asset_validation_minimum',
    'semantic_admission_required',
    'partial_runtime_penalty_rule',
    'effective_runtime_v1',
    'runtime_block_reason',
    'asset_status',
    'codex_action_required'
  ]

  const classInsert = buildInsertSql(
    { schema, table: 'symptom_classes' },
    dedupedClasses.map(row => {
      const mapped = {}
      for (const column of classColumns) {
        mapped[column] = row[column] || ''
      }
      mapped.class_key = sqlString(mapped.class_key)
      mapped.class_name_cn = sqlString(mapped.class_name_cn)
      mapped.description = sqlString(mapped.description)
      mapped.question_mode = sqlString(mapped.question_mode)
      mapped.class_level = sqlString(mapped.class_level)
      mapped.parent_class_key = mapped.parent_class_key ? sqlString(mapped.parent_class_key) : 'NULL'
      mapped.followup_enabled_v1 = mapped.followup_enabled_v1
      mapped.data_status = sqlString(mapped.data_status)
      mapped.data_source = mapped.data_source ? sqlString(mapped.data_source) : 'NULL'
      mapped.audit_note = mapped.audit_note ? sqlString(mapped.audit_note) : 'NULL'
      mapped.followup_mode_v1 = sqlString(mapped.followup_mode_v1)
      mapped.runtime_gate_rule = mapped.runtime_gate_rule ? sqlString(mapped.runtime_gate_rule) : 'NULL'
      mapped.runtime_notes = mapped.runtime_notes ? sqlString(mapped.runtime_notes) : 'NULL'
      return mapped
    }),
    classColumns,
    ['class_key']
  )

  const mappingInsert = buildInsertSql(
    { schema, table: 'symptom_class_mapping' },
    dedupedMappings.map(row => {
      const mapped = {}
      for (const column of mappingColumns) {
        mapped[column] = row[column] ?? ''
      }
      mapped.symptom_key = sqlString(mapped.symptom_key)
      mapped.class_key = sqlString(mapped.class_key)
      mapped.symptom_cn = sqlString(mapped.symptom_cn)
      mapped.class_name_cn = sqlString(mapped.class_name_cn)
      mapped.mapping_strength = sqlNumber(mapped.mapping_strength, 0)
      mapped.is_primary = mapped.is_primary
      mapped.mapping_type = sqlString(mapped.mapping_type)
      mapped.visual_scoring_allowed = mapped.visual_scoring_allowed
      mapped.question_activation_allowed = mapped.question_activation_allowed
      mapped.explanation_only_allowed = mapped.explanation_only_allowed
      mapped.followup_enabled_v1 = mapped.followup_enabled_v1
      mapped.data_status = sqlString(mapped.data_status)
      mapped.data_source = mapped.data_source ? sqlString(mapped.data_source) : 'NULL'
      mapped.audit_note = mapped.audit_note ? sqlString(mapped.audit_note) : 'NULL'
      mapped.followup_mode_v1 = sqlString(mapped.followup_mode_v1)
      mapped.explanation_only_semantic = mapped.explanation_only_semantic ? sqlString(mapped.explanation_only_semantic) : 'NULL'
      mapped.effective_question_activation_v1 = mapped.effective_question_activation_v1
      mapped.runtime_policy = mapped.runtime_policy ? sqlString(mapped.runtime_policy) : 'NULL'
      mapped.partial_weight_factor_v1 = sqlNumber(mapped.partial_weight_factor_v1, 1)
      mapped.visual_scoring_effective_v1 = mapped.visual_scoring_effective_v1
      mapped.primary_class_lock_allowed_v1 = mapped.primary_class_lock_allowed_v1
      return mapped
    }),
    mappingColumns,
    ['symptom_key', 'class_key', 'mapping_type']
  )

  const strategyInsert = buildInsertSql(
    { schema, table: 'class_question_group_strategy' },
    dedupedStrategies.map(row => {
      const mapped = {}
      for (const column of strategyColumns) {
        mapped[column] = row[column] ?? ''
      }
      mapped.class_key = sqlString(mapped.class_key)
      mapped.class_name_cn = sqlString(mapped.class_name_cn)
      mapped.group_key = sqlString(mapped.group_key)
      mapped.group_role = sqlString(mapped.group_role)
      mapped.base_priority = mapped.base_priority
      mapped.allow_when_ai_locked = mapped.allow_when_ai_locked
      mapped.max_questions_per_round = mapped.max_questions_per_round
      mapped.activation_condition = mapped.activation_condition ? sqlString(mapped.activation_condition) : 'NULL'
      mapped.class_gate_type = sqlString(mapped.class_gate_type)
      mapped.class_switch_allowed = mapped.class_switch_allowed
      mapped.unknown_switch_policy = mapped.unknown_switch_policy ? sqlString(mapped.unknown_switch_policy) : 'NULL'
      mapped.ai_locked_confirm_penalty = mapped.ai_locked_confirm_penalty
      mapped.pseudo_symptom_allowed = mapped.pseudo_symptom_allowed
      mapped.data_status = sqlString(mapped.data_status)
      mapped.data_source = mapped.data_source ? sqlString(mapped.data_source) : 'NULL'
      mapped.audit_note = mapped.audit_note ? sqlString(mapped.audit_note) : 'NULL'
      mapped.followup_mode_v1 = sqlString(mapped.followup_mode_v1)
      mapped.class_level_allows_runtime_v1 = mapped.class_level_allows_runtime_v1
      mapped.group_runtime_eligibility_rule = mapped.group_runtime_eligibility_rule
        ? sqlString(mapped.group_runtime_eligibility_rule)
        : 'NULL'
      mapped.asset_validation_required = mapped.asset_validation_required
      mapped.asset_validation_minimum = mapped.asset_validation_minimum ? sqlString(mapped.asset_validation_minimum) : 'NULL'
      mapped.semantic_admission_required = mapped.semantic_admission_required
        ? sqlString(mapped.semantic_admission_required)
        : 'NULL'
      mapped.partial_runtime_penalty_rule = mapped.partial_runtime_penalty_rule
        ? sqlString(mapped.partial_runtime_penalty_rule)
        : 'NULL'
      mapped.effective_runtime_v1 = mapped.effective_runtime_v1
      mapped.runtime_block_reason = sqlString(mapped.runtime_block_reason || '')
      mapped.asset_status = sqlString(mapped.asset_status || '')
      mapped.codex_action_required = mapped.codex_action_required
        ? sqlString(mapped.codex_action_required)
        : 'NULL'
      return mapped
    }),
    strategyColumns,
    ['class_key', 'group_key']
  )

  const chunks = [
    [classInsert, `symptom_classes: ${dedupedClasses.length}`],
    [mappingInsert, `symptom_class_mapping: ${dedupedMappings.length}`],
    [strategyInsert, `class_question_group_strategy: ${dedupedStrategies.length}`]
  ]
  for (const [sql, label] of chunks) {
    if (!sql) {continue}
    await runSQL(models, sql, { allowDdl: false })
    console.log(`synced ${label}`)
  }

  const checks = await Promise.all([
    models.$runSQL(
      `SELECT 'symptom_classes' AS table_name, COUNT(*) AS count FROM \`${schema}\`.\`symptom_classes\``,
      {}
    ),
    models.$runSQL(
      `SELECT 'symptom_class_mapping' AS table_name, COUNT(*) AS count FROM \`${schema}\`.\`symptom_class_mapping\``,
      {}
    ),
    models.$runSQL(
      `SELECT 'class_question_group_strategy' AS table_name, COUNT(*) AS count FROM \`${schema}\`.\`class_question_group_strategy\``,
      {}
    )
  ])

  console.log(
    JSON.stringify(
      {
        ok: true,
        env,
        schema,
        timestamps: normalizeDate(),
        source: {
          classes: classCsvPath,
          mappings: mappingCsvPath,
          strategies: strategyCsvPath
        },
        counts: {
          classes: dedupedClasses.length,
          mappings: dedupedMappings.length,
          strategies: dedupedStrategies.length
        },
        verify: checks.map(item => item?.data?.executeResultList?.[0] || item?.data?.[0] || null)
      },
      null,
      2
    )
  )
}

syncData().catch(error => {
  console.error(error)
  process.exit(1)
})
