#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = path.resolve(scriptDir, '../..')
const FUNCTIONS_ROOT = path.join(PROJECT_ROOT, 'cloudfunctions')

const SENSITIVE_PATTERNS = [
  {
    code: 'request_headers',
    pattern: /\b(?:req|request|event)\s*\.\s*headers\b|\bheaders\s*:|(?:^|,)\s*headers\s*(?:,|$)/iu
  },
  {
    code: 'request_body',
    pattern:
      /\b(?:req|request|event)\s*\.\s*body\b|\bbody\s*:|(?:^|,)\s*(?:body|payload)\s*(?:,|$)/iu
  },
  { code: 'runtime_context', pattern: /\bprocess\.env\b|x-cloudbase-context/iu },
  {
    code: 'credential_field',
    pattern:
      /\b(?:authorization|token|secret|password|openid|openId|apiKey)\s*:\s*|(?:^|,)\s*(?:authorization|token|secret|password|openid|openId|apiKey)\s*(?:,|$)/iu
  },
  {
    code: 'raw_sql',
    pattern: /\b(?:rawSql|sqlText|sql)\s*:\s*|(?:^|,)\s*(?:rawSql|sqlText|sql)\s*(?:,|$)/iu
  },
  {
    code: 'raw_request_object',
    pattern: /(?:^|,)\s*(?:req|request|event|context)\s*(?:,|$)/iu
  }
]

function toProjectPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/')
}

function listJavaScriptFiles(directory) {
  if (!fs.existsSync(directory)) {
    return []
  }
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory() && entry.name === 'node_modules') {
      continue
    }
    if (entry.isDirectory()) {
      files.push(...listJavaScriptFiles(entryPath))
    } else if (entry.isFile() && entry.name.endsWith('.js')) {
      files.push(entryPath)
    }
  }
  return files
}

function isGeneratedBundle(source) {
  // The split HTTP entries are generated from source modules and are checked
  // byte-for-byte elsewhere. Scanning their minified copies only duplicates
  // findings and does not provide another source of truth.
  return source.length > 100_000 || /["']use strict["'];var /u.test(source)
}

function findLoggerCalls(source) {
  const text = String(source || '')
  const calls = []
  const loggerPattern = /\bconsole\.(?:log|warn|error|debug)\s*\(/gu
  let match
  while ((match = loggerPattern.exec(text))) {
    const openIndex = text.indexOf('(', match.index)
    let depth = 1
    let quote = ''
    let escaped = false
    let index = openIndex + 1
    for (; index < text.length && depth > 0; index += 1) {
      const char = text[index]
      if (quote) {
        if (escaped) {
          escaped = false
        } else if (char === '\\') {
          escaped = true
        } else if (char === quote) {
          quote = ''
        }
        continue
      }
      if (char === "'" || char === '"' || char === '`') {
        quote = char
        continue
      }
      if (char === '(') {
        depth += 1
      }
      if (char === ')') {
        depth -= 1
      }
    }
    const line = text.slice(0, match.index).split('\n').length
    calls.push({ line, text: text.slice(openIndex + 1, Math.max(openIndex + 1, index - 1)) })
    loggerPattern.lastIndex = Math.max(index, match.index + match[0].length)
  }
  return calls
}

export function scanSensitiveLogs(source, filePath) {
  if (isGeneratedBundle(source)) {
    return []
  }
  const findings = []
  for (const window of findLoggerCalls(source)) {
    for (const { code, pattern } of SENSITIVE_PATTERNS) {
      if (pattern.test(window.text)) {
        findings.push({ file: toProjectPath(filePath), line: window.line, code })
      }
    }
  }
  return findings
}

export function auditSensitiveLogs() {
  const findings = []
  for (const filePath of listJavaScriptFiles(FUNCTIONS_ROOT)) {
    findings.push(...scanSensitiveLogs(fs.readFileSync(filePath, 'utf8'), filePath))
  }
  findings.sort((left, right) =>
    `${left.file}:${left.line}:${left.code}`.localeCompare(
      `${right.file}:${right.line}:${right.code}`
    )
  )
  return findings
}

function parseArgs(argv) {
  const strict = argv.includes('--strict')
  const reportOnly = argv.includes('--report-only') || !strict
  const unsupported = argv.filter(arg => !['--strict', '--report-only'].includes(arg))
  if (unsupported.length) {
    throw new Error(`不支持的参数：${unsupported.join(', ')}`)
  }
  return { strict, reportOnly }
}

export function runAudit({ strict = false, reportOnly = !strict } = {}) {
  const findings = auditSensitiveLogs()
  const report = {
    status: findings.length ? 'FINDINGS' : 'CLEAN',
    mode: reportOnly ? 'report-only' : 'strict',
    finding_count: findings.length,
    findings
  }
  console.log(JSON.stringify(report, null, 2))
  if (strict && !reportOnly && findings.length) {
    process.exitCode = 1
  }
  return report
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  runAudit(parseArgs(process.argv.slice(2)))
}
