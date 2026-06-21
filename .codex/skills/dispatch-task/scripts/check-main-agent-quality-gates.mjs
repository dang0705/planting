#!/usr/bin/env node
import { execFileSync } from 'node:child_process'
import { existsSync, statSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WARNING_LINE_THRESHOLD = 400
const BLOCKING_LINE_THRESHOLD = 500

function parseArgs(argv = []) {
  const args = {
    mode: 'files',
    files: [],
    contractFile: '',
    targetRole: ''
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
      continue
    }
    if (arg.startsWith('--contract=')) {
      args.contractFile = arg.slice('--contract='.length).trim()
      continue
    }
    if (arg.startsWith('--target-role=')) {
      args.targetRole = arg.slice('--target-role='.length).trim()
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


const REQUIRED_DEEP_CONTRACT_MARKERS = [
  'contract_id',
  'contract_lock_level',
  'strict',
  'allowed_paths',
  'read_only_reference_paths',
  'forbidden_paths',
  'technical_decisions_locked',
  'implementation_strategy_locked',
  'dependency_policy_locked',
  'target_anchors',
  'pseudocode_by_anchor',
  'stop_conditions',
  'contract_compliance_matrix'
]

function checkImplementationContract(contractFile = '', targetRole = '') {
  if (!contractFile) {
    return {
      checked: false,
      status: 'skipped',
      reason: 'no_contract_file_provided'
    }
  }

  const absolutePath = resolve(process.cwd(), contractFile)
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) {
    return {
      checked: true,
      status: 'fail',
      contractFile,
      reason: 'contract_file_not_found'
    }
  }

  const content = readFileSync(absolutePath, 'utf8')
  const requiredMarkers = targetRole === 'implementer_deep'
    ? REQUIRED_DEEP_CONTRACT_MARKERS
    : ['contract_id', 'objective', 'allowed_paths', 'forbidden_paths', 'test_contract']
  const missingMarkers = requiredMarkers.filter(marker => !content.includes(marker))

  return {
    checked: true,
    status: missingMarkers.length ? 'fail' : 'pass',
    contractFile,
    targetRole: targetRole || 'unspecified',
    requiredMarkers,
    missingMarkers,
    reason: missingMarkers.length ? 'implementation_contract_missing_required_markers' : ''
  }
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
  const contractCheck = checkImplementationContract(args.contractFile, args.targetRole)
  const contractFailed = contractCheck.checked && contractCheck.status !== 'pass'
  const missingInput = args.mode === 'files' && files.length === 0 && !args.contractFile
  const receipt = {
    gate: 'main_agent_quality_gates.file_size_and_contract',
    status: missingInput || blockingFindings.length || contractFailed ? 'fail' : 'pass',
    mode: args.mode,
    thresholds: {
      warningLineThreshold: WARNING_LINE_THRESHOLD,
      blockingLineThreshold: BLOCKING_LINE_THRESHOLD
    },
    checkedFiles: files,
    findings,
    warningCount: warningFindings.length,
    blockingCount: blockingFindings.length,
    contractCheck,
    continueAllowed: !missingInput && blockingFindings.length === 0 && !contractFailed,
    blockingReason: missingInput
      ? 'missing_file_scope_for_main_agent_quality_gate'
      : (blockingFindings.length
        ? 'file_size_gate_failed'
        : (contractFailed ? 'implementation_contract_gate_failed' : ''))
  }

  console.log(JSON.stringify(receipt, null, 2))
  process.exit(receipt.continueAllowed ? 0 : 1)
}

main()
