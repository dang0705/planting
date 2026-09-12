import crypto from 'node:crypto'
import { access, readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { assertContract } from '../contracts/index.mjs'
import { readJson, object } from './json.mjs'

export const SIDECAR_FILE = 'mp-e2e.contract.json'
const REQUIRED_CAPABILITIES = new Set(['navigate', 'interact', 'screenshot', 'runtime-request'])

/** @param {string} artifactPath */
export async function validateArtifact(artifactPath) {
  const root = path.resolve(String(artifactPath || ''))
  const rootStat = await stat(root).catch(() => null)
  assertContract(rootStat?.isDirectory(), `artifact must be a directory: ${root}`)
  const sidecarPath = path.join(root, SIDECAR_FILE)
  const contract = await readJson(sidecarPath)
  validateSidecar(contract)
  const projectConfigPath = resolveInside(root, contract.projectConfigPath, 'projectConfigPath')
  const appConfigPath = resolveInside(root, contract.appConfigPath, 'appConfigPath')
  await Promise.all([
    access(projectConfigPath),
    access(appConfigPath),
    readJson(projectConfigPath),
    readJson(appConfigPath)
  ])
  return Object.freeze({
    root,
    sidecarPath,
    contract: Object.freeze(contract),
    projectConfigPath,
    appConfigPath
  })
}

/** @param {object} sidecar */
export function validateSidecar(sidecar) {
  assertContract(object(sidecar), 'sidecar must be an object')
  assertContract(sidecar.contractVersion === 1, 'sidecar contractVersion must be 1')
  assertContract(sidecar.platform === 'wechat-miniprogram', 'sidecar platform must be wechat-miniprogram')
  for (const key of ['projectConfigPath', 'appConfigPath']) {
    assertContract(typeof sidecar[key] === 'string' && sidecar[key].trim(), `sidecar ${key} is required`)
  }
  assertContract(object(sidecar.selectorPolicy), 'sidecar selectorPolicy is required')
  assertContract(sidecar.selectorPolicy.kind === 'semantic-id', 'sidecar selectorPolicy.kind must be semantic-id')
  assertContract(
    ['exact', 'scoped', 'exact-or-scoped'].includes(sidecar.selectorPolicy.compiledIdMode),
    'sidecar selectorPolicy.compiledIdMode is invalid'
  )
  assertContract(Array.isArray(sidecar.capabilities), 'sidecar capabilities must be an array')
  assertContract(
    sidecar.capabilities.length > 0 && sidecar.capabilities.every(item => REQUIRED_CAPABILITIES.has(item)),
    'sidecar capabilities are invalid'
  )
  assertContract(object(sidecar.adapter), 'sidecar adapter is required')
  assertContract(typeof sidecar.adapter.id === 'string' && sidecar.adapter.id.trim(), 'sidecar adapter.id is required')
  assertContract(sidecar.adapter.apiVersion === 1, 'sidecar adapter.apiVersion must be 1')
  const forbidden = ['route', 'routes', 'url', 'endpoint', 'token', 'openid', 'fixture', 'module', 'pathToModule']
  const unexpected = Object.keys(sidecar).filter(key => !['contractVersion', 'platform', 'projectConfigPath', 'appConfigPath', 'selectorPolicy', 'capabilities', 'adapter'].includes(key))
  assertContract(!unexpected.length, `sidecar contains undeclared fields: ${unexpected.join(', ')}`)
  assertContract(!forbidden.some(key => JSON.stringify(sidecar).toLowerCase().includes(`"${key.toLowerCase()}"`)), 'sidecar contains forbidden executable or business metadata')
}

/** @param {string} root @param {string} relative @param {string} label */
function resolveInside(root, relative, label) {
  const resolved = path.resolve(root, relative)
  assertContract(resolved.startsWith(`${root}${path.sep}`), `sidecar ${label} must stay inside artifact`)
  return resolved
}

/** @param {string} artifactPath */
export async function snapshotArtifact(artifactPath) {
  const artifact = await validateArtifact(artifactPath)
  const records = []
  await walk(artifact.root, artifact.root, records)
  records.sort((left, right) => left.path.localeCompare(right.path))
  const digest = crypto.createHash('sha256').update(JSON.stringify(records)).digest('hex')
  return {
    artifactRoot: artifact.root,
    contract: artifact.contract,
    fileCount: records.length,
    sha256: digest,
    files: records
  }
}

async function walk(root, current, records) {
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name)
    if (entry.isDirectory()) {
      await walk(root, absolute, records)
      continue
    }
    if (!entry.isFile()) {continue}
    const contents = await readFile(absolute)
    records.push({
      path: path.relative(root, absolute).replaceAll(path.sep, '/'),
      bytes: contents.length,
      sha256: crypto.createHash('sha256').update(contents).digest('hex')
    })
  }
}
