import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { executionBundleFingerprint } from './execution-bundle.mjs'
import { repoRoot, writeJsonAtomic, stateDir } from './state.mjs'

// The screenshot worker is launched by path from the shared screenshot
// harness, so it is not discoverable through static ESM imports. Keep it in
// every catalog execution bundle explicitly; otherwise a changed worker could
// bypass the frozen-script hash and formal QA would run unreviewed logic.
export const CATALOG_SHARED_EXECUTION_INTEGRITY_FILES = Object.freeze([
  'test/e2e/automator/diagnosis/_shared/screenshot-worker.mjs'
])

export function catalogExecutionBundleFingerprint(
  leafScript,
  { entry = {}, rootDir = repoRoot } = {}
) {
  return executionBundleFingerprint(leafScript, {
    rootDir,
    additionalFiles: [...CATALOG_SHARED_EXECUTION_INTEGRITY_FILES, ...(entry.integrity_files ?? [])]
  })
}

export {
  executionBundleFingerprint,
  resolveExecutionBundle,
  staticEsmSpecifiers
} from './execution-bundle.mjs'

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

const LIVE_LEAF_FORBIDDEN_PATTERNS = Object.freeze([
  [
    'formal_live_principal_injection',
    /(?<!function\s)(?<!export\s)installFormalLeafPrincipal\s*\(/u
  ],
  ['formal_user_storage_injection', /setStorageSync\s*\(\s*['"]user['"]/u],
  ['formal_fixture_toggle', /E2E_[A-Z0-9_]*FIXTURE|fixtureEnabled/u],
  ['formal_request_interception', /mockWxMethod|__plantsight_e2e|fixtureFor\s*=/u]
])

function validateLiveLeafSourceContract(bundle, entry, errors) {
  if (entry?.data_mode !== 'automator_live_real_api') {
    return
  }
  for (const item of bundle) {
    const source = fs.readFileSync(item.file, 'utf8')
    if (item.path.endsWith('/_shared/formal-leaf-harness.mjs')) {
      continue
    }
    for (const [code, pattern] of LIVE_LEAF_FORBIDDEN_PATTERNS) {
      if (pattern.test(source)) {
        errors.push(`${code}: live catalog bundle cannot contain ${item.path}`)
      }
    }
  }
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

export function validateCatalog({ catalogId = null } = {}) {
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
    require(['automator_live_real_api', 'fixture_diagnostic'].includes(
      entry.data_mode
    ), `data_mode must be automator_live_real_api or fixture_diagnostic for ${entry.id}`, errors)
    require(['persisted_real_wechat', 'diagnostic_injected'].includes(
      entry.auth_mode
    ), `auth_mode must be persisted_real_wechat or diagnostic_injected for ${entry.id}`, errors)
    require(['read_only', 'self_reverting', 'test_owned_persistent', 'diagnostic_only'].includes(
      entry.mutation_policy
    ), `mutation_policy must be read_only, self_reverting, test_owned_persistent, or diagnostic_only for ${entry.id}`, errors)
    if (entry.data_mode === 'automator_live_real_api') {
      require(entry.auth_mode ===
        'persisted_real_wechat', `live catalog entry must use persisted_real_wechat: ${entry.id}`, errors)
      require(entry.mutation_policy !==
        'diagnostic_only', `live catalog entry cannot be diagnostic_only: ${entry.id}`, errors)
    }
    if (entry.data_mode === 'fixture_diagnostic') {
      require(entry.mutation_policy ===
        'diagnostic_only', `fixture diagnostic entry must be diagnostic_only: ${entry.id}`, errors)
    }
    if (entry.data_mode === 'automator_live_real_api') {
      require(Array.isArray(entry.required_assertions) &&
        entry.required_assertions.length >
          0, `live catalog entry must declare required_assertions: ${entry.id}`, errors)
      const requiredAssertions = entry.required_assertions || []
      require(requiredAssertions.every(
        assertion => typeof assertion === 'string' && assertion.trim()
      ), `required_assertions must contain non-empty strings: ${entry.id}`, errors)
      require(new Set(requiredAssertions).size ===
        requiredAssertions.length, `required_assertions must be unique: ${entry.id}`, errors)
    }
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
      try {
        // A single formal run owns exactly one catalog leaf. Keep the full
        // catalog's structural checks, but do not let an unrelated leaf's
        // stale frozen hash block the selected run. The selected leaf is
        // still fingerprinted and checked below without exception.
        if (!catalogId || entry.id === catalogId) {
          const bundle = catalogExecutionBundleFingerprint(abs, { entry })
          require(entry.script_sha256 ===
            bundle.hash, `script hash mismatch for ${entry.id}: expected ${entry.script_sha256}, got ${bundle.hash}`, errors)
          validateLiveLeafSourceContract(
            bundle.files.map(file => ({
              path: file,
              file: path.join(repoRoot, file)
            })),
            entry,
            errors
          )
        }
      } catch (error) {
        errors.push(`execution bundle resolution failed for ${entry.id}: ${error.message}`)
      }
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
    if (entry.requirements?.backend_mode !== undefined) {
      require(['lan', 'online'].includes(
        entry.requirements.backend_mode
      ), `requirements.backend_mode must be lan or online for ${entry.id}`, errors)
    }
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
      'verify script_sha256 execution bundle fingerprint',
      'provide a non-empty execution_id before LAN/DevTools/automator',
      'complete qa-preflight for projectPath, LAN, a test-owned WS endpoint, page data, screenshot, and wx.request',
      'freeze the local execution bundle fingerprint, serialize test-owned Automator access, and persist a terminal qa-run record before claiming acceptance'
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
