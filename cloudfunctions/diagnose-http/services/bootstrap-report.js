'use strict'

const { models } = require('/opt/utils/cloudbase')
const requiredTables = require('../constants/tables')
const repositoryShapes = require('../constants/repository-shapes')
const keyAliasMap = require('../constants/key-alias-map')
const { resolveSchema } = require('../db/schema-resolver')
const { sqlInList } = require('../repositories/sql')
const { buildDataDiffReport } = require('../mappers/data-diff-builder')
const { buildBackfillPlan } = require('../mappers/data-backfill-builder')

const CACHE_TTL_MS = 60 * 1000
const cacheBySchema = new Map()

function getSchemaCache(schema) {
  const safeSchema = String(schema || '').trim() || 'default'
  if (!cacheBySchema.has(safeSchema)) {
    cacheBySchema.set(safeSchema, {
      expiresAt: 0,
      artifacts: null
    })
  }
  return cacheBySchema.get(safeSchema)
}

function buildReadiness(dataDiffReport = {}) {
  const blockingIssues = []
  const missingTables = Array.isArray(dataDiffReport.missingTables)
    ? dataDiffReport.missingTables
    : []
  const tableDiffs = Array.isArray(dataDiffReport.tableDiffs)
    ? dataDiffReport.tableDiffs
    : []

  if (missingTables.length) {
    blockingIssues.push(`missing_tables:${missingTables.join(',')}`)
  }

  const missingColumns = tableDiffs
    .filter(item => Array.isArray(item?.missingColumns) && item.missingColumns.length)
    .map(item => `${item.table}:${item.missingColumns.join('|')}`)

  if (missingColumns.length) {
    blockingIssues.push(`missing_columns:${missingColumns.join(';')}`)
  }

  return {
    ready: blockingIssues.length === 0,
    blockingIssues,
    checkedAt: new Date().toISOString()
  }
}

function buildRefactorArtifacts(runtimeSchema = {}) {
  const dataDiffReport = buildDataDiffReport({ runtimeSchema })
  const backfillPlan = buildBackfillPlan(dataDiffReport)

  return {
    dataDiffReport,
    keyAliasMap,
    backfillPlan,
    repositoryOutputShape: repositoryShapes,
    readiness: buildReadiness(dataDiffReport)
  }
}

async function loadRuntimeSchema(schemaName = '') {
  const runtimeSchema = {}

  const result = await models.$runSQL(
    `
      SELECT table_name, column_name
      FROM information_schema.columns
      WHERE table_schema = {{schemaName}}
        AND table_name IN ${sqlInList(requiredTables)}
      ORDER BY table_name ASC, ordinal_position ASC
    `,
    { schemaName: String(schemaName || '').trim() }
  )

  for (const row of result?.data?.executeResultList || []) {
    const tableName = String(
      row.table_name ||
        row.TABLE_NAME ||
        row.Table_Name ||
        ''
    ).trim()
    const columnName = String(
      row.column_name ||
        row.COLUMN_NAME ||
        row.Column_Name ||
        ''
    ).trim()
    if (!tableName || !columnName) {continue}
    if (!runtimeSchema[tableName]) {
      runtimeSchema[tableName] = []
    }
    runtimeSchema[tableName].push(columnName)
  }

  return runtimeSchema
}

async function getRefactorArtifacts({ forceRefresh = false } = {}) {
  const schemaName = resolveSchema()
  const cache = getSchemaCache(schemaName)
  const now = Date.now()

  if (!forceRefresh && cache.artifacts && cache.expiresAt > now) {
    return cache.artifacts
  }

  let runtimeSchema = {}
  let runtimeSchemaError = null

  try {
    runtimeSchema = await loadRuntimeSchema(schemaName)
  } catch (error) {
    runtimeSchemaError = error
  }

  const artifacts = buildRefactorArtifacts(runtimeSchema)
  artifacts.runtimeSchema = {
    schema: schemaName,
    tableCount: Object.keys(runtimeSchema || {}).filter(
      tableName => Array.isArray(runtimeSchema[tableName]) && runtimeSchema[tableName].length
    ).length
  }

  if (runtimeSchemaError) {
    artifacts.readiness.ready = false
    artifacts.readiness.blockingIssues = Array.from(
      new Set([
        ...(Array.isArray(artifacts.readiness.blockingIssues) ? artifacts.readiness.blockingIssues : []),
        `runtime_schema_read_failed:${runtimeSchemaError.message}`
      ])
    )
  }

  cache.artifacts = artifacts
  cache.expiresAt = now + CACHE_TTL_MS
  return artifacts
}

function getCachedRefactorArtifacts({ allowExpired = false } = {}) {
  const schemaName = resolveSchema()
  const cache = getSchemaCache(schemaName)
  if (!cache.artifacts) {
    return null
  }
  if (!allowExpired && cache.expiresAt <= Date.now()) {
    return null
  }
  return cache.artifacts
}

module.exports = {
  getRefactorArtifacts,
  getCachedRefactorArtifacts
}
