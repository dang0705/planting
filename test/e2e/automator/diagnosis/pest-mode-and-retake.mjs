#!/usr/bin/env node
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  connectFormalLeaf,
  disconnectFormalLeaf,
  formalAutomatorEndpoint,
  installFormalLeafPrincipal
} from '../_shared/formal-leaf-harness.mjs'
import {
  DEFAULT_ARTIFACT_DIR,
  FORMAL_PRINCIPAL,
  assertSourceContract,
  createReport,
  loadAutomator,
  recordAssertion,
  requiredScreenshotCheckpointEvidence,
  resetScreenshotBudget,
  runAutomatorStep,
  setActiveHarnessAutomator
} from './pest-mode-and-retake/runtime-core.mjs'
import { installHarness } from './pest-mode-and-retake/fixture-state.mjs'
import {
  readModals,
  readRequests,
  restoreHarness
} from './pest-mode-and-retake/fixture-restore.mjs'
import { runFiveTabAndReuseScenario } from './pest-mode-and-retake/scenario-tabs.mjs'
import { runShortcutScenario } from './pest-mode-and-retake/scenario-shortcuts.mjs'
import { runPestScenario } from './pest-mode-and-retake/scenario-retake.mjs'

export async function runPestModeAndRetakeScenario({
  wsEndpoint = formalAutomatorEndpoint(),
  dryRun = process.env.DRY_RUN === '1',
  artifactDir = DEFAULT_ARTIFACT_DIR,
  fixtureEnabled = process.env.E2E_DIAGNOSE_FIXTURE !== '0'
} = {}) {
  assertSourceContract()
  if (dryRun) {
    return {
      status: 'dry_source_contract_passed',
      scenarios: [
        'runtime.full_shortcuts',
        'runtime.pest_shared_question_package_answer_submit',
        'runtime.pest_direction_risk_skip_retake_countdown',
        'runtime.pest_server_skip_unknown_terminal',
        'runtime.pest_retake_terminal_timeout'
      ],
      fixture_injection_path:
        'E2E_DIAGNOSE_FIXTURE=1 patches uni.request/wx.request in miniprogram runtime',
      not_verified: ['real model call', 'natural three-minute wall-clock wait']
    }
  }
  mkdirSync(artifactDir, { recursive: true })
  const report = createReport({ wsEndpoint, fixtureEnabled })
  const automator = await loadAutomator()
  assert.ok(automator, 'miniprogram-automator is required for runtime replay')
  setActiveHarnessAutomator(automator)
  let miniProgram = null
  try {
    miniProgram = (
      await runAutomatorStep(report, 'runtime.connect', () =>
        connectFormalLeaf({ automator, wsEndpoint })
      )
    ).mp
    await runAutomatorStep(report, 'runtime.installFormalPrincipal', () =>
      installFormalLeafPrincipal({
        mp: miniProgram,
        principal: FORMAL_PRINCIPAL,
        env: { ...process.env, QA_CATALOG_DATA_MODE: 'fixture_diagnostic' }
      })
    )
    await runAutomatorStep(report, 'runtime.installHarness', () =>
      installHarness(miniProgram, fixtureEnabled)
    )
    resetScreenshotBudget()
    await runAutomatorStep(report, 'scenario.fiveTabAndReuse', () =>
      runFiveTabAndReuseScenario(report, miniProgram, wsEndpoint, artifactDir)
    )
    for (const retakeMode of ['active', 'skip', 'expired']) {
      await runAutomatorStep(report, `scenario.pest.${retakeMode}`, () =>
        runPestScenario(report, miniProgram, wsEndpoint, artifactDir, retakeMode)
      )
    }
    await runAutomatorStep(report, 'scenario.fullShortcut', () =>
      runShortcutScenario(report, miniProgram, wsEndpoint, artifactDir)
    )
    report.requests = await runAutomatorStep(report, 'evidence.readRequests', () =>
      readRequests(miniProgram)
    )
    report.modals = await runAutomatorStep(report, 'evidence.readModals', () =>
      readModals(miniProgram)
    )
    recordAssertion(
      report,
      'diagnose start request captured',
      report.requests.some(req => String(req.url).includes('diagnose-http/diagnosis/start'))
    )
    recordAssertion(
      report,
      'diagnose answer request captured',
      report.requests.some(req => String(req.url).includes('diagnose-http/diagnosis/answer'))
    )
    recordAssertion(
      report,
      'pest request carries injected image and pest profile',
      report.requests.some(
        req =>
          String(req.url).includes('diagnose-http/diagnosis/start') &&
          req.data?.diagnosisProfile === 'pest' &&
          Array.isArray(req.data?.images) &&
          req.data.images.length === 1
      )
    )
    recordAssertion(
      report,
      'retake authorize request captured after explicit confirmation',
      report.requests.some(req =>
        String(req.url).includes('diagnose-http/diagnosis/retake/authorize')
      )
    )
    recordAssertion(
      report,
      'retake skip request captured as server action',
      report.requests.some(req => String(req.url).includes('diagnose-http/diagnosis/retake/skip'))
    )
    recordAssertion(
      report,
      'risk and three-minute cutoff share the confirmation action',
      report.modals.some(modal => {
        const content = String(modal?.content || '')
        return (
          content.includes('虫体可能受惊移动') &&
          content.includes('避免折断叶片') &&
          content.includes('3 分钟内')
        )
      })
    )
    const screenshotEvidence = requiredScreenshotCheckpointEvidence(report)
    recordAssertion(
      report,
      'policy-external final runtime state does not invoke screenshot worker',
      screenshotEvidence.noPolicyExternalWorker,
      screenshotEvidence.detail
    )
    recordAssertion(
      report,
      'required runtime screenshot captured',
      screenshotEvidence.passed,
      screenshotEvidence.detail
    )
    report.not_verified.push(
      {
        item: 'real vision model/provider output',
        reason: fixtureEnabled
          ? 'deterministic fixture responses were used'
          : 'judge from captured backend response'
      },
      {
        item: 'natural three-minute retake wait',
        reason: 'terminal timeout state is fixture-injected; script does not wait three minutes'
      }
    )
    report.status = report.failures.length ? 'failed' : 'passed'
  } catch (error) {
    recordAssertion(
      report,
      'runtime scenario completed without transport error',
      false,
      String(error?.message || error)
    )
    report.status = 'failed'
  } finally {
    try {
      await runAutomatorStep(report, 'runtime.restoreHarness', () => restoreHarness(miniProgram))
    } catch (error) {
      report.not_verified.push({
        item: 'runtime harness restoration',
        reason: String(error?.message || error)
      })
    }
    try {
      await disconnectFormalLeaf({ mp: miniProgram }).catch(() => {})
    } catch {
      // Cleanup evidence is already retained in the report when disconnect rejects.
    }
    report.endedAt = new Date().toISOString()
    const reportPath = path.resolve(artifactDir, 'pest-mode-and-retake-runtime-report.json')
    report.evidence_paths.push(reportPath)
    report.report_path = reportPath
    writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  }
  return report
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runPestModeAndRetakeScenario()
    .then(result => {
      console.log(JSON.stringify(result, null, 2))
      if (result.failures?.length) {
        process.exitCode = 1
      }
    })
    .catch(error => {
      console.error(error.message || error)
      process.exit(1)
    })
}
