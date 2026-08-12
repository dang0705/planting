#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { catalogExecutionBundleFingerprint } from './lib/catalog.mjs'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '../../../../../')
const catalogPath = path.join(repoRoot, 'test/e2e/automator/catalog.json')
const checkOnly = process.argv.includes('--check')
const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
const refreshed = []

for (const entry of catalog.entries ?? []) {
  const fingerprint = catalogExecutionBundleFingerprint(entry.leaf_script, {
    entry,
    rootDir: repoRoot
  })
  if (entry.script_sha256 !== fingerprint.hash) {
    refreshed.push({ id: entry.id, from: entry.script_sha256, to: fingerprint.hash })
    entry.script_sha256 = fingerprint.hash
  }
}

if (checkOnly && refreshed.length) {
  console.error(JSON.stringify({ status: 'stale', refreshed }, null, 2))
  process.exitCode = 1
} else {
  if (!checkOnly && refreshed.length) {
    fs.writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
  }
  console.log(
    JSON.stringify({ status: 'passed', refreshed, entries: catalog.entries?.length ?? 0 })
  )
}
