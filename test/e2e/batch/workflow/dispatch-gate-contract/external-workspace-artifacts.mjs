import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { buildWorktreeScopeReport } from '../../../../../.codex/skills/dispatch-task/scripts/lib/implementation-postflight-checks.mjs'
import { repoRoot } from './helpers.mjs'

const runId = `external-workspace-artifacts-${Date.now()}`
const baselineFile = path.join(repoRoot, '.tmp', 'dispatch-task', `${runId}-baseline.json`)
const dotAdded = `.reasonix-contract-added-${runId}`
const dotDisappeared = `.reasonix-contract-disappeared-${runId}`
const pluginModified = `reasonix-plugin-batch-contract-${runId}`
const ordinaryFile = `ordinary-workspace-artifact-contract-${runId}.json`
const captureBaseline = path.join(
  repoRoot,
  '.codex',
  'skills',
  'dispatch-task',
  'scripts',
  'capture-worktree-baseline.mjs'
)

const remove = relativePath =>
  fs.rmSync(path.join(repoRoot, relativePath), { recursive: true, force: true })

const capture = () => {
  const captured = spawnSync(process.execPath, [captureBaseline, baselineFile], {
    cwd: repoRoot,
    encoding: 'utf8'
  })
  assert.equal(captured.status, 0, captured.stderr || captured.stdout)
  return JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
}

const declaration = pathPattern => ({
  path_pattern: pathPattern,
  owner: 'external_reasonix_tool',
  evidence: 'synthetic explicit external-tool ownership for contract coverage'
})

const handoff = declarations => ({
  dispatch_run_id: runId,
  allowed_paths: ['.codex/**'],
  forbidden_paths: ['src/**', 'cloudfunctions/**', 'package.json', 'test/**'],
  validation: {
    worktree_baseline_path: baselineFile,
    external_workspace_artifacts: declarations
  }
})

const report = (baseline, declarations, changedFiles = []) =>
  buildWorktreeScopeReport({
    handoff: handoff(declarations),
    result: { changed_files: changedFiles },
    baseline,
    baselineFile
  })

try {
  const addedFile = `${dotAdded}/record.json`
  let baseline = capture()
  fs.mkdirSync(path.join(repoRoot, dotAdded), { recursive: true })
  fs.writeFileSync(path.join(repoRoot, addedFile), '{"state":"added"}\n')
  let scope = report(baseline, [declaration(`${dotAdded}/**`)])
  assert.equal(scope.status, 'passed')
  assert.deepEqual(scope.undeclared_actual_changed_files, [])
  assert.deepEqual(scope.external_workspace_artifacts.declarations[0].added_since_baseline, [
    addedFile
  ])
  assert.deepEqual(scope.external_workspace_artifacts.excluded_paths, [addedFile])
  remove(dotAdded)

  const modifiedFile = `${pluginModified}/record.json`
  fs.mkdirSync(path.join(repoRoot, pluginModified), { recursive: true })
  fs.writeFileSync(path.join(repoRoot, modifiedFile), '{"state":"before"}\n')
  baseline = capture()
  fs.writeFileSync(path.join(repoRoot, modifiedFile), '{"state":"after"}\n')
  scope = report(baseline, [declaration(`${pluginModified}/**`)])
  assert.equal(scope.status, 'passed')
  assert.deepEqual(scope.external_workspace_artifacts.declarations[0].modified_since_baseline, [
    modifiedFile
  ])
  remove(pluginModified)

  const disappearedFile = `${dotDisappeared}/record.json`
  fs.mkdirSync(path.join(repoRoot, dotDisappeared), { recursive: true })
  fs.writeFileSync(path.join(repoRoot, disappearedFile), '{"state":"before"}\n')
  baseline = capture()
  remove(dotDisappeared)
  scope = report(baseline, [declaration(`${dotDisappeared}/**`)])
  assert.equal(scope.status, 'passed')
  assert.deepEqual(scope.external_workspace_artifacts.declarations[0].disappeared_since_baseline, [
    disappearedFile
  ])

  baseline = capture()
  fs.writeFileSync(path.join(repoRoot, ordinaryFile), '{"state":"ordinary"}\n')
  scope = report(baseline, [declaration('.reasonix*/**')])
  assert.equal(scope.status, 'blocked')
  assert.ok(scope.undeclared_actual_changed_files.includes(ordinaryFile))
  assert.ok(scope.errors.some(error => error.includes('actual changed file outside allowed_paths')))
  remove(ordinaryFile)

  baseline = capture()
  fs.mkdirSync(path.join(repoRoot, dotAdded), { recursive: true })
  fs.writeFileSync(path.join(repoRoot, addedFile), '{"state":"declared"}\n')
  scope = report(baseline, [declaration(`${dotAdded}/**`)], [addedFile])
  assert.equal(scope.status, 'blocked')
  assert.ok(
    scope.errors.includes(
      `result.changed_files must not declare external workspace artifact: ${addedFile}`
    )
  )
  remove(dotAdded)

  baseline = capture()
  scope = report(baseline, [declaration('scripts/export-codex-memories.sh')])
  assert.equal(scope.status, 'blocked')
  assert.ok(
    scope.errors.includes(
      'external_workspace_artifacts[0] uses an unapproved path_pattern: scripts/export-codex-memories.sh'
    )
  )
  scope = report(baseline, [declaration('**')])
  assert.equal(scope.status, 'blocked')
  assert.ok(
    scope.errors.includes('external_workspace_artifacts[0] uses an unapproved path_pattern: **')
  )
  scope = report(baseline, [declaration('src/**')])
  assert.equal(scope.status, 'blocked')
  assert.ok(
    scope.errors.includes('external_workspace_artifacts[0] uses an unapproved path_pattern: src/**')
  )
} finally {
  remove(dotAdded)
  remove(dotDisappeared)
  remove(pluginModified)
  remove(ordinaryFile)
  remove(path.relative(repoRoot, baselineFile))
}
