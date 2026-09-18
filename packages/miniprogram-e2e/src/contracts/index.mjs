/**
 * Public contracts intentionally contain no project, framework, or host details.
 * @module miniprogram-e2e/contracts
 */

const LEAF_ID = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u

export const OUTCOMES = Object.freeze(['passed', 'failed', 'aborted'])
export const INFRASTRUCTURE_STATUSES = Object.freeze(['passed', 'failed', 'not_run'])
export const FIXTURE_STATUSES = Object.freeze([
  'ready',
  'blocked',
  'cleanup_failed',
  'not_required'
])
export const BUSINESS_STATUSES = Object.freeze(['passed', 'failed', 'not_run'])
export const FAILURE_KINDS = Object.freeze([
  'infrastructure',
  'contract',
  'fixture',
  'product',
  'script',
  'none'
])

/** @param {unknown} condition @param {string} message */
export function assertContract(condition, message) {
  if (!condition) {
    const error = new Error(message)
    error.code = 'mp_e2e_contract_invalid'
    throw error
  }
}

/**
 * Register a leaf with a function that receives a framework-neutral context.
 * @param {{id:string, dataMode?:'live_real'|'fixture_diagnostic', title?:string}} metadata
 * @param {(context: import('../core/runner.mjs').LeafContext) => Promise<object>|object} run
 */
export function defineLeaf(metadata, run) {
  assertContract(metadata && typeof metadata === 'object', 'leaf metadata must be an object')
  assertContract(LEAF_ID.test(String(metadata.id || '')), 'leaf metadata.id is invalid')
  assertContract(typeof run === 'function', 'leaf run must be a function')
  const dataMode = metadata.dataMode || 'live_real'
  assertContract(
    ['live_real', 'fixture_diagnostic'].includes(dataMode),
    'leaf metadata.dataMode must be live_real or fixture_diagnostic'
  )
  return Object.freeze({ kind: 'mp-e2e-leaf', metadata: Object.freeze({ ...metadata, dataMode }), run })
}

/**
 * @param {{id:string, prepare?:(context:object)=>Promise<object>|object, verify?:(context:object)=>Promise<object>|object, cleanup?:(context:object)=>Promise<object>|object}} lifecycle
 */
export function defineFixture(lifecycle) {
  assertContract(lifecycle && typeof lifecycle === 'object', 'fixture lifecycle must be an object')
  assertContract(LEAF_ID.test(String(lifecycle.id || '')), 'fixture id is invalid')
  assertContract(typeof lifecycle.prepare === 'function', 'fixture prepare must be a function')
  assertContract(typeof lifecycle.cleanup === 'function', 'fixture cleanup must be a function')
  return Object.freeze({ kind: 'mp-e2e-fixture', ...lifecycle })
}

/** @param {object} adapter */
export function defineProjectAdapter(adapter) {
  assertContract(adapter && typeof adapter === 'object', 'adapter must be an object')
  assertContract(LEAF_ID.test(String(adapter.id || '')), 'adapter id is invalid')
  assertContract(Number(adapter.apiVersion) === 1, 'adapter apiVersion must be 1')
  assertContract(
    adapter.applicationSessionProvider &&
      typeof adapter.applicationSessionProvider.start === 'function',
    'adapter.applicationSessionProvider.start is required'
  )
  if (adapter.portPolicy !== undefined) {
    assertContract(adapter.portPolicy && typeof adapter.portPolicy === 'object', 'adapter.portPolicy must be an object')
    assertContract(['lease', 'exclusive'].includes(adapter.portPolicy.mode), 'adapter.portPolicy.mode must be lease or exclusive')
    if (adapter.portPolicy.ports !== undefined) {
      assertContract(adapter.portPolicy.ports && typeof adapter.portPolicy.ports === 'object', 'adapter.portPolicy.ports must be an object')
      for (const value of Object.values(adapter.portPolicy.ports)) {
        assertContract(Number.isInteger(value) && value > 0 && value <= 65535, 'adapter.portPolicy port is invalid')
      }
    }
  }
  if (adapter.devToolsProfileProvider !== undefined) {
    assertContract(
      adapter.devToolsProfileProvider && typeof adapter.devToolsProfileProvider.acquire === 'function',
      'adapter.devToolsProfileProvider.acquire is required when a profile provider is supplied'
    )
  }
  return Object.freeze({
    ...adapter,
    fixtures: Object.freeze({ ...adapter.fixtures })
  })
}
