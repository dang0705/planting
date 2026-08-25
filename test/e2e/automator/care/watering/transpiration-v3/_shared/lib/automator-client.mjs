'use strict'

/**
 * miniprogram-automator 连接客户端 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 连接 QA 已验证的测试专属 Automator 会话（不启动/关闭 DevTools）
 *   - 提供 reLaunch / currentPage / evaluate / disconnect 代理
 *   - 连接失败以非零退出并报告明确 blocker
 *
 * 不承载业务逻辑；仅做连接封装。
 */

import automator from 'miniprogram-automator'
import {
  connectFormalLeaf,
  disconnectFormalLeaf,
  withDeadline
} from '../../../../../_shared/formal-leaf-harness.mjs'
import { getCurrentPageWithFallback } from '../../../../../_shared/page-probe.mjs'

const CONNECT_TIMEOUT_MS = 15000
const PAGE_SETTLE_STABLE_SAMPLES = 2
const PAGE_SETTLE_SAMPLE_INTERVAL_MS = 350
// AppService can still finish a tap-triggered navigateTo after currentPage
// temporarily reports the previous route. Keep the fence longer than the
// observed route handoff window before allowing a same-target reLaunch.
const PAGE_SETTLE_QUIET_WINDOW_MS = 2500
const NAVIGATION_ATTEMPTS = 2
const NAVIGATION_RETRY_DELAY_MS = 1000
const liveSessions = new WeakMap()

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function normalizePagePath(value) {
  return String(value || '')
    .replace(/^\/+/, '')
    .split('?')[0]
}

async function waitForPageSettled(mp, expectedPath = '') {
  const deadline = Date.now() + CONNECT_TIMEOUT_MS
  let lastError = null
  const expected = normalizePagePath(expectedPath)
  let previousToken = null
  let stableSamples = 0

  while (Date.now() < deadline) {
    const remaining = Math.max(1, deadline - Date.now())
    try {
      const pageProbe = await withDeadline({
        name: 'leaf.current_page_settle_probe',
        timeoutMs: Math.min(3000, remaining),
        operation: () =>
          getCurrentPageWithFallback(mp, {
            timeoutMs: Math.min(3000, remaining),
            perRpcTimeoutMs: Math.min(1500, remaining)
          })
      })
      const page = pageProbe.page
      const actual = normalizePagePath(page?.path)
      if (expected && actual !== expected) {
        await sleep(Math.min(250, Math.max(1, deadline - Date.now())))
        continue
      }
      let domCount = null
      if (typeof page?.$$ === 'function') {
        const nodes = await withDeadline({
          name: 'leaf.current_page_dom_settle_probe',
          timeoutMs: Math.min(3000, Math.max(1, deadline - Date.now())),
          operation: async () => {
            const nodes = await page.$$('view')
            if (!Array.isArray(nodes) || nodes.length === 0) {
              throw new Error('current page DOM is not ready')
            }
            return nodes
          }
        })
        domCount = nodes.length
      }
      const token = `${actual}:${domCount ?? 'unprobed'}`
      stableSamples = token === previousToken ? stableSamples + 1 : 1
      previousToken = token
      if (stableSamples >= PAGE_SETTLE_STABLE_SAMPLES) {
        // A route can expose its first view nodes before the app-service
        // route callback has completed. Keep the target route quiet briefly
        // before issuing another navigation, otherwise a second reLaunch can
        // collide with the in-flight navigateTo and wedge DevTools RPC.
        await sleep(PAGE_SETTLE_QUIET_WINDOW_MS)
        const quietPageProbe = await withDeadline({
          name: 'leaf.current_page_quiet_probe',
          timeoutMs: Math.min(3000, Math.max(1, deadline - Date.now())),
          operation: () =>
            getCurrentPageWithFallback(mp, {
              timeoutMs: Math.min(3000, Math.max(1, deadline - Date.now())),
              perRpcTimeoutMs: 1500
            })
        })
        const quietPage = quietPageProbe.page
        const quietPath = normalizePagePath(quietPage?.path)
        if (!expected || quietPath === expected) {
          return quietPage
        }
        stableSamples = 0
        previousToken = null
      }
      await sleep(Math.min(PAGE_SETTLE_SAMPLE_INTERVAL_MS, Math.max(1, deadline - Date.now())))
    } catch (error) {
      lastError = error
      await sleep(Math.min(250, Math.max(1, deadline - Date.now())))
    }
  }

  const error = new Error(
    `leaf page did not settle${expected ? ` at ${expected}` : ''}${lastError ? `: ${lastError.message}` : ''}`
  )
  error.code = 'automator_page_settle_timeout'
  throw error
}

