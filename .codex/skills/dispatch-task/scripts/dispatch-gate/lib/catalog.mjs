import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { repoRoot, writeJsonAtomic, stateDir } from './state.mjs'

export const catalogPath = path.join(repoRoot, 'test', 'e2e', 'automator', 'catalog.json')
const idPolicyPath = path.join(repoRoot, 'docs', 'ai-rules', 'frontend-automation-id-policy.md')

export function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function normalize(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
}

function require(condition, message, errors) {
  if (!condition) {
    errors.push(message)
  }
}

export function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
}

export function validateCatalog() {
  const errors = []
  const warnings = []
  const catalog = readCatalog()
  require(Array.isArray(catalog.entries), 'catalog.entries must be an array', errors)
  const ids = new Set()
  const scripts = new Set()
  const idPolicy = fs.existsSync(idPolicyPath) ? fs.readFileSync(idPolicyPath, 'utf8') : ''

  for (const entry of catalog.entries ?? []) {
    require(typeof entry.id === 'string' &&
      entry.id.length > 0, 'catalog entry id is required', errors)
    require(!ids.has(entry.id), `duplicate catalog id: ${entry.id}`, errors)
    ids.add(entry.id)
    const script = normalize(entry.script)
    require(script.startsWith(
      'test/e2e/automator/'
    ), `automator script must live under test/e2e/automator: ${script}`, errors)
    require(!script.includes(
      '/_history/'
    ), `catalog script cannot be historical: ${script}`, errors)
    require(!scripts.has(script), `duplicate catalog script: ${script}`, errors)
    scripts.add(script)
    const abs = path.join(repoRoot, script)
    require(fs.existsSync(abs), `catalog script does not exist: ${script}`, errors)
    if (fs.existsSync(abs)) {
      const actualHash = sha256File(abs)
      require(entry.script_sha256 ===
        actualHash, `script hash mismatch for ${entry.id}: expected ${entry.script_sha256}, got ${actualHash}`, errors)
    }
    require(Array.isArray(
      entry.required_id_policy_refs
    ), `required_id_policy_refs must be an array for ${entry.id}`, errors)
    for (const ref of entry.required_id_policy_refs ?? []) {
      require(typeof ref === 'string' &&
        ref.startsWith(
          'docs/ai-rules/frontend-automation-id-policy.md#'
        ), `id policy ref must point to frontend automation policy: ${entry.id}`, errors)
      const marker = ref.split('#')[1] ?? ''
      if (marker) {
        require(idPolicy.includes(
          marker
        ), `id policy marker not found for ${entry.id}: ${marker}`, errors)
      }
    }
  }

  const topEntries = fs
    .readdirSync(path.join(repoRoot, 'test', 'e2e'), { withFileTypes: true })
    .map(item => item.name)
    .filter(name => !name.startsWith('.'))
  const unexpected = topEntries.filter(name => !['batch', 'automator'].includes(name))
  require(unexpected.length ===
    0, `test/e2e may only contain batch and automator: ${unexpected.join(', ')}`, errors)

  return {
    status: errors.length ? 'failed' : 'passed',
    gate: 'e2e_catalog',
    catalog_path: 'test/e2e/automator/catalog.json',
    entries: catalog.entries?.length ?? 0,
    warnings,
    errors
  }
}

export function createQaSkeleton({ dispatchRunId, handoff = {}, postflight = null }) {
  const skeleton = {
    dispatch_run_id: dispatchRunId,
    status: 'planned',
    runtime_acceptance_mode: handoff?.validation?.runtime_acceptance_mode ?? null,
    channel: 'catalog_required_before_automator',
    catalog_path: 'test/e2e/automator/catalog.json',
    requirements: [
      'select an exact catalog leaf id',
      'validate docs/ai-rules/frontend-automation-id-policy.md refs',
      'verify script_sha256',
      'provide a non-empty execution_id before LAN/DevTools/automator'
    ],
    postflight_status: postflight?.status ?? null,
    created_at: new Date().toISOString()
  }
  const file = path.join(stateDir(dispatchRunId), 'qa-skeleton.json')
  writeJsonAtomic(file, skeleton)
  return { file, skeleton }
}
