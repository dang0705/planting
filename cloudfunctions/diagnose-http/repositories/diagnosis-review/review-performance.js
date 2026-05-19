'use strict'

const PERF_LOG_ENABLED = String(
  process.env.DIAGNOSIS_PERF_LOG || process.env.DEBUG_LOG || ''
).toLowerCase() === 'true'

function createReviewTimingLogger(scope = 'diagnosis-review', context = {}) {
  const startedAt = Date.now()
  const safeScope = String(scope || 'diagnosis-review').trim() || 'diagnosis-review'

  function emit(stage, extra = {}) {
    if (!PERF_LOG_ENABLED) {return}

    console.log(`${safeScope} timing`, {
      ...context,
      ...extra,
      stage,
      elapsedMs: Math.max(0, Date.now() - startedAt)
    })
  }

  return {
    mark(stage, extra = {}) {
      emit(stage, extra)
    },
    finish(extra = {}) {
      emit('complete', extra)
    },
    elapsed() {
      return Math.max(0, Date.now() - startedAt)
    }
  }
}

async function withTimeout(task, timeoutMs = 0, fallbackValue = null) {
  const safeTimeoutMs = Math.max(0, Number(timeoutMs || 0))
  const fallbackResolver = typeof fallbackValue === 'function' ? fallbackValue : () => fallbackValue

  if (!safeTimeoutMs) {
    return {
      timedOut: false,
      value: await Promise.resolve().then(task)
    }
  }

  let timedOut = false
  let timer = null
  const timeoutPromise = new Promise(resolve => {
    timer = setTimeout(() => {
      timedOut = true
      resolve(fallbackResolver())
    }, safeTimeoutMs)
  })

  try {
    const value = await Promise.race([
      Promise.resolve().then(task),
      timeoutPromise
    ])

    return { timedOut, value }
  } finally {
    if (timer) {
      clearTimeout(timer)
    }
  }
}

async function settleOptionalReviewSection({
  scope = 'diagnosis-review',
  sectionName = 'section',
  loader,
  fallbackValue = null,
  degradedSections = null,
  timing = null,
  timeoutMs = 1200
} = {}) {
  const startedAt = Date.now()

  try {
    const { timedOut, value } = await withTimeout(loader, timeoutMs, fallbackValue)
    if (timing) {
      timing.mark(sectionName, {
        status: timedOut ? 'timeout' : 'ok',
        stageElapsedMs: Math.max(0, Date.now() - startedAt)
      })
    }
    if (timedOut && Array.isArray(degradedSections) && !degradedSections.includes(sectionName)) {
      degradedSections.push(sectionName)
    }
    return { value, degraded: timedOut }
  } catch (error) {
    if (timing) {
      timing.mark(sectionName, {
        status: 'error',
        stageElapsedMs: Math.max(0, Date.now() - startedAt),
        message: error?.message || String(error || '')
      })
    }
    console.warn(`${scope} optional section failed`, {
      sectionName,
      message: error?.message || String(error || ''),
      elapsedMs: Math.max(0, Date.now() - startedAt)
    })
    if (Array.isArray(degradedSections) && !degradedSections.includes(sectionName)) {
      degradedSections.push(sectionName)
    }
    return {
      value: typeof fallbackValue === 'function' ? fallbackValue() : fallbackValue,
      degraded: true,
      error
    }
  }
}

function stripDiagnosisReviewListPayload(row = {}) {
  if (!row || typeof row !== 'object') {
    return row
  }

  const compactRow = { ...row }
  delete compactRow.coreSummary
  delete compactRow.routeDecisionSummary
  return compactRow
}

module.exports = {
  createReviewTimingLogger,
  withTimeout,
  settleOptionalReviewSection,
  stripDiagnosisReviewListPayload
}
