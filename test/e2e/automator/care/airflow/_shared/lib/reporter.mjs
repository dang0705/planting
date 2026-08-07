'use strict'

/**
 * JSON 报告生成器 -- 空气环境评估端上验收。
 */

import path from 'node:path'
import fs from 'node:fs'

const ALLOWED_CLASSIFICATIONS = new Set(['PASS', 'FAIL_PRODUCT', 'BLOCKED_ENV', 'BLOCKED_FIXTURE'])
const STRUCTURED_FAILURE_KIND = Object.freeze({
  FAIL_PRODUCT: 'failed_product',
  BLOCKED_ENV: 'failed_environment',
  BLOCKED_FIXTURE: 'failed_environment'
})

export function createReport(meta) {
  return {
    task: 'airflow-air-exchange-v1-e2e',
    gitHead: meta.gitHead || null,
    branch: meta.branch || null,
    projectPath: meta.projectPath || null,
    wsEndpoint: meta.wsEndpoint || null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    pages: [],
    pageDataSummaries: [],
    assertions: [],
    screenshots: [],
    classification: null,
    blockerReason: null,
    status: 'running',
    failure_kind: null,
    business_assertions_reached: false
  }
}

export function recordPage(report, pagePath) {
  report.pages.push({ path: pagePath, time: new Date().toISOString() })
}

export function recordPageData(report, pagePath, summary) {
  report.pageDataSummaries.push({
    path: pagePath,
    summary,
    time: new Date().toISOString()
  })
}

export function recordAssertion(report, name, passed, detail) {
  report.assertions.push({
    name,
    passed: Boolean(passed),
    detail: detail || null,
    time: new Date().toISOString()
  })
}

export function recordScreenshot(report, filepath) {
  if (filepath) {
    report.screenshots.push({ path: filepath, time: new Date().toISOString() })
  }
}

export function setClassification(report, classification, reason) {
  if (!ALLOWED_CLASSIFICATIONS.has(classification)) {
    throw new Error(`invalid classification: ${classification}`)
  }
  report.classification = classification
  report.status = classification === 'PASS' ? 'passed' : 'failed'
  report.failure_kind = STRUCTURED_FAILURE_KIND[classification] ?? null
  if (reason) {
    report.blockerReason = reason
  }
}

export function markBusinessAssertionsReached(report) {
  report.business_assertions_reached = true
}

export function leafReportPayload(report) {
  return {
    status: report.status === 'passed' ? 'passed' : 'failed',
    failure_kind: report.failure_kind,
    business_assertions_reached: Boolean(report.business_assertions_reached),
    assertions: report.assertions,
    classification: report.classification,
    blockerReason: report.blockerReason,
    report_path: report.report_path ?? null
  }
}

export function emitLeafReport(report) {
  console.log(JSON.stringify(leafReportPayload(report)))
}

export function markEnded(report) {
  report.endedAt = new Date().toISOString()
}

export function saveReport(report, artifactDir, filename) {
  markEnded(report)
  const filepath = path.resolve(artifactDir, `${filename}.json`)
  fs.writeFileSync(filepath, JSON.stringify(report, null, 2), 'utf8')
  return filepath
}

export function hasFailedAssertions(report) {
  return report.assertions.some(a => !a.passed)
}
