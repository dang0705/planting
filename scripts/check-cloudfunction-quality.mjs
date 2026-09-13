#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(scriptDir, '..')

function run(command, args) {
  execFileSync(command, args, {
    cwd: projectRoot,
    stdio: 'inherit'
  })
}

// The generated split artifacts are checked byte-for-byte against a clean
// esbuild output. Linting their minified content adds noise without checking
// a second source of truth, so lint only the handwritten cloudfunction files.
run(process.execPath, [
  path.join(projectRoot, 'scripts/build-diagnosis-http-splits.mjs'),
  '--check'
])
run(process.execPath, [
  path.join(projectRoot, 'test/unit/backend/diagnose-http/app/split-entry-artifact-contract.mjs')
])
run(process.execPath, [
  '--test',
  path.join(projectRoot, 'test/unit/backend/diagnose-http/route-exposure.mjs')
])
run(process.execPath, [path.join(projectRoot, 'scripts/qa/check-http-function-paths.mjs')])
run(process.execPath, [
  path.join(projectRoot, 'test/unit/backend/diagnose-http/app/http-router-errors.mjs')
])
run(process.execPath, [
  path.join(projectRoot, 'test/unit/backend/diagnose-http/handlers/diagnosis-error-boundary.mjs')
])
run(process.execPath, [path.join(projectRoot, 'test/unit/tools/quality-checkers.mjs')])
run(process.execPath, [
  path.join(projectRoot, 'scripts/qa/check-sensitive-logs.mjs'),
  '--report-only'
])
run('npx', ['--no-install', 'oxlint', '--quiet', 'cloudfunctions'])
