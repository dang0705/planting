'use strict'

const { runWithSchemaEnv } = require('../db/schema-resolver')
const {
  preloadQuestionRepositoryCache,
  preloadQuestionPackageCache
} = require('../repositories/question-repository')
const {
  preloadOutcomeRouteRepositoryCache,
  preloadDiagnosisAnswerPackageCache,
  getDiagnosisAnswerPackageRuntimeData: getCachedDiagnosisAnswerPackageRuntimeData
} = require('../repositories/outcome-route-repository')
const { WATERING_FREQUENCY_CONTEXT_QUESTION_KEY } = require('./diagnosis-question-registry')

const DEFAULT_PRELOAD_SCHEMA_ENVS = ['production', 'development']

function buildLogContext(context = {}) {
  const scope = String(context.scope || 'diagnose-http').trim() || 'diagnose-http'
  return {
    scope,
    logContext: {
      sessionId: String(context.sessionId || '').trim(),
      openid: String(context.openid || '').trim(),
      source: String(context.source || '').trim(),
      schemaEnv: String(context.schemaEnv || '').trim()
    }
  }
}

function preloadStaticRepositoryCacheForCurrentSchema() {
  return Promise.all([
    preloadQuestionRepositoryCache(),
    preloadOutcomeRouteRepositoryCache()
  ])
}

function triggerStaticRepositoryCachePreload(context = {}) {
  const { scope, logContext } = buildLogContext(context)

  Promise.resolve()
    .then(preloadStaticRepositoryCacheForCurrentSchema)
    .catch(error => {
      console.warn(`${scope} static cache preload failed`, {
        ...logContext,
        message: error?.message || String(error || '')
      })
    })
}

function triggerDiagnosisAnswerPackageCachePreload(questionKeys = [], context = {}) {
  const { scope, logContext } = buildLogContext(context)
  const additionalOutcomeKeys = Array.isArray(context?.additionalOutcomeKeys)
    ? context.additionalOutcomeKeys
    : []

  return Promise.resolve()
    .then(() => preloadDiagnosisAnswerPackageCache(questionKeys, additionalOutcomeKeys))
    .catch(error => {
      console.warn(`${scope} diagnosis answer package cache preload failed`, {
        ...logContext,
        message: error?.message || String(error || '')
      })
      return null
    })
}

function getDiagnosisAnswerPackageRuntimeData() {
  return getCachedDiagnosisAnswerPackageRuntimeData()
}

function triggerQuestionPackageCachePreload(context = {}) {
  const { scope, logContext } = buildLogContext(context)

  return Promise.resolve()
    .then(() => preloadQuestionPackageCache([WATERING_FREQUENCY_CONTEXT_QUESTION_KEY]))
    .catch(error => {
      console.warn(`${scope} question package cache preload failed`, {
        ...logContext,
        message: error?.message || String(error || '')
      })
      return null
    })
}

function triggerStaticRepositoryCachePreloadForSchemaEnvs(schemaEnvs = DEFAULT_PRELOAD_SCHEMA_ENVS, context = {}) {
  const safeSchemaEnvs = Array.from(
    new Set((Array.isArray(schemaEnvs) ? schemaEnvs : [])
      .map(item => String(item || '').trim())
      .filter(Boolean))
  )

  for (const schemaEnv of safeSchemaEnvs) {
    const { scope, logContext } = buildLogContext({
      ...context,
      schemaEnv
    })

    Promise.resolve()
      .then(() => runWithSchemaEnv(schemaEnv, preloadStaticRepositoryCacheForCurrentSchema))
      .catch(error => {
        console.warn(`${scope} static cache preload failed`, {
          ...logContext,
          message: error?.message || String(error || '')
        })
      })
  }
}

module.exports = {
  preloadStaticRepositoryCacheForCurrentSchema,
  preloadDiagnosisAnswerPackageCache,
  getDiagnosisAnswerPackageRuntimeData,
  triggerStaticRepositoryCachePreload,
  triggerDiagnosisAnswerPackageCachePreload,
  triggerQuestionPackageCachePreload,
  triggerStaticRepositoryCachePreloadForSchemaEnvs
}
