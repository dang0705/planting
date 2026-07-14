#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const [handoffFile, baselineFile, resultFile] = process.argv.slice(2)
if (!handoffFile || !baselineFile) {
  console.error(
    'usage: validate-no-new-deps.mjs <handoff.json> <worktree-baseline.json> [implementer-or-external-result.json]'
  )
  process.exit(2)
}
if (process.env.DISPATCH_POSTFLIGHT_INTERNAL !== '1') {
  console.error(
    'deprecated: prefer validate-implementation-postflight.mjs (single postflight report)'
  )
}
const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2))
    process.exit(2)
  }
}
const handoff = readJson(handoffFile)
const baseline = readJson(baselineFile)
const result = resultFile ? readJson(resultFile) : {}
const policy = String(handoff?.project_constraints?.dependency_policy ?? '').toLowerCase()
const dependencyPolicyForbidsNewDeps =
  /no[_ -]?new[_ -]?dependenc|no new dependenc|禁止.*依赖|不得.*依赖|不允许.*依赖/.test(policy)
const normalize = file =>
  String(file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
const splitStatusPaths = rawPath => {
  const raw = String(rawPath ?? '').trim()
  if (raw.includes(' -> ')) {
    return raw.split(' -> ').map(normalize).filter(Boolean)
  }
  return [normalize(raw)].filter(Boolean)
}
const parseStatus = text =>
  text
    .split('\n')
    .filter(Boolean)
    .flatMap(line => splitStatusPaths(line.slice(3)))
    .filter(Boolean)
const ignoredStatusFile = file =>
  file === '.tmp' ||
  file.startsWith('.tmp/') ||
  file === '.codex/tmp' ||
  file.startsWith('.codex/tmp/')
const current = [
  ...new Set(
    parseStatus(
      execFileSync('git', ['status', '--short', '--untracked-files=all'], { encoding: 'utf8' })
    )
  )
].filter(file => !ignoredStatusFile(file))
const baselineSet = new Set((baseline.status_files ?? []).map(normalize))
const changedSinceBaseline = current.filter(file => !baselineSet.has(file))
const declared = new Set((result.changed_files ?? []).map(normalize))
const depPattern =
  /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/
const depFiles = changedSinceBaseline.filter(file => depPattern.test(file))
const declaredPreexistingDeps = (result.changed_files ?? [])
  .map(normalize)
  .filter(file => baselineSet.has(file) && depPattern.test(file))
const errors = []
const warnings = []
const expectedBaselinePath = normalize(handoff?.validation?.worktree_baseline_path ?? '')
if (expectedBaselinePath && path.resolve(expectedBaselinePath) !== path.resolve(baselineFile)) {
  errors.push(`baseline file path mismatch: expected ${expectedBaselinePath}, got ${baselineFile}`)
}
if (dependencyPolicyForbidsNewDeps && depFiles.length) {
  errors.push(`dependency files changed since baseline: ${depFiles.join(', ')}`)
}
if (
  dependencyPolicyForbidsNewDeps &&
  declaredPreexistingDeps.length &&
  handoff?.validation?.allow_preexisting_dirty_overlap !== true
) {
  errors.push(
    `dependency files were already dirty at baseline and declared changed; cannot prove no new deps: ${declaredPreexistingDeps.join(', ')}`
  )
}
for (const file of depFiles) {
  if (!declared.has(file))
    {errors.push(`dependency file changed but not declared in result.changed_files: ${file}`)}
}
const report = {
  status: errors.length ? 'blocked' : 'passed',
  gate: 'no_new_deps',
  dispatch_run_id: handoff.dispatch_run_id,
  baseline_file: baselineFile,
  dependency_policy: handoff?.project_constraints?.dependency_policy ?? null,
  changed_files_since_baseline: changedSinceBaseline,
  changed_dependency_files_since_baseline: depFiles,
  declared_preexisting_dependency_overlap: declaredPreexistingDeps,
  warnings,
  errors
}
console.log(JSON.stringify(report, null, 2))
if (errors.length) {process.exit(1)}
