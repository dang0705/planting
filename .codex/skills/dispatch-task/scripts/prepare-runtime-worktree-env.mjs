#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [handoffFile, mode = 'prepare'] = process.argv.slice(2)
if (!handoffFile || !['prepare', 'cleanup'].includes(mode)) {
  console.error('usage: prepare-runtime-worktree-env.mjs <handoff.json> [prepare|cleanup]')
  process.exit(2)
}

const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const normalize = value =>
  path
    .resolve(String(value))
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')

const handoff = readJson(handoffFile)
const external = handoff.external_contract ?? handoff.zcode_contract ?? {}
const worktreePath = external?.remote_sync?.planned_worktree_path

if (!nonEmptyString(worktreePath)) {
  console.error(
    JSON.stringify(
      {
        status: 'blocked',
        gate: 'runtime_worktree_env',
        errors: ['external_contract.remote_sync.planned_worktree_path is required']
      },
      null,
      2
    )
  )
  process.exit(1)
}

const source = path.join(repoRoot, '.env.local')
const target = path.join(worktreePath, '.env.local')
const sourceExists = fs.existsSync(source)
const targetExists = fs.existsSync(target)

const readEnvKeys = file => {
  if (!fs.existsSync(file)) {return []}
  return fs
    .readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => line.slice(0, line.indexOf('=')).trim())
    .filter(Boolean)
    .sort()
}

if (mode === 'cleanup') {
  let removed = false
  if (targetExists) {
    fs.rmSync(target)
    removed = true
  }
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        gate: 'runtime_worktree_env',
        action: 'cleanup',
        target: normalize(target),
        removed
      },
      null,
      2
    )
  )
  process.exit(0)
}

const errors = []
if (!sourceExists) {errors.push('main workspace .env.local is missing')}
if (!fs.existsSync(worktreePath)) {errors.push('planned worktree path does not exist')}
if (targetExists) {errors.push('target worktree .env.local already exists; cleanup or inspect before overwriting')}

if (!errors.length) {
  fs.copyFileSync(source, target)
  fs.chmodSync(target, 0o600)
}

const report = {
  status: errors.length ? 'blocked' : 'passed',
  gate: 'runtime_worktree_env',
  action: 'prepare',
  source: normalize(source),
  target: normalize(target),
  secret_values_redacted: true,
  source_exists: sourceExists,
  target_preexisted: targetExists,
  copied: !errors.length,
  env_keys: sourceExists ? readEnvKeys(source) : [],
  errors
}

console.log(JSON.stringify(report, null, 2))
process.exit(errors.length ? 1 : 0)
