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
    classification: null,
    blockerReason: null
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
 * 记录截图绝对路径。
 */
export function recordScreenshot(report, filepath) {
  if (filepath) {
    report.screenshots.push({ path: filepath, time: new Date().toISOString() })
  }
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
  report.classification = classification
  if (reason) {
    report.blockerReason = reason
  }
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
