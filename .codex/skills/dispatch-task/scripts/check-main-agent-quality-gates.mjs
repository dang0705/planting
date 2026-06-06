#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WARNING_LINE_THRESHOLD = 400
const BLOCKING_LINE_THRESHOLD = 500

function parseArgs(argv = []) {
  const args = {
    mode: 'files',
    files: []
  }

  for (const arg of argv) {
    if (arg === '--changed') {
      args.mode = 'changed'
      continue
    }
    if (arg.startsWith('--files=')) {
      args.files = arg
        .slice('--files='.length)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean)
    }
  }

  return args
}

function gitLines(args = []) {
  return execFileSync('git', args, { encoding: 'utf8' })
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
}

function resolveChangedFiles() {
  const tracked = gitLines(['diff', '--name-only', '--diff-filter=ACMRTUXB', 'HEAD', '--'])
  const untracked = gitLines(['ls-files', '--others', '--exclude-standard'])
  return Array.from(new Set([...tracked, ...untracked]))
}

function countLines(filePath = '') {
  const absolutePath = resolve(process.cwd(), filePath)
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return null
  }
  const content = readFileSync(absolutePath, 'utf8')
  if (!content) {return 0}
  return content.split(/\r?\n/).length
}

function buildFinding(filePath = '') {
  const lineCount = countLines(filePath)
  if (lineCount === null) {
    return {
      file: filePath,
      status: 'not_found_or_not_file',
      lineCount: null,
      severity: 'skip'
    }
  }
  if (lineCount > BLOCKING_LINE_THRESHOLD) {
    return {
      file: filePath,
      status: 'fail',
      lineCount,
      severity: 'blocking',
      reason: `line_count_gt_${BLOCKING_LINE_THRESHOLD}_requires_module_split`
    }
  }
  if (lineCount > WARNING_LINE_THRESHOLD) {
    return {
      file: filePath,
      status: 'warn',
      lineCount,
      severity: 'warning',
      reason: `line_count_gt_${WARNING_LINE_THRESHOLD}_requires_explicit_warning`
    }
  }
  return {
    file: filePath,
    status: 'pass',
    lineCount,
    severity: 'none'
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const files = args.mode === 'changed' ? resolveChangedFiles() : args.files

  const findings = files.map(buildFinding)
  const blockingFindings = findings.filter(item => item.severity === 'blocking')
  const warningFindings = findings.filter(item => item.severity === 'warning')
  const missingInput = args.mode === 'files' && files.length === 0
  const receipt = {
    gate: 'main_agent_quality_gates.file_size',
    status: missingInput || blockingFindings.length ? 'fail' : 'pass',
    mode: args.mode,
    thresholds: {
      warningLineThreshold: WARNING_LINE_THRESHOLD,
      blockingLineThreshold: BLOCKING_LINE_THRESHOLD
    },
    checkedFiles: files,
    findings,
    warningCount: warningFindings.length,
    blockingCount: blockingFindings.length,
    continueAllowed: !missingInput && blockingFindings.length === 0,
    blockingReason: missingInput
      ? 'missing_file_scope_for_main_agent_quality_gate'
      : (blockingFindings.length ? 'file_size_gate_failed' : '')
  }

  console.log(JSON.stringify(receipt, null, 2))
  process.exit(receipt.continueAllowed ? 0 : 1)
}

main()
