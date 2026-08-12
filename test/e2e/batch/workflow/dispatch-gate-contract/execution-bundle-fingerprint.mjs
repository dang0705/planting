import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { executionBundleFingerprint } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/execution-bundle.mjs'
import { catalogExecutionBundleFingerprint } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/catalog.mjs'
import { createQaRunCommands } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run.mjs'
import { previousFrozenBundleAttemptGate } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-run-bundle-integrity.mjs'
import { buildWorktreeScopeReport } from '../../../../../.codex/skills/dispatch-task/scripts/lib/implementation-postflight-checks.mjs'
import { repoRoot } from './helpers.mjs'

const fixtureRoot = fs.mkdtempSync(
  path.join(repoRoot, '.tmp', 'dispatch-task', 'execution-bundle-contract-')
)
const leaf = path.join(fixtureRoot, 'leaf.mjs')
const direct = path.join(fixtureRoot, 'helpers', 'direct.mjs')
const nested = path.join(fixtureRoot, 'helpers', 'nested.mjs')
const dispatchRunId = `execution-bundle-mutation-${Date.now()}`
const executionId = `bundle-mutation-${Date.now()}`
const artifactScopeRunId = `main-qa-artifact-scope-${Date.now()}`
const artifactScopeBaseline = path.join(
  repoRoot,
  '.tmp',
  'dispatch-task',
  `${artifactScopeRunId}-baseline.json`
)
const mainQaArtifact = path.join(repoRoot, '.e2e-artifacts', `${artifactScopeRunId}.json`)
const ordinaryUndeclaredFile = path.join(
  repoRoot,
  'test',
  'e2e',
  'batch',
  'workflow',
  'dispatch-gate-contract',
  `${artifactScopeRunId}.mjs`
)

