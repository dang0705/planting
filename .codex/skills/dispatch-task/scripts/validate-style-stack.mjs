#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const [handoffFile, baselineFile, resultFile] = process.argv.slice(2)
if (!handoffFile || !baselineFile) {
  console.error(
    'usage: validate-style-stack.mjs <handoff.json> <worktree-baseline.json> [implementer-or-external-result.json]'
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
const styling = String(handoff?.project_constraints?.styling_system ?? '').toLowerCase()
const scssPolicy = String(handoff?.project_constraints?.new_scss_policy ?? '').toLowerCase()
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
const baselineSet = new Set((baseline.status_files ?? []).map(normalize))
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
const changedSinceBaseline = current.filter(file => !baselineSet.has(file))
const declared = new Set((result.changed_files ?? []).map(normalize))
const errors = []
const warnings = []
const expectedBaselinePath = normalize(handoff?.validation?.worktree_baseline_path ?? '')
if (expectedBaselinePath && path.resolve(expectedBaselinePath) !== path.resolve(baselineFile)) {
  errors.push(`baseline file path mismatch: expected ${expectedBaselinePath}, got ${baselineFile}`)
}
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
const report = {
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
console.log(JSON.stringify(report, null, 2))
if (errors.length) {
  process.exit(1)
}
