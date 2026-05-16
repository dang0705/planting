'use strict'

const { getRefactorArtifacts } = require('../services/bootstrap-report')

async function ensureRefactorReady() {
  const artifacts = await getRefactorArtifacts()
  if (artifacts?.readiness?.ready) {
    return artifacts
  }

  const issues = Array.isArray(artifacts?.readiness?.blockingIssues)
    ? artifacts.readiness.blockingIssues.slice(0, 3)
    : []
  const issueText = issues.length ? ` (${issues.join('; ')})` : ''

  throw Object.assign(
    new Error(`诊断数据尚未完成 schema 对齐，请先执行 diff/backfill${issueText}`),
    { statusCode: 503 }
  )
}

module.exports = {
  ensureRefactorReady
}
