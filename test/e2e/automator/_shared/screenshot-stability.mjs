import fs from 'node:fs'
import path from 'node:path'
import { getCurrentPageWithFallback } from './page-probe.mjs'

export const DEFAULT_SCREENSHOT_STABILITY_TIMEOUT_MS = 10_000
export const DEFAULT_SCREENSHOT_QUIET_WINDOW_MS = 900
export const DEFAULT_SCREENSHOT_STABILITY_POLL_MS = 150
export const DEFAULT_SCREENSHOT_STABLE_SAMPLES = 2

export function screenshotStabilityBudget(timeoutMs) {
  const total = Number(timeoutMs)
  if (!Number.isFinite(total) || total <= 0) {
    return DEFAULT_SCREENSHOT_STABILITY_TIMEOUT_MS
  }
  return Math.min(5_000, Math.max(1_000, total - 1_500))
}

const DEFAULT_PROJECT_PATH = path.resolve(process.cwd(), 'dist/dev/mp-weixin')

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizeRoute(page) {
  return String(page?.path || '').replace(/^\//, '')
}

function resolveProjectPath(projectPath, env = process.env) {
  return String(projectPath || env.MP_PROJECT_PATH || DEFAULT_PROJECT_PATH).trim()
}

function pageStateToken(page, data) {
  const route = normalizeRoute(page)
  if (typeof data === 'undefined') {
    return route
  }
  try {
    return `${route}|${JSON.stringify(data).slice(0, 20_000)}`
  } catch {
    return `${route}|unserializable`
  }
}

function withTimeout(action, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      const error = new Error(`screenshot stability probe timed out after ${timeoutMs}ms`)
      error.code = 'screenshot_stability_probe_timeout'
      reject(error)
    }, timeoutMs)
    Promise.resolve()
      .then(action)
      .then(
        value => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          resolve(value)
        },
        error => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          reject(error)
        }
      )
  })
}

function statSignature(projectPath, fsModule) {
  const candidates = [
    projectPath,
    path.join(projectPath, 'app.js'),
    path.join(projectPath, 'app.json'),
    path.join(projectPath, 'app.wxss'),
    path.join(projectPath, 'common/vendor.js'),
    path.join(projectPath, 'project.config.json')
  ]
  return candidates
    .map(candidate => {
      try {
        const stat = fsModule.statSync(candidate)
        return `${candidate}:${stat.mtimeMs}:${stat.size}`
      } catch {
        return `${candidate}:missing`
      }
    })
    .join('|')
}

function createProjectQuietMonitor(projectPath, fsModule = fs) {
  const resolved = resolveProjectPath(projectPath)
  let lastChangedAt = Date.now()
  let lastSignature = statSignature(resolved, fsModule)
  let watcher = null
  let pollTimer = null
  let closed = false

  const markChanged = () => {
    lastChangedAt = Date.now()
  }

  try {
    if (fsModule.existsSync(resolved)) {
      watcher = fsModule.watch(resolved, { recursive: true }, markChanged)
      watcher.on?.('error', () => {})
    }
  } catch {
    watcher = null
  }

  if (!watcher) {
    pollTimer = setInterval(() => {
      if (closed) {
        return
      }
      const nextSignature = statSignature(resolved, fsModule)
      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature
        markChanged()
      }
    }, 200)
  }

  return {
    get lastChangedAt() {
      return lastChangedAt
    },
    close() {
      closed = true
      watcher?.close?.()
      if (pollTimer) {
        clearInterval(pollTimer)
      }
    }
  }
}

export async function waitForScreenshotStability({
  miniProgram,
  expectedRoute = '',
  projectPath,
  timeoutMs = DEFAULT_SCREENSHOT_STABILITY_TIMEOUT_MS,
  quietWindowMs = DEFAULT_SCREENSHOT_QUIET_WINDOW_MS,
  pollIntervalMs = DEFAULT_SCREENSHOT_STABILITY_POLL_MS,
  stableSamples = DEFAULT_SCREENSHOT_STABLE_SAMPLES,
  readPageData = false,
  fsModule = fs,
  sleepFn = sleep
} = {}) {
  if (typeof miniProgram?.currentPage !== 'function') {
    return {
      status: 'skipped',
      reason: 'current_page_probe_unavailable',
      project_path: resolveProjectPath(projectPath)
    }
  }

  const startedAt = Date.now()
  const deadline = startedAt + timeoutMs
  const monitor = createProjectQuietMonitor(projectPath, fsModule)
  let previousToken = null
  let stableCount = 0
  let lastRoute = ''
  let dataProbe = 'not_requested'
  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now()
      const quietFor = Date.now() - monitor.lastChangedAt
      if (quietFor < quietWindowMs) {
        await sleepFn(Math.min(pollIntervalMs, quietWindowMs - quietFor))
        continue
      }

      const page = (
        await withTimeout(
          () =>
            getCurrentPageWithFallback(miniProgram, {
              timeoutMs: Math.min(2_500, Math.max(1, remaining)),
              perRpcTimeoutMs: 1250
            }),
          Math.min(2_500, Math.max(1, remaining))
        )
      ).page
      const route = normalizeRoute(page)
      lastRoute = route
      if (expectedRoute && route !== expectedRoute) {
        const error = new Error(`expected ${expectedRoute}, got ${route || 'unknown'}`)
        error.code = 'screenshot_stability_route_mismatch'
        error.expectedRoute = expectedRoute
        error.actualRoute = route
        throw error
      }
      let data
      if (readPageData && typeof page?.data === 'function') {
        try {
          data = await withTimeout(
            () => page.data(),
            Math.min(250, Math.max(1, deadline - Date.now()))
          )
          dataProbe = 'passed'
        } catch {
          // A page-data RPC can be the thing that is wedged during appservice
          // reload. Route stability plus the build quiet window is still a
          // useful capture gate, so degrade this optional probe instead of
          // consuming the entire screenshot budget.
          dataProbe = 'timed_out_or_unavailable'
          data = undefined
        }
      } else {
        dataProbe = 'skipped'
      }
      const token = pageStateToken(page, data)
      stableCount = token === previousToken ? stableCount + 1 : 1
      previousToken = token
      if (stableCount >= stableSamples && Date.now() - monitor.lastChangedAt >= quietWindowMs) {
        return {
          status: 'passed',
          route,
          stable_samples: stableCount,
          data_probe: dataProbe,
          quiet_window_ms: Date.now() - monitor.lastChangedAt,
          duration_ms: Date.now() - startedAt,
          project_path: resolveProjectPath(projectPath)
        }
      }
      await sleepFn(Math.min(pollIntervalMs, Math.max(1, deadline - Date.now())))
    }
    const error = new Error(
      `renderer did not become stable after ${timeoutMs}ms (route=${lastRoute || 'unknown'})`
    )
    error.code = 'screenshot_stability_timeout'
    error.stability = {
      timeout_ms: timeoutMs,
      quiet_window_ms: quietWindowMs,
      last_route: lastRoute || null,
      stable_samples: stableCount
    }
    throw error
  } finally {
    monitor.close()
  }
}
