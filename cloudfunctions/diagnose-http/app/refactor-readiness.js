'use strict'

const { getCachedRefactorArtifacts, getRefactorArtifacts } = require('../services/bootstrap-report')

let backgroundRefreshPromise = null
let backgroundRefreshFailure = null

function readinessIsNotReady(artifacts) {
  return artifacts?.readiness?.ready === false
}

function triggerReadinessRefresh(source = '') {
  if (backgroundRefreshPromise) {
    return backgroundRefreshPromise
  }

  backgroundRefreshPromise = Promise.resolve()
    .then(() => getRefactorArtifacts({ forceRefresh: true }))
    .then(artifacts => {
      if (!artifacts?.readiness) {
        backgroundRefreshFailure = new Error(
          'refactor readiness refresh returned no readiness result'
        )
      } else {
        backgroundRefreshFailure = null
      }
      return artifacts
    })
    .catch(error => {
      backgroundRefreshFailure = error
      console.warn('diagnose-http refactor readiness background refresh failed:', {
        source: String(source || '').trim(),
        message: String(error?.message || error || '')
      })
      return null
    })
    .finally(() => {
      backgroundRefreshPromise = null
    })

  return backgroundRefreshPromise
}

function buildDeferredArtifacts(source = '') {
  return {
    readiness: {
      ready: true,
      deferred: true,
      blockingIssues: [],
      checkedAt: new Date().toISOString(),
      source: String(source || '').trim()
    }
  }
}

async function withTimeout(promise, timeoutMs = 0) {
  const safeTimeoutMs = Number(timeoutMs || 0)
  if (!safeTimeoutMs || safeTimeoutMs < 1) {
    return promise
  }

  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          Object.assign(new Error(`refactor readiness timeout after ${safeTimeoutMs}ms`), {
            code: 'REFACTOR_READINESS_TIMEOUT'
          })
        )
      }, safeTimeoutMs)
    })
  ])
}

function throwReadinessError(artifacts = null) {
  const issues = Array.isArray(artifacts?.readiness?.blockingIssues)
    ? artifacts.readiness.blockingIssues.slice(0, 3)
    : []
  const issueText = issues.length ? ` (${issues.join('; ')})` : ''

  throw Object.assign(
    new Error(`诊断数据尚未完成 schema 对齐，请先执行 diff/backfill${issueText}`),
    { statusCode: 503 }
  )
}

async function ensureDiagnosisStartRefactorReady({ source = 'diagnosis-start' } = {}) {
  const freshArtifacts = getCachedRefactorArtifacts()
  const cachedArtifacts = freshArtifacts || getCachedRefactorArtifacts({ allowExpired: true })

  if (backgroundRefreshFailure) {
    triggerReadinessRefresh(source)
    throwReadinessError()
  }

  if (readinessIsNotReady(cachedArtifacts)) {
    if (!freshArtifacts) {
      triggerReadinessRefresh(source)
    }
    throwReadinessError(cachedArtifacts)
  }

  if (!freshArtifacts) {
    triggerReadinessRefresh(source)
  }

  return cachedArtifacts
}

async function ensureRefactorReady({
  strict = true,
  allowStale = false,
  refreshTimeoutMs = null,
  source = ''
} = {}) {
  const cachedArtifacts = getCachedRefactorArtifacts({ allowExpired: allowStale })
  if (cachedArtifacts?.readiness?.ready) {
    return cachedArtifacts
  }

  if (!strict && Number(refreshTimeoutMs || 0) === 0) {
    triggerReadinessRefresh(source)
    return cachedArtifacts || buildDeferredArtifacts(source)
  }

  let artifacts = null
  try {
    artifacts = await withTimeout(getRefactorArtifacts(), refreshTimeoutMs)
  } catch (error) {
    if (!strict) {
      console.warn('diagnose-http refactor readiness skipped for non-strict request:', {
        source: String(source || '').trim(),
        message: String(error?.message || error || '')
      })
      triggerReadinessRefresh(source)
      return cachedArtifacts || buildDeferredArtifacts(source)
    }
    throw error
  }

  if (artifacts?.readiness?.ready) {
    return artifacts
  }

  if (!strict) {
    console.warn('diagnose-http refactor readiness not ready for non-strict request:', {
      source: String(source || '').trim(),
      blockingIssues: Array.isArray(artifacts?.readiness?.blockingIssues)
        ? artifacts.readiness.blockingIssues.slice(0, 3)
        : []
    })
    return artifacts || buildDeferredArtifacts(source)
  }

  throwReadinessError(artifacts)
}

module.exports = {
  ensureDiagnosisStartRefactorReady,
  ensureRefactorReady
}
