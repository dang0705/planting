'use strict'

const { AsyncLocalStorage } = require('async_hooks')

const requestEnvStorage = new AsyncLocalStorage()

function normalizeAppEnv(value) {
  const normalized = String(value || '').trim().toLowerCase()
  if (['dev', 'development', 'cloud1_dev'].includes(normalized)) {
    return 'development'
  }
  if (['prod', 'production', 'cloud1'].includes(normalized)) {
    return 'production'
  }
  return ''
}

function getRequestScopedAppEnv() {
  return normalizeAppEnv(requestEnvStorage.getStore()?.appEnv || '')
}

function runWithRequestAppEnv(appEnv, callback) {
  const normalizedAppEnv = normalizeAppEnv(appEnv)
  return requestEnvStorage.run({ appEnv: normalizedAppEnv }, callback)
}

function resolveCloudbaseEnvId(context) {
  const appEnv =
    getRequestScopedAppEnv() ||
    normalizeAppEnv(process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV)
  const contextEnv = context?.namespace || context?.environment?.TCB_ENV || context?.environ?.TCB_ENV || ''

  if (appEnv === 'development') {
    return (
      process.env.CLOUDBASE_ENV_ID_DEV ||
      process.env.TCB_ENV_DEV ||
      contextEnv ||
      process.env.TCB_ENV ||
      process.env.CLOUDBASE_ENV_ID ||
      ''
    )
  }

  if (appEnv === 'production') {
    return (
      process.env.CLOUDBASE_ENV_ID_PROD ||
      process.env.TCB_ENV_PROD ||
      contextEnv ||
      process.env.TCB_ENV ||
      process.env.CLOUDBASE_ENV_ID ||
      ''
    )
  }

  return (
    contextEnv ||
    process.env.TCB_ENV ||
    process.env.CLOUDBASE_ENV_ID ||
    process.env.CLOUDBASE_ENV_ID_PROD ||
    process.env.CLOUDBASE_ENV_ID_DEV ||
    ''
  )
}

function resolveSqlDatabaseName(context) {
  const appEnv =
    getRequestScopedAppEnv() ||
    normalizeAppEnv(process.env.APP_ENV || process.env.RUNTIME_ENV || process.env.NODE_ENV)

  if (appEnv === 'development') {
    return (
      process.env.SQL_DATABASE_DEV ||
      process.env.CLOUDBASE_SQL_DATABASE_DEV ||
      'cloud1_dev'
    )
  }

  if (appEnv === 'production') {
    return (
      process.env.SQL_DATABASE_PROD ||
      process.env.CLOUDBASE_SQL_DATABASE_PROD ||
      'cloud1-2grufevs395a9d5e'
    )
  }

  return (
    process.env.SQL_DATABASE ||
    process.env.CLOUDBASE_SQL_DATABASE ||
    process.env.SQL_DATABASE_PROD ||
    process.env.CLOUDBASE_SQL_DATABASE_PROD ||
    process.env.SQL_DATABASE_DEV ||
    process.env.CLOUDBASE_SQL_DATABASE_DEV ||
    ''
  )
}

module.exports = {
  normalizeAppEnv,
  getRequestScopedAppEnv,
  runWithRequestAppEnv,
  resolveCloudbaseEnvId,
  resolveSqlDatabaseName
}
