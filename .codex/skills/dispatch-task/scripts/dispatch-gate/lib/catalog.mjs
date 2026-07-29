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

function listFiles(dir) {
  const entries = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []
  return entries.flatMap(entry => {
    const child = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      return listFiles(child)
    }
    return entry.isFile() ? [child] : []
  })
}

function isExecutableLeaf(file, catalog) {
  const normalized = normalize(file)
  const extensions = catalog.executable_leaf_convention?.extensions ?? ['.mjs', '.cjs']
  if (!extensions.includes(path.extname(normalized))) {
    return false
  }
  const segments = normalized.split('/')
  const excluded = catalog.executable_leaf_convention?.excluded_path_segments ?? [
    '_shared',
    '_history'
  ]
  return !segments.some(segment => excluded.includes(segment))
}

export function discoverExecutableLeaves(catalog = readCatalog()) {
  const roots = catalog.executable_leaf_convention?.roots ?? ['test/e2e/automator']
  return roots
    .flatMap(root => listFiles(path.join(repoRoot, root)))
    .map(file => normalize(path.relative(repoRoot, file)))
    .filter(file => isExecutableLeaf(file, catalog))
    .sort()
}

export function readCatalog() {
  return JSON.parse(fs.readFileSync(catalogPath, 'utf8'))
}

export function validateCatalog() {
  const errors = []
  const warnings = []
  const catalog = readCatalog()
  require(Array.isArray(catalog.entries), 'catalog.entries must be an array', errors)
  require(catalog.version === 2, 'catalog.version must be 2', errors)
  const requiredDomains = ['ai-vision', 'diagnosis', 'care', 'user', 'plants']
  require(requiredDomains.every(domain =>
    catalog.top_domains?.includes(domain)
  ), `catalog.top_domains must include ${requiredDomains.join(', ')}`, errors)
  require(isObject(
    catalog.category_tree
  ), 'catalog.category_tree must be a hierarchy object', errors)
  const ids = new Set()
  const scripts = new Set()
  const idPolicy = fs.existsSync(idPolicyPath) ? fs.readFileSync(idPolicyPath, 'utf8') : ''

  for (const entry of catalog.entries ?? []) {
    require(typeof entry.id === 'string' &&
      entry.id.length > 0, 'catalog entry id is required', errors)
    require(!ids.has(entry.id), `duplicate catalog id: ${entry.id}`, errors)
    ids.add(entry.id)
    require(Array.isArray(entry.category_path) &&
      entry.category_path.length >=
        2, `category_path must include module/submodule/leaf for ${entry.id}`, errors)
    if (Array.isArray(entry.category_path)) {
      require(catalog.top_domains?.includes(
        entry.category_path[0]
      ), `category_path root must be a fixed top domain for ${entry.id}`, errors)
      require(entry.category_path[0] !==
        'watering', `watering cannot be a top-level category for ${entry.id}`, errors)
      if (entry.category_path.includes('watering')) {
        require(entry.category_path[0] ===
          'care', `watering category must live under care for ${entry.id}`, errors)
      }
    }
    const script = normalize(entry.leaf_script ?? entry.script)
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
      entry.reusable_scenarios
    ), `reusable_scenarios must be an array for ${entry.id}`, errors)
    for (const scenario of entry.reusable_scenarios ?? []) {
      const normalizedScenario = normalize(scenario)
      require(normalizedScenario.includes(
        '/_shared/'
      ), `reusable scenario must live under _shared for ${entry.id}: ${normalizedScenario}`, errors)
      require(fs.existsSync(
        path.join(repoRoot, normalizedScenario)
      ), `reusable scenario does not exist for ${entry.id}: ${normalizedScenario}`, errors)
    }
    const refs = entry.id_policy?.refs ?? entry.required_id_policy_refs
    require(Array.isArray(refs), `id_policy.refs must be an array for ${entry.id}`, errors)
    require(Array.isArray(entry.id_policy?.sections) &&
      entry.id_policy.sections.length >
        0, `id_policy.sections must be non-empty for ${entry.id}`, errors)
    require(Array.isArray(
      entry.id_policy?.stable_ids
    ), `id_policy.stable_ids must be an array for ${entry.id}`, errors)
    require(Array.isArray(
      entry.id_policy?.stable_id_prefixes
    ), `id_policy.stable_id_prefixes must be an array for ${entry.id}`, errors)
    for (const ref of refs ?? []) {
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
    require(isObject(entry.requirements), `requirements object is required for ${entry.id}`, errors)
    require('screenshot' in
      (entry.requirements ?? {}), `requirements.screenshot is required for ${entry.id}`, errors)
    require(Array.isArray(
      entry.requirements?.wx_request
    ), `requirements.wx_request must be an array for ${entry.id}`, errors)
    require('cache' in
      (entry.requirements ?? {}), `requirements.cache is required for ${entry.id}`, errors)
    require('reentry' in
      (entry.requirements ?? {}), `requirements.reentry is required for ${entry.id}`, errors)
    require(Array.isArray(
      entry.requirements?.fixtures
    ), `requirements.fixtures must be an array for ${entry.id}`, errors)
  }

  const discoveredLeaves = discoverExecutableLeaves(catalog)
  for (const leaf of discoveredLeaves) {
    require(scripts.has(leaf), `executable automator leaf has no catalog record: ${leaf}`, errors)
  }
  for (const script of scripts) {
    require(discoveredLeaves.includes(
      script
    ), `catalog script is not a discoverable executable leaf: ${script}`, errors)
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
    discovered_executable_leaves: discoveredLeaves.length,
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
      'provide a non-empty execution_id before LAN/DevTools/automator',
      'complete qa-preflight for projectPath, LAN, 9420/WS, page data, screenshot, and wx.request',
      'freeze the script hash, serialize 9420 access, and persist a terminal qa-run record before claiming acceptance'
    ],
    postflight_status: postflight?.status ?? null,
    created_at: new Date().toISOString()
  }
  const file = path.join(stateDir(dispatchRunId), 'qa-skeleton.json')
  writeJsonAtomic(file, skeleton)
  return { file, skeleton }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
