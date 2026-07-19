'use strict'

/**
 * miniprogram-automator 连接客户端 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 连接已存在的 ws://127.0.0.1:9420（不自动启动/关闭 DevTools）
 *   - 提供 reLaunch / currentPage / evaluate / disconnect 代理
 *   - 连接失败以非零退出并报告明确 blocker
 *
 * 不承载业务逻辑；仅做连接封装。
 */

import automator from 'miniprogram-automator'

const CONNECT_TIMEOUT_MS = 15000
const CONNECT_RETRIES = 3
const RETRY_DELAY_MS = 1000

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * 连接已运行的微信开发者工具 automator 服务。
 *
 * @param {string} wsEndpoint - ws://127.0.0.1:9420
 * @returns {Promise<object>} miniProgram 实例
 * @throws 连接失败时抛出，调用方应非零退出
 */
export async function connectAutomator(wsEndpoint) {
  let lastError = null
  for (let attempt = 1; attempt <= CONNECT_RETRIES; attempt++) {
    try {
      const mp = await withTimeout(
        automator.connect({ wsEndpoint }),
        CONNECT_TIMEOUT_MS,
        `connect ${wsEndpoint} timeout`
      )
      return mp
    } catch (error) {
      lastError = error
      if (attempt < CONNECT_RETRIES) {
        await sleep(RETRY_DELAY_MS)
      }
    }
  }
  const message = String(lastError?.message || lastError || 'unknown')
  throw new AutomatorConnectError(wsEndpoint, message)
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${label} after ${ms}ms`)), ms))
  ])
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
  if (!mp) return
  try {
    await mp.disconnect()
  } catch (error) {
    // ignore disconnect errors
  }
}

/**
 * 重启到指定页面并返回 currentPage。
 */
export async function reLaunchTo(mp, pagePath) {
  await mp.reLaunch(pagePath)
  return mp.currentPage()
}
