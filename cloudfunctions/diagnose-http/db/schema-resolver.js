'use strict'

const { AsyncLocalStorage } = require('node:async_hooks')

const PROD_SCHEMA = 'cloud1-2grufevs395a9d5e'
const DEV_SCHEMA = 'cloud1_dev'

const PROD_ENV_VALUES = new Set(['prod', 'production'])
const DEV_ENV_VALUES = new Set(['dev', 'development', 'test', 'testing', 'local', 'stage', 'staging'])

const schemaEnvStorage = new AsyncLocalStorage()

function normalizeEnv(value = '') {
  return String(value || '').trim().toLowerCase()
}

function pickHeader(headers = {}, key = '') {
  if (!headers || typeof headers !== 'object') return ''
  const lowered = String(key || '').toLowerCase()

  for (const [headerKey, headerValue] of Object.entries(headers)) {
    if (String(headerKey || '').toLowerCase() !== lowered) continue
    return String(headerValue || '')
  }

  return ''
}

function resolveSchemaEnv(headers = {}, query = {}, body = {}) {
  const raw =
    pickHeader(headers, 'x-env') ||
    pickHeader(headers, 'x_schema_env') ||
    query?.env ||
    query?.xEnv ||
    body?.env ||
    body?.xEnv ||
    ''

  return normalizeEnv(raw)
}

function getSchemaEnvFromContext() {
  return normalizeEnv(schemaEnvStorage.getStore())
}

function isProductionRuntime() {
  return normalizeEnv(process.env.NODE_ENV) === 'production'
}

function resolveSchema(env) {
  if (isProductionRuntime()) {
    return PROD_SCHEMA
  }

  const runtimeEnv =
    normalizeEnv(env) ||
    getSchemaEnvFromContext() ||
    normalizeEnv(process.env.SCHEMA_ENV) ||
    normalizeEnv(process.env.X_ENV)

  if (PROD_ENV_VALUES.has(runtimeEnv)) {
    return PROD_SCHEMA
  }

  if (DEV_ENV_VALUES.has(runtimeEnv)) {
    return DEV_SCHEMA
  }

  return DEV_SCHEMA
}

function runWithSchemaEnv(env, handler) {
  return schemaEnvStorage.run(normalizeEnv(env), handler)
}

module.exports = {
  DEV_SCHEMA,
  PROD_SCHEMA,
  resolveSchema,
  resolveSchemaEnv,
  runWithSchemaEnv
}

