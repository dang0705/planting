#!/usr/bin/env node
import fs from 'node:fs'
import { buildNoNewDepsReport } from './lib/implementation-postflight-checks.mjs'

const [handoffFile, baselineFile, resultFile] = process.argv.slice(2)
if (!handoffFile || !baselineFile) {
  console.error(
    'usage: validate-no-new-deps.mjs <handoff.json> <worktree-baseline.json> [implementer-or-external-result.json]'
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
const baseline = readJson(baselineFile)
const result = resultFile ? readJson(resultFile) : {}
const report = buildNoNewDepsReport({ handoff, result, baseline, baselineFile })

console.log(JSON.stringify(report, null, 2))
if (report.errors.length) {
  process.exit(1)
}
