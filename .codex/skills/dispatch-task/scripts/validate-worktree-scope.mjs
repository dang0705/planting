#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'

const [handoffFile, resultFile, baselineFile] = process.argv.slice(2)
if (!handoffFile || !resultFile || !baselineFile) {
  console.error(
    'usage: validate-worktree-scope.mjs <handoff.json> <implementer-or-external-result.json> <worktree-baseline.json>'
  )
  process.exit(2)
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
const result = readJson(resultFile)
const baseline = readJson(baselineFile)
const errors = []
const warnings = []
const need = (condition, message) => {
  if (!condition) {
    errors.push(message)
  }
}
const normalize = file =>
  String(file ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
const sha256 = textOrBuffer => crypto.createHash('sha256').update(textOrBuffer).digest('hex')
const splitStatusPaths = rawPath => {
  const raw = String(rawPath ?? '').trim()
  if (raw.includes(' -> ')) {
    return raw.split(' -> ').map(normalize).filter(Boolean)
  }
  return [normalize(raw)].filter(Boolean)
}
const globToRegExp = pattern => {
  const normalized = normalize(pattern)
  if (normalized.endsWith('/')) {
    return new RegExp(`^${normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')}.*`)
  }
  let source = normalized.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  source = source
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§DOUBLE§§/g, '.*')
  return new RegExp(`^${source}$`)
}
const matchesAny = (file, patterns = []) =>
  patterns.some(pattern => globToRegExp(pattern).test(normalize(file)))
const runGit = args => execFileSync('git', args, { encoding: 'utf8' }).replace(/\n$/, '')
const safeGit = args => {
  try {
    return runGit(args)
  } catch {
    return ''
  }
}
const parseStatus = text =>
  text
    .split('\n')
    .filter(Boolean)
    .flatMap(line => splitStatusPaths(line.slice(3)))
    .filter(Boolean)
    .map(normalize)
const uniqueSorted = items => [...new Set(items.map(normalize).filter(Boolean))].sort()
const ignoredStatusFile = file =>
  file === '.tmp' ||
  file.startsWith('.tmp/') ||
  file === '.codex/tmp' ||
  file.startsWith('.codex/tmp/')
const fileFingerprint = file => {
  const normalized = normalize(file)
  const exists = fs.existsSync(normalized)
  const stat = exists ? fs.statSync(normalized) : null
  const isFile = Boolean(stat?.isFile?.())
  return {
    path: normalized,
    exists,
    is_file: isFile,
    worktree_sha256: isFile ? sha256(fs.readFileSync(normalized)) : null,
    unstaged_diff_sha256: sha256(safeGit(['diff', '--binary', '--', normalized])),
    staged_diff_sha256: sha256(safeGit(['diff', '--cached', '--binary', '--', normalized]))
  }
}
const sameFingerprint = (a, b) =>
  a &&
  b &&
  a.exists === b.exists &&
  a.is_file === b.is_file &&
  a.worktree_sha256 === b.worktree_sha256 &&
  a.unstaged_diff_sha256 === b.unstaged_diff_sha256 &&
  a.staged_diff_sha256 === b.staged_diff_sha256

need(Array.isArray(result.changed_files), 'result.changed_files must be an array')
need(typeof baseline.captured_at === 'string', 'baseline.captured_at is required')
need(Array.isArray(baseline.status_files), 'baseline.status_files must be an array')
need(typeof baseline.git_root === 'string', 'baseline.git_root is required')
need(typeof baseline.head === 'string', 'baseline.head is required')

const expectedBaselinePath = normalize(handoff?.validation?.worktree_baseline_path ?? '')
if (expectedBaselinePath) {
  const actual = path.resolve(baselineFile)
  const expected = path.resolve(expectedBaselinePath)
  need(
    actual === expected,
    `baseline file path mismatch: expected ${expectedBaselinePath}, got ${baselineFile}`
  )
}
const currentGitRoot = runGit(['rev-parse', '--show-toplevel'])
const currentHead = runGit(['rev-parse', 'HEAD'])
need(
  path.resolve(currentGitRoot) === path.resolve(baseline.git_root),
  'current git root must match baseline.git_root'
)
need(
  currentHead === baseline.head || handoff?.validation?.allow_head_change === true,
  'git HEAD changed since baseline; commits/checkouts are not allowed during dispatch without explicit authorization'
)

const currentFiles = uniqueSorted(
  parseStatus(runGit(['status', '--short', '--untracked-files=all']))
).filter(file => !ignoredStatusFile(file))
const baselineFiles = uniqueSorted(baseline.status_files ?? []).filter(
  file => !ignoredStatusFile(file)
)
const declaredFiles = uniqueSorted(result.changed_files ?? [])
const baselineSet = new Set(baselineFiles)
const currentSet = new Set(currentFiles)
const declaredSet = new Set(declaredFiles)
const changedSinceBaseline = uniqueSorted(currentFiles.filter(file => !baselineSet.has(file)))
const disappearedSinceBaseline = uniqueSorted(baselineFiles.filter(file => !currentSet.has(file)))
const declaredPreexistingOverlap = uniqueSorted(declaredFiles.filter(file => baselineSet.has(file)))

const baselineFingerprints = new Map(
  (baseline.dirty_file_fingerprints ?? []).map(entry => [normalize(entry.path), entry])
)
const preexistingDirtyModified = []
const missingBaselineFingerprints = []
for (const file of baselineFiles) {
  const before = baselineFingerprints.get(file)
  if (!before) {
    missingBaselineFingerprints.push(file)
    continue
  }
  const after = fileFingerprint(file)
  if (!sameFingerprint(before, after)) {preexistingDirtyModified.push(file)}
}

for (const file of declaredFiles) {
  if (!matchesAny(file, handoff.allowed_paths ?? [])) {
    errors.push(`declared changed file outside allowed_paths: ${file}`)
  }
  if (matchesAny(file, handoff.forbidden_paths ?? [])) {
    errors.push(`declared changed file matches forbidden_paths: ${file}`)
  }
}
for (const file of changedSinceBaseline) {
  if (!matchesAny(file, handoff.allowed_paths ?? [])) {
    errors.push(`actual changed file outside allowed_paths since baseline: ${file}`)
  }
  if (matchesAny(file, handoff.forbidden_paths ?? [])) {
    errors.push(`actual changed file matches forbidden_paths since baseline: ${file}`)
  }
}

const undeclaredActual = changedSinceBaseline.filter(file => !declaredSet.has(file))
const declaredNotVisible = declaredFiles.filter(file => !currentSet.has(file))
if (undeclaredActual.length) {
  errors.push(
    `actual changed files not declared in result.changed_files: ${undeclaredActual.join(', ')}`
  )
}
if (declaredNotVisible.length) {
  errors.push(
    `declared changed_files not visible in current worktree: ${declaredNotVisible.join(', ')}`
  )
}
if (
  declaredPreexistingOverlap.length &&
  handoff?.validation?.allow_preexisting_dirty_overlap !== true
) {
  errors.push(
    `declared changed_files were already dirty at baseline; cannot prove child ownership: ${declaredPreexistingOverlap.join(', ')}`
  )
}
if (
  preexistingDirtyModified.length &&
  handoff?.validation?.allow_preexisting_dirty_overlap !== true
) {
  errors.push(
    `preexisting dirty files changed after baseline; cannot prove user changes were preserved: ${preexistingDirtyModified.join(', ')}`
  )
}
if (
  missingBaselineFingerprints.length &&
  handoff?.validation?.allow_preexisting_dirty_overlap !== true
) {
  errors.push(
    `baseline dirty files have no fingerprints; cannot prove preservation: ${missingBaselineFingerprints.join(', ')}`
  )
}
if (
  disappearedSinceBaseline.length &&
  handoff?.validation?.allow_preexisting_dirty_overlap !== true
) {
  errors.push(
    `baseline dirty files disappeared; possible restore/delete of user changes: ${disappearedSinceBaseline.join(', ')}`
  )
}
if (
  disappearedSinceBaseline.length &&
  handoff?.validation?.allow_preexisting_dirty_overlap === true
) {
  warnings.push(
    `baseline dirty files disappeared under explicit overlap allowance: ${disappearedSinceBaseline.join(', ')}`
  )
}

const report = {
  status: errors.length ? 'blocked' : 'passed',
  gate: 'worktree_scope',
  dispatch_run_id: handoff.dispatch_run_id,
  baseline_file: baselineFile,
  baseline_dirty_files: baselineFiles,
  current_dirty_files: currentFiles,
  changed_files_since_baseline: changedSinceBaseline,
  declared_changed_files: declaredFiles,
  undeclared_actual_changed_files: undeclaredActual,
  declared_not_visible: declaredNotVisible,
  declared_preexisting_overlap: declaredPreexistingOverlap,
  preexisting_dirty_modified_since_baseline: preexistingDirtyModified,
  missing_baseline_fingerprints: missingBaselineFingerprints,
  disappeared_since_baseline: disappearedSinceBaseline,
  head_changed: currentHead !== baseline.head,
  warnings,
  errors
}

console.log(JSON.stringify(report, null, 2))
if (errors.length) {process.exit(1)}
