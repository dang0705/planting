#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const repoRoot = process.cwd()
const ignoredPrefixes = [
  '.e2e-artifacts/',
  // Governance files are validated by their contract runners; the directory
  // also contains legacy Markdown/JSON that the formatter intentionally does
  // not normalize as part of a product repair.
  '.codex/',
  '.tmp/',
  '.agents/',
  '.brv/',
  '.brv-backup/',
  '.zcode/',
  'dist/',
  'unpackage/',
  'test/batch-results/',
  'test/e2e/batch/diagnosis/_history/',
  'test/e2e/batch/diagnosis/manifests/',
  'test/e2e/batch/diagnosis/fixtures/'
]
const checkableExtensions = new Set(['.js', '.mjs', '.cjs', '.vue', '.json', '.md'])

// The repository intentionally contains historical QA transcripts and a user-owned
// main-package change set. Keep those out of this repair gate, while still checking
// every executable file changed by the Automator repair itself.
const userOwnedBaselineFiles = new Set([
  '.e2e-artifacts/watering-transpiration-v3/e2e-shadow-myplant-2026-08-12T05-24-57-045Z.json',
  '.e2e-artifacts/watering-transpiration-v3/e2e-shadow-myplant-2026-08-12T05-27-24-469Z.json',
  '.e2e-artifacts/watering-transpiration-v3/e2e-shadow-myplant-2026-08-12T05-32-14-181Z.json',
  '.e2e-artifacts/watering-transpiration-v3/independent-01-init.png',
  '.e2e-artifacts/watering-transpiration-v3/myplant-01-init.png',
  'scripts/check-main-package-size.mjs',
  'src/api/wechat.js',
  'src/http-functions/core/httpRequest.js',
  'src/store/user.js',
  'src/utils/cloudbase-auth.js',
  'src/utils/main-package-size.js',
  'test/unit/frontend/http-functions/core/httpRequest.mjs',
  'test/unit/frontend/store/user.mjs',
  'test/unit/frontend/utils/check-main-package-size.mjs'
])

function gitFiles(command, args) {
  return execFileSync('git', [command, ...args], { cwd: repoRoot, encoding: 'utf8' })
    .split('\n')
    .map(file => file.trim())
    .filter(Boolean)
}

function shouldCheck(file) {
  return (
    !userOwnedBaselineFiles.has(file) &&
    !ignoredPrefixes.some(prefix => file.startsWith(prefix)) &&
    checkableExtensions.has(path.extname(file)) &&
    fs.existsSync(path.join(repoRoot, file))
  )
}

const files = [
  ...gitFiles('diff', ['--name-only', '--diff-filter=ACMRT']),
  ...gitFiles('ls-files', ['--others', '--exclude-standard'])
].filter(shouldCheck)

const uniqueFiles = [...new Set(files)].sort()
if (!uniqueFiles.length) {
  console.log('[quality] no changed checkable files')
  process.exit(0)
}

const tool = process.argv[2]
const args = tool === 'lint' ? ['--quiet', ...uniqueFiles] : ['--check', ...uniqueFiles]
if (!['lint', 'format'].includes(tool)) {
  throw new Error('usage: check-quality-scope.mjs <lint|format>')
}

console.log(`[quality] ${tool} ${uniqueFiles.length} changed files`)
execFileSync(tool === 'lint' ? 'oxlint' : 'oxfmt', args, {
  cwd: repoRoot,
  stdio: 'inherit'
})
