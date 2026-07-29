import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { extractLeafReport } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-leaf-report.mjs'
import { classifyQaFailure } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-preflight.mjs'
import { cleanupDispatchState, parseJson, repoRoot, runCli, writeJson } from './helpers.mjs'

const fixturePath = path.join(
  repoRoot,
  'test/e2e/batch/workflow/dispatch-gate-contract/fixtures/qa-leaf-live2-timeout.json'
)
const live2Fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
const timeoutLeafReport = extractLeafReport({ stdout: JSON.stringify(live2Fixture) })
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: timeoutLeafReport }),
  'failed_environment',
  'failed steps/failures with timeout must win over the generic failed assertion'
)
const productLeafReport = extractLeafReport({
  stdout: JSON.stringify({
    status: 'failed',
    assertions: [
      { name: 'expected visible card, got null', passed: false, detail: 'expected card' }
    ],
    steps: [{ name: 'visible-card', status: 'failed', detail: 'expected card, got null' }],
    failures: [{ name: 'visible-card', detail: 'expected card, got null' }]
  })
})
assert.equal(classifyQaFailure({ exitCode: 1, leafReport: productLeafReport }), 'failed_product')

const transportNamedBusinessReport = {
  status: 'failed',
  assertions: [
    {
      name: 'runtime scenario completed without transport error',
      passed: false,
      detail: 'expected question-package answer to render'
    }
  ],
  steps: [
    {
      name: 'runtime scenario completed without transport error',
      status: 'failed',
      detail: 'expected question-package answer to render'
    }
  ],
  failures: [
    {
      name: 'runtime scenario completed without transport error',
      detail: 'expected question-package answer to render'
    }
  ]
}
const transportNamedBusinessLeafReport = extractLeafReport({
  stdout: JSON.stringify(transportNamedBusinessReport)
})
assert.equal(
  classifyQaFailure({ exitCode: 1, leafReport: transportNamedBusinessLeafReport }),
  'failed_product',
  'transport words in a failed entry name must not override a business assertion payload'
)

const reconciliationRun = `dispatch-gate-reconcile-${Date.now()}`
const executionId = 'terminal-timeout-record'
const runDir = path.join(repoRoot, '.tmp', 'dispatch-task', reconciliationRun, 'qa-runs')
const recordPath = path.join(runDir, `${executionId}.json`)
const rawReportPath = path.join(runDir, `${executionId}.leaf-report.json`)
const rawReportRef = path.relative(repoRoot, rawReportPath)
writeJson(recordPath, {
  status: 'failed_product',
  gate: 'qa_run',
  dispatch_run_id: reconciliationRun,
  execution_id: executionId,
  catalog_id: 'diagnosis.pest.visual_mode_retake',
  frozen_script_sha256: 'synthetic-frozen-hash',
  live_attempt: 2,
  leaf_report: { raw_report_ref: rawReportRef, failure_kind: 'failed_product' }
})
writeJson(rawReportPath, {
  gate: 'qa_leaf_report',
  raw_report: JSON.stringify(live2Fixture),
  report: live2Fixture
})
const reconciled = runCli([
  'qa-reconcile',
  `--dispatch-run-id=${reconciliationRun}`,
  `--execution-id=${executionId}`
])
assert.equal(reconciled.status, 0, reconciled.stderr || reconciled.stdout)
assert.equal(parseJson(reconciled).classification, 'failed_environment')
const updatedRecord = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
assert.equal(updatedRecord.status, 'failed_environment')
assert.equal(updatedRecord.live_attempt, 2, 'reconciliation must not reset the live-attempt budget')
assert.equal(updatedRecord.leaf_report.raw_report_ref, rawReportRef)
assert.deepEqual(updatedRecord.classification_history[0], {
  version: 'qa_leaf_classification_v2',
  reconciled_at: updatedRecord.classification_history[0].reconciled_at,
  prior_status: 'failed_product',
  prior_classification: 'failed_product',
  recomputed_classification: 'failed_environment',
  raw_report_ref: rawReportRef
})
assert.notEqual(updatedRecord.status, 'passed')
const reconciliationHistoryLength = updatedRecord.classification_history.length
const secondReconciliation = runCli([
  'qa-reconcile',
  `--dispatch-run-id=${reconciliationRun}`,
  `--execution-id=${executionId}`
])
assert.equal(
  secondReconciliation.status,
  0,
  secondReconciliation.stderr || secondReconciliation.stdout
)
assert.equal(parseJson(secondReconciliation).status, 'already_reconciled')
const idempotentRecord = JSON.parse(fs.readFileSync(recordPath, 'utf8'))
assert.equal(
  idempotentRecord.classification_history.length,
  reconciliationHistoryLength,
  'a repeat reconciliation must preserve audit history without another write'
)

const nameOnlyTransportExecutionId = 'name-only-transport-record'
const nameOnlyTransportRecordPath = path.join(runDir, `${nameOnlyTransportExecutionId}.json`)
const nameOnlyTransportRawReportPath = path.join(
  runDir,
  `${nameOnlyTransportExecutionId}.leaf-report.json`
)
const nameOnlyTransportRawReportRef = path.relative(repoRoot, nameOnlyTransportRawReportPath)
writeJson(nameOnlyTransportRecordPath, {
  status: 'failed_environment',
  gate: 'qa_run',
  dispatch_run_id: reconciliationRun,
  execution_id: nameOnlyTransportExecutionId,
  catalog_id: 'diagnosis.pest.visual_mode_retake',
  frozen_script_sha256: 'synthetic-frozen-hash',
  live_attempt: 2,
  leaf_report: {
    raw_report_ref: nameOnlyTransportRawReportRef,
    failure_kind: 'failed_environment'
  }
})
writeJson(nameOnlyTransportRawReportPath, {
  gate: 'qa_leaf_report',
  raw_report: JSON.stringify(transportNamedBusinessReport),
  report: transportNamedBusinessReport
})
const nameOnlyTransportReconciled = runCli([
  'qa-reconcile',
  `--dispatch-run-id=${reconciliationRun}`,
  `--execution-id=${nameOnlyTransportExecutionId}`
])
assert.equal(
  nameOnlyTransportReconciled.status,
  0,
  nameOnlyTransportReconciled.stderr || nameOnlyTransportReconciled.stdout
)
assert.equal(parseJson(nameOnlyTransportReconciled).classification, 'failed_product')
const nameOnlyTransportUpdatedRecord = JSON.parse(fs.readFileSync(nameOnlyTransportRecordPath, 'utf8'))
assert.equal(nameOnlyTransportUpdatedRecord.status, 'failed_product')
assert.equal(
  nameOnlyTransportUpdatedRecord.classification_history[0].recomputed_classification,
  'failed_product'
)
cleanupDispatchState(reconciliationRun)
