#!/usr/bin/env node
import fs from 'node:fs'
import { buildWorktreeScopeReport } from './lib/implementation-postflight-checks.mjs'

const [handoffFile, resultFile, baselineFile] = process.argv.slice(2)
if (!handoffFile || !resultFile || !baselineFile) {
  console.error(
    'usage: validate-worktree-scope.mjs <handoff.json> <implementer-or-external-result.json> <worktree-baseline.json>'
  )
  process.exit(2)
}

console.error(
  'deprecated: prefer validate-implementation-postflight.mjs (single postflight report)'
)

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
const report = buildWorktreeScopeReport({ handoff, result, baseline, baselineFile })

console.log(JSON.stringify(report, null, 2))
if (report.errors.length) {
  process.exit(1)
}