try {
  fs.mkdirSync(path.dirname(direct), { recursive: true })
  fs.writeFileSync(
    leaf,
    [
      "import fs from 'node:fs'",
      "import automator from 'miniprogram-automator'",
      'const ignored = "import \'./not-a-dependency.mjs\'"',
      "// import './also-not-a-dependency.mjs'",
      "import { direct } from './helpers/direct.mjs'",
      'export { direct }'
    ].join('\n')
  )
  fs.writeFileSync(direct, "export { nested as direct } from './nested.mjs'\n")
  fs.writeFileSync(nested, "export const nested = 'before-mutation'\n")

  const initial = executionBundleFingerprint(leaf, { rootDir: fixtureRoot })
  assert.deepEqual(initial.files, ['helpers/direct.mjs', 'helpers/nested.mjs', 'leaf.mjs'])
  assert.equal(
    initial.files.some(file => file.includes('node:fs')),
    false
  )
  assert.equal(
    initial.files.some(file => file.includes('miniprogram-automator')),
    false
  )

  fs.writeFileSync(nested, "export const nested = 'after-mutation'\n")
  const changed = executionBundleFingerprint(leaf, { rootDir: fixtureRoot })
  assert.notEqual(changed.hash, initial.hash)
  assert.deepEqual(changed.files, initial.files)

  const missingImport = path.join(fixtureRoot, 'missing-import.mjs')
  fs.writeFileSync(missingImport, "import './does-not-exist.mjs'\n")
  assert.throws(
    () => executionBundleFingerprint(missingImport, { rootDir: fixtureRoot }),
    /cannot resolve relative static ESM import/
  )

  const escapingImport = path.join(fixtureRoot, 'escaping-import.mjs')
  fs.writeFileSync(escapingImport, "import '../outside-the-fixture.mjs'\n")
  assert.throws(
    () => executionBundleFingerprint(escapingImport, { rootDir: fixtureRoot }),
    /escapes root/
  )

  const cycleA = path.join(fixtureRoot, 'cycle-a.mjs')
  const cycleB = path.join(fixtureRoot, 'cycle-b.mjs')
  fs.writeFileSync(cycleA, "import './cycle-b.mjs'\n")
  fs.writeFileSync(cycleB, "import './cycle-a.mjs'\n")
  assert.throws(
    () => executionBundleFingerprint(cycleA, { rootDir: fixtureRoot }),
    /circular relative static ESM import/
  )

  const airEnvironment = executionBundleFingerprint(
    path.join(repoRoot, 'test/e2e/automator/diagnosis/air-environment-v2-question-packages.mjs')
  )
  assert.ok(
    airEnvironment.files.includes('test/e2e/automator/diagnosis/_shared/home-entry-readiness.mjs')
  )
  assert.ok(
    airEnvironment.files.includes(
      'test/e2e/automator/care/watering/transpiration-v3/_shared/lib/automator-client.mjs'
    )
  )

  const leafScript = path.relative(repoRoot, leaf).replaceAll(path.sep, '/')
  const entry = {
    id: 'synthetic.execution_bundle_mutation',
    leaf_script: leafScript,
    script_sha256: catalogExecutionBundleFingerprint(leaf, { entry: {} }).hash,
    category_path: ['diagnosis', 'execution-bundle-mutation'],
    id_policy: { refs: [] },
    requirements: {}
  }
  const values = {
    'catalog-id': entry.id,
    'execution-id': executionId,
    'dispatch-run-id': dispatchRunId,
    'execution-timeout-ms': '1000'
  }
  const args = [
    '--allow-live',
    '--catalog-id',
    entry.id,
    '--execution-id',
    executionId,
    '--dispatch-run-id',
    dispatchRunId,
    '--execution-timeout-ms',
    '1000'
  ]
  const emitted = []
  const commands = createQaRunCommands({
    args,
    argValue: name => values[name] || '',
    hasFlag: flag => args.includes(`--${flag}`),
    emit: (value, code = 0) => {
      emitted.push({ value, code })
      return code
    },
    catalogReader: () => ({ entries: [entry] }),
    catalogValidator: () => ({ status: 'passed', errors: [] }),
    preflightRunner: async () => ({ status: 'passed' }),
    leafRunner: async () => {
      fs.writeFileSync(nested, "export const nested = 'mutated-during-run'\n")
      return {
        status: 'completed',
        exit_code: 0,
        signal: null,
        leaf_pid: 73901,
        execution_timeout_ms: 1000,
        stdout: '',
        stderr: ''
      }
    }
  })
  await commands.qaRun()
  const record = emitted.at(-1).value
  assert.equal(record.status, 'failed_script')
  assert.equal(record.terminal_reason, 'frozen_execution_bundle_changed_during_execution')
  assert.equal(record.live_attempt_consumed, false)
  assert.notEqual(record.script_sha256, record.observed_script_sha256_after_run)
  assert.ok(record.execution_bundle_files.includes(leafScript))
  assert.ok(record.observed_execution_bundle_files_after_run.includes(leafScript))

  fs.writeFileSync(nested, "export const nested = 'after-mutation'\n")
  const lifecycleExecutionId = `${executionId}-terminal`
  const lifecycleArgs = args.map(value => (value === executionId ? lifecycleExecutionId : value))
  const lifecycleValues = { ...values, 'execution-id': lifecycleExecutionId }
  const lifecycleEmitted = []
  const lifecycleCommands = createQaRunCommands({
    args: lifecycleArgs,
    argValue: name => lifecycleValues[name] || '',
    hasFlag: flag => lifecycleArgs.includes(`--${flag}`),
    emit: (value, code = 0) => {
      lifecycleEmitted.push({ value, code })
      return code
    },
    catalogReader: () => ({ entries: [entry] }),
    catalogValidator: () => ({ status: 'passed', errors: [] }),
    preflightRunner: async () => ({ status: 'passed' }),
    leafRunner: async ({ onTerminal }) => {
      onTerminal({ status: 'failed_environment', terminal_reason: 'synthetic lifecycle terminal' })
      fs.writeFileSync(nested, "export const nested = 'mutated-after-terminal'\n")
      return { status: 'completed', exit_code: 1, signal: null, stdout: '', stderr: '' }
    }
  })
  await lifecycleCommands.qaRun()
  const lifecycleRecord = lifecycleEmitted.at(-1).value
  assert.equal(lifecycleRecord.status, 'failed_script')
  assert.equal(lifecycleRecord.terminal_reason, 'frozen_execution_bundle_changed_during_execution')
  assert.equal(lifecycleRecord.live_attempt_consumed, false)
  assert.deepEqual(
    previousFrozenBundleAttemptGate({
      records: [record, lifecycleRecord],
      catalogId: entry.id,
      scriptHash: entry.script_sha256
    }),
    { blocked: false, attempts: 0 }
  )

  const artifactScopeHandoff = {
    dispatch_run_id: artifactScopeRunId,
    allowed_paths: ['test/**'],
    forbidden_paths: ['src/**'],
    validation: { worktree_baseline_path: artifactScopeBaseline }
  }
  const captureBaseline = path.join(
    repoRoot,
    '.codex',
    'skills',
    'dispatch-task',
    'scripts',
    'capture-worktree-baseline.mjs'
  )
  const baselineCapture = spawnSync(process.execPath, [captureBaseline, artifactScopeBaseline], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  assert.equal(baselineCapture.status, 0, baselineCapture.stderr || baselineCapture.stdout)
  const baseline = JSON.parse(fs.readFileSync(artifactScopeBaseline, 'utf8'))
  fs.mkdirSync(path.dirname(mainQaArtifact), { recursive: true })
  fs.writeFileSync(mainQaArtifact, JSON.stringify({ source: 'main-owned QA evidence' }))
  const artifactRelativePath = path.relative(repoRoot, mainQaArtifact).replaceAll(path.sep, '/')
  const artifactStatus = spawnSync(
    'git',
    ['status', '--porcelain=v1', '--untracked-files=all', '--', artifactRelativePath],
    { cwd: repoRoot, encoding: 'utf8' }
  )
  assert.equal(artifactStatus.status, 0, artifactStatus.stderr)
  assert.match(artifactStatus.stdout, /\.e2e-artifacts\//)
  const artifactOnlyReport = buildWorktreeScopeReport({
    handoff: artifactScopeHandoff,
    result: { changed_files: [] },
    baseline,
    baselineFile: artifactScopeBaseline
  })
  assert.equal(artifactOnlyReport.status, 'passed')
  assert.equal(artifactOnlyReport.current_dirty_files.includes(artifactRelativePath), false)

  fs.writeFileSync(ordinaryUndeclaredFile, 'export const ordinaryUndeclared = true\n')
  const ordinaryRelativePath = path
    .relative(repoRoot, ordinaryUndeclaredFile)
    .replaceAll(path.sep, '/')
  const ordinaryReport = buildWorktreeScopeReport({
    handoff: artifactScopeHandoff,
    result: { changed_files: [] },
    baseline,
    baselineFile: artifactScopeBaseline
  })
  assert.equal(ordinaryReport.status, 'blocked')
  assert.ok(ordinaryReport.undeclared_actual_changed_files.includes(ordinaryRelativePath))
  assert.ok(
    ordinaryReport.errors.some(error => error.includes('actual changed files not declared'))
  )
} finally {
  fs.rmSync(fixtureRoot, { recursive: true, force: true })
  fs.rmSync(path.join(repoRoot, '.tmp', 'dispatch-task', dispatchRunId), {
    recursive: true,
    force: true
  })
  fs.rmSync(mainQaArtifact, { force: true })
  fs.rmSync(ordinaryUndeclaredFile, { force: true })
  fs.rmSync(artifactScopeBaseline, { force: true })
}
