import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const adapterRoot = path.dirname(fileURLToPath(import.meta.url))
const sidecarSource = path.resolve(adapterRoot, '..', 'contract', 'mp-e2e.contract.json')

/**
 * The compiled output owns its sidecar. The adapter verifies it but never
 * mutates an artifact immediately before a run.
 */
export const plantingArtifactProvider = {
  async prepare({ artifactPath }) {
    const root = path.resolve(String(artifactPath || ''))
    const destination = path.join(root, 'mp-e2e.contract.json')
    const expected = await readFile(sidecarSource, 'utf8')
    const current = await readFile(destination, 'utf8').catch(error => {
      error.code = 'planting_artifact_sidecar_missing'
      throw error
    })
    if (current !== expected) {
      const error = new Error('compiled artifact sidecar differs from the Planting adapter contract')
      error.code = 'planting_artifact_sidecar_mismatch'
      error.details = { destination, expectedSource: sidecarSource }
      throw error
    }
    return {
      artifactPath: root,
      async cleanup() {
        return { status: 'verified', sidecar: destination }
      }
    }
  }
}
