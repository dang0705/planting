#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOTS = ['test/unit/frontend', 'test/unit/backend']

function listTests() {
  return ROOTS.flatMap(root =>
    fs
      .readdirSync(root)
      .filter(file => file.endsWith('.mjs') || file.endsWith('.cjs'))
      .sort()
      .map(file => path.join(root, file))
  )
}

function assertUnitIsolation(files) {
  const violations = []
  for (const file of files) {
    const source = fs.readFileSync(file, 'utf8')
    const touchesSrc = /(?:^|['"`(])(?:\.\.\/)+src\/|['"`]src['"`]|\.\/src\//.test(source)
    const touchesCloud =
      /(?:^|['"`(])(?:\.\.\/)+cloudfunctions\/|['"`]cloudfunctions['"`]|\.\/cloudfunctions\//.test(
        source
      )
    if (touchesSrc && touchesCloud) {
      violations.push(file)
    }
  }
  if (violations.length) {
    throw new Error(`unit tests must not cross src and cloudfunctions: ${violations.join(', ')}`)
  }
}

function runTest(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit' })
    child.on('close', code => resolve({ file, code }))
    child.on('error', error => resolve({ file, code: 1, error }))
  })
}

const tests = listTests()
assertUnitIsolation(tests)

let failed = 0
for (const file of tests) {
  process.stdout.write(`\n[unit] ${file}\n`)
  const result = await runTest(file)
  if (result.code !== 0) {
    failed += 1
    process.stderr.write(`[unit] failed: ${file}\n`)
  }
}

process.stdout.write(`\n[unit] summary: ${tests.length - failed}/${tests.length} passed\n`)
process.exit(failed === 0 ? 0 : 1)
