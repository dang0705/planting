/* oxlint-disable no-console, no-magic-numbers */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { inspectHttpFunctionPackage } from '../../../scripts/qa/function-package-integrity.mjs'

// data_mode=unit_fake; test_kind=source_contract。只构造临时函数包，验证发布前依赖完整性门。
const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-function-package-integrity-'))

function createPackage(name, { bootstrap = true, dependencies = {}, lockfile = false } = {}) {
  const directory = path.join(temporaryRoot, name)
  fs.mkdirSync(directory, { recursive: true })
  if (bootstrap) {
    fs.writeFileSync(path.join(directory, 'scf_bootstrap'), '#!/bin/sh\n')
  }
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name, dependencies }))
  if (lockfile) {
    fs.writeFileSync(
      path.join(directory, 'package-lock.json'),
      JSON.stringify({ name, lockfileVersion: 3 })
    )
  }
  return directory
}

try {
  const dependencyFree = inspectHttpFunctionPackage(
    'dependency-free-http',
    createPackage('dependency-free-http')
  )
  assert.equal(dependencyFree.kind, 'http_function')
  assert.equal(dependencyFree.dependency_count, 0)
  assert.deepEqual(dependencyFree.violations, [])

  const missingLock = inspectHttpFunctionPackage(
    'missing-lock-http',
    createPackage('missing-lock-http', { dependencies: { example: '^1.0.0' } })
  )
  assert.equal(missingLock.violations[0]?.code, 'http_production_dependency_lock_missing')

  const complete = inspectHttpFunctionPackage(
    'complete-http',
    createPackage('complete-http', { dependencies: { example: '^1.0.0' }, lockfile: true })
  )
  assert.deepEqual(complete.violations, [])

  const eventFunction = inspectHttpFunctionPackage(
    'event-function',
    createPackage('event-function', { bootstrap: false, dependencies: { example: '^1.0.0' } })
  )
  assert.equal(eventFunction.kind, 'not_http_function')
  console.log(
    'function package integrity tests passed data_mode=unit_fake test_kind=source_contract'
  )
} finally {
  fs.rmSync(temporaryRoot, { recursive: true, force: true })
}