function makeResumableSession(initial) {
  let current = initial
  const session = new Proxy(
    {},
    {
      get(_target, property) {
        const value = current?.[property]
        return typeof value === 'function' ? value.bind(current) : value
      }
    }
  )
  liveSessions.set(session, next => {
    current = next
  })
  return session
}

export function resumeAutomatorSession(session, next) {
  const replace = liveSessions.get(session)
  if (replace) replace(next)
  return session
}

/**
 * 连接已运行的微信开发者工具 automator 服务。
 *
 * @param {string} wsEndpoint - 已验证的测试专属 WebSocket 端点
 * @returns {Promise<object>} miniProgram 实例
 * @throws 连接失败时抛出，调用方应非零退出
 */
export async function connectAutomator(wsEndpoint) {
  try {
    const { mp } = await connectFormalLeaf({ automator, wsEndpoint, timeoutMs: CONNECT_TIMEOUT_MS })
    // Preserve renderer/AppService exception evidence in the leaf stdout.  The
    // formal report only receives the terminal classification, while an
    // uncaught runtime exception is otherwise reduced to a bare message such
    // as "Uncaught uni is not defined".  This listener is diagnostic-only and
    // does not alter the runtime or swallow the exception event.
    if (typeof mp?.on === 'function') {
      mp.on('exception', exception => {
        try {
          console.error('[automator.exception]', JSON.stringify(exception))
        } catch {
          console.error('[automator.exception]', String(exception))
        }
      })
    }
    return makeResumableSession(mp)
  } catch (error) {
    throw new AutomatorConnectError(wsEndpoint, String(error?.message || error))
  }
}

/**
 * 自定义连接错误，便于上层区分 BLOCKED_ENV。
 */
export class AutomatorConnectError extends Error {
  constructor(wsEndpoint, reason) {
    super(`automator connect failed: ${wsEndpoint} — ${reason}`)
    this.name = 'AutomatorConnectError'
    this.wsEndpoint = wsEndpoint
    this.reason = reason
    this.classification = 'BLOCKED_ENV'
  }
}

/**
 * 安全断开连接，吞掉断开错误（已在 finally）。
 */
export async function safeDisconnect(mp) {
  if (!mp) return { status: 'not_needed' }
  try {
    return await disconnectFormalLeaf({ mp, timeoutMs: CONNECT_TIMEOUT_MS })
  } catch {
    return { status: 'failed_environment', code: 'formal_leaf_disconnect_failed' }
  }
}

/**
 * 重启到指定页面并返回 currentPage。
 */
export async function reLaunchTo(mp, pagePath) {
  // miniprogram-automator 0.12.x 的 MiniProgram.reLaunch() 会先调用
  // currentPage() 再发起 wx.reLaunch。详情页正在异步请求/切换时，这个
  // 无必要的前置 App.getCurrentPage RPC 可能卡住，导致所有叶子用例的
  // 二次入口验证被错误归类为环境超时。直接调用运行时 wx.reLaunch，
  // 再用独立 deadline 确认目标页，避免把导航和旧页面探活耦合在一起。
  const routeOperation =
    typeof mp.callWxMethod === 'function'
      ? () => mp.callWxMethod('reLaunch', { url: pagePath })
      : () => mp.reLaunch(pagePath)
  const settledPage = await withDeadline({
    name: 'leaf.page_settle_before_relaunch',
    timeoutMs: CONNECT_TIMEOUT_MS,
    operation: () => waitForPageSettled(mp)
  })
  if (normalizePagePath(settledPage?.path) === normalizePagePath(pagePath)) {
    return settledPage
  }
  let navigationError = null
  for (let attempt = 1; attempt <= NAVIGATION_ATTEMPTS; attempt += 1) {
    try {
      await withDeadline({
        name: `leaf.relaunch.attempt_${attempt}`,
        timeoutMs: CONNECT_TIMEOUT_MS,
        operation: routeOperation
      })
      navigationError = null
      break
    } catch (error) {
      navigationError = error
      if (attempt < NAVIGATION_ATTEMPTS) {
        // A previous tap-triggered navigateTo may still be releasing its
        // AppService route lock after the first reLaunch deadline. The second
        // attempt is idempotent and remains bounded.
        await sleep(NAVIGATION_RETRY_DELAY_MS)
      }
    }
  }
  if (navigationError) {
    throw navigationError
  }
  return withDeadline({
    name: 'leaf.page_settle_after_relaunch',
    timeoutMs: CONNECT_TIMEOUT_MS,
    operation: () => waitForPageSettled(mp, pagePath)
  })
}
