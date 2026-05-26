'use strict'

const { runWithSchemaEnv } = require('../db/schema-resolver')
const { preloadQuestionRepositoryCache } = require('../repositories/question-repository')
const { preloadOutcomeRouteRepositoryCache } = require('../repositories/outcome-route-repository')

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
  triggerStaticRepositoryCachePreload,
  triggerStaticRepositoryCachePreloadForSchemaEnvs
}
