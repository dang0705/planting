'use strict'

/**
 * JSON 报告生成器 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 构建结构化报告对象（含 git HEAD、projectPath、mode、时间、页面、请求、断言、截图、classification）
 *   - 累积断言记录
 *   - 累积页面路径与 page data 摘要
 *   - 累积捕获的 wx.request 请求/响应
 *   - 累积截图绝对路径
 *   - 写入 JSON 文件并返回路径
 *
 * 不承载业务逻辑；仅做报告结构化与持久化。
 */

import path from 'node:path'
import fs from 'node:fs'

const ALLOWED_CLASSIFICATIONS = new Set(['PASS', 'FAIL_PRODUCT', 'BLOCKED_ENV', 'BLOCKED_FIXTURE'])
const STRUCTURED_FAILURE_KIND = Object.freeze({
  FAIL_PRODUCT: 'failed_product',
  BLOCKED_ENV: 'failed_environment',
  BLOCKED_FIXTURE: 'failed_environment'
})

/**
 * 创建一个新的报告构建器。
 *
 * @param {object} meta - { gitHead, projectPath, mode, branch, baseHead, wsEndpoint }
 */
export function createReport(meta) {
  return {
    task: 'watering-transpiration-v3-e2e-trae-20260713',
    gitHead: meta.gitHead || null,
    branch: meta.branch || null,
    baseHead: meta.baseHead || null,
    projectPath: meta.projectPath || null,
    mode: meta.mode || 'shadow',
    wsEndpoint: meta.wsEndpoint || null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    pages: [],
    pageDataSummaries: [],
    capturedRequests: [],
    assertions: [],
    screenshots: [],
    screenshot_attempts: [],
    classification: null,
    blockerReason: null,
    status: 'running',
    failure_kind: null,
    business_assertions_reached: false
  }
}

/**
 * 记录页面路径。
 */
export function recordPage(report, pagePath) {
  report.pages.push({ path: pagePath, time: new Date().toISOString() })
}

/**
 * 记录 page data 摘要。
 */
export function recordPageData(report, pagePath, summary) {
  report.pageDataSummaries.push({
    path: pagePath,
    summary,
    time: new Date().toISOString()
  })
}

/**
 * 记录捕获的请求列表。
 */
export function recordRequests(report, requests) {
  for (const req of requests) {
    report.capturedRequests.push(req)
  }
}

/**
 * 记录单条断言。
 *
 * @param {object} report
 * @param {string} name - 断言名称
 * @param {boolean} passed - 是否通过
 * @param {string} [detail] - 详情
 */
export function recordAssertion(report, name, passed, detail) {
  report.assertions.push({
    name,
    passed: Boolean(passed),
    detail: detail || null,
    time: new Date().toISOString()
  })
}

/**
 * Mark the point at which the leaf has crossed from harness/page readiness
 * into a real product operation.  This is deliberately explicit: a selector
 * or transport assertion alone must not be accepted as business evidence.
 */
export function markBusinessAssertionsReached(report) {
  report.business_assertions_reached = true
}

/**
 * 记录截图绝对路径。
 */
export function recordScreenshot(report, filepath) {
  if (filepath) {
    report.screenshots.push({ path: filepath, time: new Date().toISOString() })
  }
}

/**
 * Record the bounded worker attempts for a business screenshot.  Formal live
 * leaves must prove that their first attempt succeeded; diagnostic leaves may
 * still retain their bounded recovery behavior, but their attempts remain
 * visible in the raw report.
 */
export function recordScreenshotAttempts(report, label, attempts) {
  if (!Array.isArray(attempts)) {
    return
  }
  report.screenshot_attempts.push({
    label: String(label || ''),
    attempts: attempts.map(attempt => ({ ...attempt }))
  })
}

/**
 * 设置最终 classification。
 *
 * @param {object} report
 * @param {string} classification - PASS|FAIL_PRODUCT|BLOCKED_ENV|BLOCKED_FIXTURE
 * @param {string} [reason] - blocker 原因
 */
export function setClassification(report, classification, reason) {
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) {
    throw new Error(`invalid classification: ${classification}`)
  }
  if (classification === 'PASS' && hasFailedAssertions(report)) {
    classification = 'FAIL_PRODUCT'
    reason ||= 'one or more assertions failed'
  }
  report.classification = classification
  report.status = classification === 'PASS' ? 'passed' : 'failed'
  report.failure_kind = STRUCTURED_FAILURE_KIND[classification] ?? null
  if (reason) {
    report.blockerReason = reason
  }
}

export function emitLeafReport(report) {
  console.log(
    JSON.stringify({
      status: report.status === 'passed' ? 'passed' : 'failed',
      failure_kind: report.failure_kind,
      business_assertions_reached: Boolean(report.business_assertions_reached),
      assertions: report.assertions,
      screenshot_attempts: report.screenshot_attempts,
      classification: report.classification,
      blockerReason: report.blockerReason
    })
  )
}

/**
 * 标记报告结束时间。
 */
export function markEnded(report) {
  report.endedAt = new Date().toISOString()
}

/**
 * 写入 JSON 报告文件。
 *
 * @param {object} report
 * @param {string} artifactDir
 * @param {string} filename - 不含扩展名
 * @returns {string} 报告绝对路径
 */
export function saveReport(report, artifactDir, filename) {
  markEnded(report)
  const filepath = path.resolve(artifactDir, `${filename}.json`)
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8')
  return filepath
}

/**
 * 判断报告中是否有失败的断言。
 */
export function hasFailedAssertions(report) {
  return report.assertions.some(a => !a.passed)
}
