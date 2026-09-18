import path from 'node:path'
import { access } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { assertContract } from '../contracts/index.mjs'
import { readJson, object } from './json.mjs'

/** @param {string} suitePath */
export async function readSuite(suitePath) {
  const file = path.resolve(String(suitePath || ''))
  const manifest = await readJson(file)
  assertContract(object(manifest), 'suite manifest must be an object')
  assertContract(manifest.suiteVersion === 1, 'suiteVersion must be 1')
  assertContract(typeof manifest.id === 'string' && manifest.id.trim(), 'suite id is required')
  assertContract(Array.isArray(manifest.leaves) && manifest.leaves.length, 'suite must include leaves')
  const ids = new Set()
  for (const leaf of manifest.leaves) {
    assertContract(object(leaf), 'suite leaf must be an object')
    assertContract(typeof leaf.id === 'string' && leaf.id.trim(), 'suite leaf id is required')
    assertContract(!ids.has(leaf.id), `suite leaf id is duplicated: ${leaf.id}`)
    ids.add(leaf.id)
    assertContract(typeof leaf.module === 'string' && leaf.module.trim(), `suite leaf module is required: ${leaf.id}`)
    assertContract(!path.isAbsolute(leaf.module), `suite leaf module must be relative: ${leaf.id}`)
    assertContract(!leaf.module.includes('..'), `suite leaf module may not traverse: ${leaf.id}`)
    assertContract(!leaf.fixtures || Array.isArray(leaf.fixtures), `suite fixtures must be an array: ${leaf.id}`)
  }
  return Object.freeze({ file, root: path.dirname(file), manifest: Object.freeze(manifest) })
}

/** @param {{root:string}} suite @param {{module:string}} entry */
export async function loadLeaf(suite, entry) {
  const modulePath = path.resolve(suite.root, entry.module)
  assertContract(modulePath.startsWith(`${suite.root}${path.sep}`), `suite leaf must stay in suite root: ${entry.id}`)
  try {
    await access(modulePath)
  } catch {
    assertContract(false, `suite leaf module does not exist: ${entry.id}`)
  }
  let exported
  try {
    exported = await import(pathToFileURL(modulePath).href)
  } catch (error) {
    const scriptError = new Error(`suite leaf module could not load: ${entry.id}`)
    scriptError.code = 'mp_e2e_script_leaf_load_failed'
    scriptError.cause = error
    throw scriptError
  }
  const leaf = exported.createLeaf
    ? await exported.createLeaf(Object.freeze({ ...entry }))
    : exported.default || exported.leaf
  assertContract(leaf?.kind === 'mp-e2e-leaf', `leaf module must export defineLeaf result: ${entry.id}`)
  assertContract(leaf.metadata.id === entry.id, `leaf module id mismatch: ${entry.id}`)
  return leaf
}
