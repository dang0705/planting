import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import {
  canonicalizeLegacyQuotedBaseline,
  normalizeGitPath,
  parsePorcelainV1Z
} from './git-status.mjs'

const normalize = normalizeGitPath

const ignoredStatusFile = file =>
  file === '.tmp' ||
  file.startsWith('.tmp/') ||
  file === '.codex/tmp' ||
  file.startsWith('.codex/tmp/')

const uniqueSorted = items => [...new Set(items.map(normalize).filter(Boolean))].sort()

const sha256 = textOrBuffer => crypto.createHash('sha256').update(textOrBuffer).digest('hex')

const runGit = args => execFileSync('git', args, { encoding: 'utf8' }).replace(/\n$/, '')

const safeGit = args => {
  try {
    return runGit(args)
  } catch {
    return ''
  }
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

const currentStatusEntries = () =>
  parsePorcelainV1Z(
    execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  )

const currentStatusFiles = () =>
  uniqueSorted(currentStatusEntries().map(entry => entry.path)).filter(
    file => !ignoredStatusFile(file)
  )

const currentUnsortedStatusFiles = () =>
  [...new Set(currentStatusEntries().map(entry => entry.path))].filter(
    file => !ignoredStatusFile(file)
  )

const changedSinceBaselineFiles = baseline => {
  const baselineSet = new Set((baseline.status_files ?? []).map(normalize))
  return currentUnsortedStatusFiles().filter(file => !baselineSet.has(file))
}

const PACKAGE_DEPENDENCY_SECTIONS = [
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
  'bundleDependencies',
  'bundledDependencies',
  'overrides',
  'resolutions',
  'packageManager'
]

const readJsonText = text => {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

const dependencySectionsChangedFromHead = file => {
  if (normalize(file) !== 'package.json') {
    return true
  }
  const current = readJsonText(fs.readFileSync('package.json', 'utf8'))
  const head = readJsonText(safeGit(['show', 'HEAD:package.json']))
  if (!current || !head) {
    return true
  }
  return PACKAGE_DEPENDENCY_SECTIONS.some(
    key => JSON.stringify(current[key] ?? null) !== JSON.stringify(head[key] ?? null)
  )
}

export function buildWorktreeScopeReport({ handoff, result, baseline, baselineFile }) {
  const errors = []
  const warnings = []
  const need = (condition, message) => {
    if (!condition) {
      errors.push(message)
    }
  }

  const baselineRepair = canonicalizeLegacyQuotedBaseline(baseline, {
    currentStatusEntries: currentStatusEntries(),
    getFingerprint: fileFingerprint
  })
  baseline = baselineRepair.baseline
  errors.push(...baselineRepair.errors)
  if (baselineRepair.canonicalizations.length) {
    warnings.push(
      `canonicalized legacy Git quoted baseline paths: ${baselineRepair.canonicalizations
        .map(entry => entry.path)
        .join(', ')}`
    )
  }

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
  if (currentHead !== baseline.head && handoff?.validation?.allow_head_change === true) {
    need(
      typeof handoff?.validation?.head_change_reason === 'string' &&
        handoff.validation.head_change_reason.trim().length > 0,
      'validation.head_change_reason is required when validation.allow_head_change=true'
    )
  }

  const currentFiles = currentStatusFiles()
  const baselineFiles = uniqueSorted(baseline.status_files ?? []).filter(
    file => !ignoredStatusFile(file)
  )
  const declaredFiles = uniqueSorted(result.changed_files ?? [])
  const baselineSet = new Set(baselineFiles)
  const currentSet = new Set(currentFiles)
  const declaredSet = new Set(declaredFiles)
  const overlapExplicitlyAllowed = handoff?.validation?.allow_preexisting_dirty_overlap === true
  const changedSinceBaseline = uniqueSorted(currentFiles.filter(file => !baselineSet.has(file)))
  const disappearedSinceBaseline = uniqueSorted(baselineFiles.filter(file => !currentSet.has(file)))
  const declaredPreexistingOverlap = uniqueSorted(
    declaredFiles.filter(file => baselineSet.has(file))
  )

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
    if (!sameFingerprint(before, after)) {
      preexistingDirtyModified.push(file)
    }
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
  const unsafePreexistingOverlap = uniqueSorted(
    [
      ...declaredPreexistingOverlap,
      ...preexistingDirtyModified,
      ...missingBaselineFingerprints,
      ...disappearedSinceBaseline
    ].filter(
      file =>
        !matchesAny(file, handoff.allowed_paths ?? []) ||
        matchesAny(file, handoff.forbidden_paths ?? [])
    )
  )
  if (overlapExplicitlyAllowed && unsafePreexistingOverlap.length) {
    errors.push(
      `preexisting dirty overlap touches forbidden or non-allowed paths: ${unsafePreexistingOverlap.join(', ')}`
    )
  }
  if (overlapExplicitlyAllowed) {
    const ownershipProof = handoff?.validation?.preexisting_dirty_overlap_owners ?? {}
    const overlapNeedingProof = uniqueSorted([
      ...declaredPreexistingOverlap,
      ...preexistingDirtyModified,
      ...disappearedSinceBaseline
    ])
    const missingOwnershipProof = overlapNeedingProof.filter(file => {
      const proof = ownershipProof[file]
      return !(proof && typeof proof === 'object' && String(proof.owner ?? '').trim())
    })
    if (missingOwnershipProof.length) {
      errors.push(
        `preexisting dirty overlap requires contract-level ownership proof per path: ${missingOwnershipProof.join(', ')}`
      )
    }
  }
  if (declaredPreexistingOverlap.length && !overlapExplicitlyAllowed) {
    errors.push(
      `declared changed_files were already dirty at baseline; cannot prove child ownership: ${declaredPreexistingOverlap.join(', ')}`
    )
  }
  if (preexistingDirtyModified.length && !overlapExplicitlyAllowed) {
    errors.push(
      `preexisting dirty files changed after baseline; cannot prove user changes were preserved: ${preexistingDirtyModified.join(', ')}`
    )
  }
  if (missingBaselineFingerprints.length && !overlapExplicitlyAllowed) {
    errors.push(
      `baseline dirty files have no fingerprints; cannot prove preservation: ${missingBaselineFingerprints.join(', ')}`
    )
  }
  if (disappearedSinceBaseline.length && !overlapExplicitlyAllowed) {
    errors.push(
      `baseline dirty files disappeared; possible restore/delete of user changes: ${disappearedSinceBaseline.join(', ')}`
    )
  }
  if (disappearedSinceBaseline.length && overlapExplicitlyAllowed) {
    warnings.push(
      `baseline dirty files disappeared under explicit overlap allowance: ${disappearedSinceBaseline.join(', ')}`
    )
  }

  return {
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
    preexisting_dirty_overlap_explicitly_allowed: overlapExplicitlyAllowed,
    unsafe_preexisting_overlap: unsafePreexistingOverlap,
    preexisting_dirty_modified_since_baseline: preexistingDirtyModified,
    missing_baseline_fingerprints: missingBaselineFingerprints,
    disappeared_since_baseline: disappearedSinceBaseline,
    head_changed: currentHead !== baseline.head,
    head_change_reason: handoff?.validation?.head_change_reason ?? null,
    baseline_path_canonicalizations: baselineRepair.canonicalizations,
    warnings,
    errors
  }
}

export function buildNoNewDepsReport({ handoff, result, baseline, baselineFile }) {
  const policy = String(handoff?.project_constraints?.dependency_policy ?? '').toLowerCase()
  const dependencyPolicyForbidsNewDeps =
    /no[_ -]?new[_ -]?dependenc|no new dependenc|禁止.*依赖|不得.*依赖|不允许.*依赖/.test(policy)
  const errors = []
  const warnings = []
  const expectedBaselinePath = normalize(handoff?.validation?.worktree_baseline_path ?? '')
  if (expectedBaselinePath && path.resolve(expectedBaselinePath) !== path.resolve(baselineFile)) {
    errors.push(
      `baseline file path mismatch: expected ${expectedBaselinePath}, got ${baselineFile}`
    )
  }
  const changedSinceBaseline = changedSinceBaselineFiles(baseline)
  const baselineSet = new Set((baseline.status_files ?? []).map(normalize))
  const declared = new Set((result?.changed_files ?? []).map(normalize))
  const depPattern =
    /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/
  const depFiles = changedSinceBaseline.filter(file => depPattern.test(file))
  const declaredPreexistingDeps = (result?.changed_files ?? [])
    .map(normalize)
    .filter(file => baselineSet.has(file) && depPattern.test(file))
  const dependencyChangedFiles = depFiles.filter(dependencySectionsChangedFromHead)
  const declaredPreexistingDependencyChanges = declaredPreexistingDeps.filter(
    dependencySectionsChangedFromHead
  )
  const packageScriptOnlyChanges = [...new Set([...depFiles, ...declaredPreexistingDeps])].filter(
    file => depPattern.test(file) && !dependencySectionsChangedFromHead(file)
  )
  if (dependencyPolicyForbidsNewDeps && dependencyChangedFiles.length) {
    errors.push(`dependency files changed since baseline: ${dependencyChangedFiles.join(', ')}`)
  }
  if (
    dependencyPolicyForbidsNewDeps &&
    declaredPreexistingDependencyChanges.length &&
    handoff?.validation?.allow_preexisting_dirty_overlap !== true
  ) {
    errors.push(
      `dependency files were already dirty at baseline and declared changed; cannot prove no new deps: ${declaredPreexistingDependencyChanges.join(', ')}`
    )
  }
  if (dependencyPolicyForbidsNewDeps && packageScriptOnlyChanges.length) {
    warnings.push(
      `package dependency sections unchanged; allowed script/config-only package changes: ${packageScriptOnlyChanges.join(', ')}`
    )
  }
  for (const file of depFiles) {
    if (!declared.has(file)) {
      errors.push(`dependency file changed but not declared in result.changed_files: ${file}`)
    }
  }
  return {
    status: errors.length ? 'blocked' : 'passed',
    gate: 'no_new_deps',
    dispatch_run_id: handoff.dispatch_run_id,
    baseline_file: baselineFile,
    dependency_policy: handoff?.project_constraints?.dependency_policy ?? null,
    changed_files_since_baseline: changedSinceBaseline,
    changed_dependency_files_since_baseline: depFiles,
    dependency_section_changed_files: dependencyChangedFiles,
    declared_preexisting_dependency_overlap: declaredPreexistingDeps,
    declared_preexisting_dependency_section_changes: declaredPreexistingDependencyChanges,
    warnings,
    errors
  }
}

export function buildStyleStackReport({ handoff, result, baseline, baselineFile }) {
  const styling = String(handoff?.project_constraints?.styling_system ?? '').toLowerCase()
  const scssPolicy = String(handoff?.project_constraints?.new_scss_policy ?? '').toLowerCase()
  const errors = []
  const warnings = []
  const expectedBaselinePath = normalize(handoff?.validation?.worktree_baseline_path ?? '')
  if (expectedBaselinePath && path.resolve(expectedBaselinePath) !== path.resolve(baselineFile)) {
    errors.push(
      `baseline file path mismatch: expected ${expectedBaselinePath}, got ${baselineFile}`
    )
  }
  const changedSinceBaseline = changedSinceBaselineFiles(baseline)
  const declared = new Set((result?.changed_files ?? []).map(normalize))
  const scssFiles = changedSinceBaseline.filter(file => /\.s[ac]ss$/i.test(file))
  const vueFiles = changedSinceBaseline.filter(file => /\.vue$/i.test(file))
  const vueWithNewScssBlocks = []
  const vueWithNewScopedStyleBlocks = []

  for (const file of vueFiles) {
    if (!fs.existsSync(file)) {
      continue
    }
    let diff = ''
    try {
      diff += execFileSync('git', ['diff', '-U0', '--', file], { encoding: 'utf8' })
      // oxlint-disable-next-line no-empty
    } catch {}
    try {
      diff +=
        '\n' + execFileSync('git', ['diff', '--cached', '-U0', '--', file], { encoding: 'utf8' })
      // oxlint-disable-next-line no-empty
    } catch {}
    if (/^\+.*<style[^>]*lang=["']scss["']/im.test(diff)) {
      vueWithNewScssBlocks.push(file)
    }
    if (/^\+.*<style[^>]*\bscoped\b/im.test(diff)) {
      vueWithNewScopedStyleBlocks.push(file)
    }
  }

  const styleTouched = [
    ...new Set([...scssFiles, ...vueWithNewScssBlocks, ...vueWithNewScopedStyleBlocks])
  ]
  const scssExceptionRef = result?.style_stack_compliance?.scss_exception_ref
  const contractExceptions = handoff?.project_constraints?.scss_exceptions ?? []
  const exceptionAllowed =
    scssPolicy === 'explicit_exception_only' &&
    typeof scssExceptionRef === 'string' &&
    scssExceptionRef.length > 0 &&
    contractExceptions.includes(scssExceptionRef)

  if (styling.includes('tailwind') && scssPolicy === 'forbidden') {
    if (scssFiles.length) {
      errors.push(
        `Tailwind + new_scss_policy=forbidden cannot add/change SCSS files since baseline: ${scssFiles.join(', ')}`
      )
    }
    if (vueWithNewScssBlocks.length) {
      errors.push(
        `Tailwind + new_scss_policy=forbidden cannot add <style lang="scss"> blocks: ${vueWithNewScssBlocks.join(', ')}`
      )
    }
    if (vueWithNewScopedStyleBlocks.length) {
      errors.push(
        `Tailwind + new_scss_policy=forbidden cannot add scoped style blocks: ${vueWithNewScopedStyleBlocks.join(', ')}`
      )
    }
  }
  if (
    styling.includes('tailwind') &&
    scssPolicy === 'explicit_exception_only' &&
    styleTouched.length &&
    !exceptionAllowed
  ) {
    errors.push(
      `Tailwind + new_scss_policy=explicit_exception_only requires style_stack_compliance.scss_exception_ref listed in project_constraints.scss_exceptions for: ${styleTouched.join(', ')}`
    )
  }
  for (const file of styleTouched) {
    if (!declared.has(file)) {
      errors.push(`style-related changed file/block not declared in result.changed_files: ${file}`)
    }
  }
  return {
    status: errors.length ? 'blocked' : 'passed',
    gate: 'style_stack',
    dispatch_run_id: handoff.dispatch_run_id,
    baseline_file: baselineFile,
    styling_system: handoff?.project_constraints?.styling_system ?? null,
    new_scss_policy: handoff?.project_constraints?.new_scss_policy ?? null,
    changed_files_since_baseline: changedSinceBaseline,
    scss_files_since_baseline: scssFiles,
    vue_with_new_scss_blocks: vueWithNewScssBlocks,
    vue_with_new_scoped_style_blocks: vueWithNewScopedStyleBlocks,
    warnings,
    errors
  }
}
