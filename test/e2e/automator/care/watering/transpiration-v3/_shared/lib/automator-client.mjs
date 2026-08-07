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

const CONNECT_TIMEOUT_MS = 15000
const liveSessions = new WeakMap()

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
    return makeResumableSession(
      (await connectFormalLeaf({ automator, wsEndpoint, timeoutMs: CONNECT_TIMEOUT_MS })).mp
    )
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
  await withDeadline({
    name: 'leaf.relaunch',
    timeoutMs: CONNECT_TIMEOUT_MS,
    operation: () => mp.reLaunch(pagePath)
  })
  return withDeadline({
    name: 'leaf.current_page',
    timeoutMs: CONNECT_TIMEOUT_MS,
    operation: () => mp.currentPage()
  })
}
