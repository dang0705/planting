'use strict'

export const NATIVE_TABBAR_CHANNEL = 'native_tabbar'
const DEFAULT_ROUTE_TIMEOUT_MS = 10000
const DEFAULT_POLL_INTERVAL_MS = 100

const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
const routeOf = page => String(page?.path || '').replace(/^\//, '')

export function normalizeNativeTabPath(logicalPath) {
  const path = String(logicalPath || '')
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path
  if (!normalizedPath || normalizedPath.startsWith('/')) {
    throw new TypeError(
      `native tab path must contain at most one leading slash: ${path || 'empty'}`
    )
  }
  return normalizedPath
}

export function nativeTabNavigationDetails(logicalPath) {
  const nativeTabPath = normalizeNativeTabPath(logicalPath)
  return {
    expectedRoute: nativeTabPath,
    navigation_channel: NATIVE_TABBAR_CHANNEL,
    native_tab_path: nativeTabPath,
    operationChannel: 'MiniProgram.switchTab'
  }
}

function normalizeExpectedRoute(route) {
  const normalizedRoute = String(route || '').replace(/^\//, '')
  if (!normalizedRoute || normalizedRoute.startsWith('/')) {
    throw new TypeError(`native tab expected route must be a non-empty route: ${route || 'empty'}`)
  }
  return normalizedRoute
}

export class NativeTabNavigationError extends Error {
  constructor(code, details, cause) {
    super(`${code}: ${JSON.stringify(details)}`)
    this.name = 'NativeTabNavigationError'
    this.code = code
    this.details = details
    this.cause = cause
  }
}

function navigationError(code, details, cause) {
  return new NativeTabNavigationError(code, details, cause)
}

export async function navigateNativeTab({
  mp,
  logicalPath,
  expectedRoute,
  timeoutMs = DEFAULT_ROUTE_TIMEOUT_MS,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  now = Date.now,
  sleep = pause
}) {
  const details = {
    ...nativeTabNavigationDetails(logicalPath),
    ...(expectedRoute ? { expectedRoute: normalizeExpectedRoute(expectedRoute) } : {}),
    observedRoute: 'unavailable'
  }
  if (typeof mp?.switchTab !== 'function') {
    throw navigationError('native_tabbar_unavailable', details)
  }
  try {
    await mp.switchTab(`/${details.native_tab_path}`)
  } catch (error) {
    throw navigationError('native_tabbar_switch_failed', details, error)
  }
  const deadline = now() + timeoutMs
  do {
    try {
      const page = await mp.currentPage()
      details.observedRoute = routeOf(page) || 'unavailable'
      if (details.observedRoute === details.expectedRoute) {
        return page
      }
    } catch (error) {
      details.observedRoute = `currentPage_error:${String(error?.message || error)}`
    }
    if (now() >= deadline) {
      break
    }
    await sleep(Math.min(pollIntervalMs, Math.max(0, deadline - now())))
  } while (now() <= deadline)
  throw navigationError('native_tabbar_route_timeout', details)
}
