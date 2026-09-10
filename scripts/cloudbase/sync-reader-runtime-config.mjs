#!/usr/bin/env node

// Safe reader config synchronization. CloudBase config updates replace the
// complete environment variable set, so this script always reads and merges
// the remote configuration before writing. It never logs secret values.
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { assertSafeFunctionEnvUpdate } = require('../../cloudfunctions/layer/utils/cloudbase-env-update-guard.js')
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const canonicalEnvId = 'cloud1-2grufevs395a9d5e'
const readers = ['auth-user-http', 'plant-user-http']
const requiredSecretKeys = ['HTTP_IDENTITY_TICKET_SECRET', 'SESSION_TOKEN_SECRET']
const apply = process.argv.includes('--apply')
const envId = String(process.env.CLOUDBASE_ENV_ID || process.env.TCB_ENV || canonicalEnvId).trim()

function fail(message) {
  throw new Error(message)
}

function runTcb(args, options = {}) {
  const result = spawnSync('npx', ['--yes', '--package', '@cloudbase/cli@3.2.2', 'tcb', ...args], {
    cwd: options.cwd || projectRoot,
    env: { ...process.env, CLOUDBASE_ENV_ID: envId, TCB_ENV: envId },
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    fail(`tcb ${args.slice(0, 3).join(' ')} failed: ${String(result.stderr || result.stdout || '').slice(0, 600)}`)
  }
  return String(result.stdout || '')
}

function parseJson(output) {
  const text = String(output || '').trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) fail('CloudBase fn detail did not return JSON')
  return JSON.parse(text.slice(start, end + 1))
}

function unwrapDetail(payload) {
  const root = payload?.data || payload?.Data || payload?.result || payload?.Result || payload
  return root?.Function || root?.function || root?.FunctionInfo || root?.functionInfo || root
}

function readVariables(detail) {
  const source =
    detail?.Environment?.Variables ||
    detail?.environment?.variables ||
    detail?.EnvironmentVariables ||
    detail?.envVariables ||
    []
  if (Array.isArray(source)) {
    return Object.fromEntries(
      source
        .map(entry => [String(entry?.Key || entry?.key || '').trim(), entry?.Value ?? entry?.value])
        .filter(([key]) => key)
    )
  }
  return source && typeof source === 'object' ? { ...source } : {}
}

function parseEnvFile(file) {
  if (!fs.existsSync(file)) return {}
  return fs.readFileSync(file, 'utf8').split(/\r?\n/u).reduce((values, line) => {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/u)
    if (!match || match[1].startsWith('#')) return values
    let value = match[2]
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[match[1]] = value
    return values
  }, {})
}

function localSecrets() {
  const values = { ...parseEnvFile(path.join(projectRoot, '.env.local')), ...process.env }
  const secrets = Object.fromEntries(requiredSecretKeys.map(key => [key, String(values[key] || '').trim()]))
  const missing = requiredSecretKeys.filter(key => secrets[key].length < 32)
  if (missing.length) fail(`本地缺少 reader 必需密钥: ${missing.join(', ')}`)
  return secrets
}

function configuredReader(name, config) {
  const reader = config.functions.find(item => item?.name === name)
  if (!reader) fail(`cloudbaserc.json missing ${name}`)
  return reader
}

function changedKeys(before, after) {
  return Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).filter(
    key => before[key] !== after[key]
  ).sort()
}

function syncReader(name, config, secrets) {
  const detail = unwrapDetail(parseJson(runTcb(['fn', 'detail', name, '--json'])))
  const remote = readVariables(detail)
  if (!Object.keys(remote).length) fail(`${name} remote environment variables are unavailable; refusing full replace`)
  const reader = configuredReader(name, config)
  const next = { ...remote, ...(reader.envVariables || {}), ...secrets }
  assertSafeFunctionEnvUpdate(remote, next)
  const changes = changedKeys(remote, next)
  if (!apply) return { name, action: 'dry_run', changedKeys: changes, remoteKeyCount: Object.keys(remote).length }
  const temporaryDir = fs.mkdtempSync(path.join(os.tmpdir(), `planting-reader-config-${name}-`))
  try {
    fs.writeFileSync(
      path.join(temporaryDir, 'cloudbaserc.json'),
      `${JSON.stringify({ envId, functions: [{ ...reader, envVariables: next }] }, null, 2)}\n`
    )
    runTcb(['config', 'update', 'fn', name, '--json'], { cwd: temporaryDir })
  } finally {
    fs.rmSync(temporaryDir, { recursive: true, force: true })
  }
  return { name, action: 'updated', changedKeys: changes, remoteKeyCount: Object.keys(remote).length }
}

try {
  if (envId !== canonicalEnvId) fail(`reader config target must be ${canonicalEnvId}`)
  const config = JSON.parse(fs.readFileSync(path.join(projectRoot, 'cloudbaserc.json'), 'utf8'))
  const secrets = localSecrets()
  const results = readers.map(name => syncReader(name, config, secrets))
  console.log(JSON.stringify({ status: apply ? 'updated' : 'dry_run', environment: envId, results }, null, 2))
} catch (error) {
  console.error(String(error?.message || error))
  process.exit(1)
}
