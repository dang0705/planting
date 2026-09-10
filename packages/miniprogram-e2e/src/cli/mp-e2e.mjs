#!/usr/bin/env node
import os from 'node:os'
import path from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { validateArtifact, snapshotArtifact } from '../core/artifact.mjs'
import { readSuite } from '../core/suite.mjs'
import { runSuite } from '../core/runner.mjs'
import { defineProjectAdapter } from '../contracts/index.mjs'

const [command = 'help', ...args] = process.argv.slice(2)
const options = parseArgs(args)

async function main() {
  if (command === 'validate') {
    const artifact = await validateArtifact(required('artifact'))
    print({ status: 'passed', artifact })
    return
  }
  if (command === 'snapshot') {
    print({ status: 'passed', snapshot: await snapshotArtifact(required('artifact')) })
    return
  }
  if (command === 'doctor') {
    const adapter = await loadAdapter(required('adapter'))
    const result = adapter.doctor ? await adapter.doctor({ options }) : { status: 'passed', code: 'mp_e2e_no_adapter_doctor' }
    print(result)
    process.exitCode = result?.status === 'passed' ? 0 : 1
    return
  }
  if (command === 'run') {
    const adapter = await loadAdapter(required('adapter'))
    const artifactPath = required('artifact')
    const suitePath = required('suite')
    await readSuite(suitePath)
    const evidenceDir = options['evidence-dir']
      ? path.resolve(options['evidence-dir'])
      : await mkdtemp(path.join(os.tmpdir(), 'mp-e2e-'))
    const report = await runSuite({
      artifactPath,
      suitePath,
      adapter,
      evidenceDir,
      leafId: options.leaf,
      dataMode: validatedDataMode(options['data-mode'] || 'live_real'),
      options
    })
    print(options.verbose === 'true' ? report : runSummary(report))
    process.exitCode = report.outcome === 'passed' ? 0 : 1
    return
  }
  if (command === 'pack-check') {
    const forbidden = ['@dcloudio', 'uni-app', 'taro', 'vue', 'cloudbase']
    const packageJson = await import('../../package.json', { with: { type: 'json' } })
    const dependencies = Object.keys(packageJson.default.dependencies || {})
    const leaks = dependencies.filter(name => forbidden.some(term => name.toLowerCase().includes(term)))
    print({ status: leaks.length ? 'failed' : 'passed', leaks, runtimeDependencies: dependencies })
    process.exitCode = leaks.length ? 1 : 0
    return
  }
  print({
    status: 'usage',
    commands: [
      'mp-e2e validate --artifact <artifact>',
      'mp-e2e snapshot --artifact <artifact>',
      'mp-e2e doctor --adapter <adapter.mjs>',
      'mp-e2e run --artifact <artifact> --suite <suite.json> --adapter <adapter.mjs> [--leaf <id>] [--data-mode live_real|fixture_diagnostic|all]',
      'mp-e2e pack-check'
    ]
  })
}

function parseArgs(values) {
  const parsed = {}
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index]
    if (!value.startsWith('--')) {continue}
    const [key, inline] = value.slice(2).split('=', 2)
    parsed[key] = inline ?? values[index + 1]
    if (inline === undefined) {index += 1}
  }
  return parsed
}

function required(name) {
  const value = String(options[name] || '').trim()
  if (!value) {throw new Error(`--${name} is required`)}
  return value
}

function validatedDataMode(value) {
  if (['live_real', 'fixture_diagnostic', 'all'].includes(value)) {return value}
  const error = new Error('--data-mode must be live_real, fixture_diagnostic, or all')
  error.code = 'mp_e2e_contract_invalid'
  throw error
}

async function loadAdapter(file) {
  const imported = await import(pathToFileURL(path.resolve(file)).href)
  return defineProjectAdapter(imported.default || imported.adapter)
}

function print(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`)
}

function runSummary(report) {
  return {
    outcome: report.outcome,
    infrastructureStatus: report.infrastructureStatus,
    fixtureStatus: report.fixtureStatus,
    businessStatus: report.businessStatus,
    failureKind: report.failureKind,
    reportPath: report.reportPath,
    leaves: report.leaves.map(leaf => ({ id: leaf.id, status: leaf.status })),
    failures: report.failures
  }
}

main().catch(error => {
  print({ status: 'failed', code: error?.code || 'mp_e2e_cli_error', message: error?.message || String(error) })
  process.exitCode = 1
})
