import { assertContract } from '../contracts/index.mjs'
import { errorEvidence } from '../reporting/report.mjs'

/** @param {object} options */
export async function prepareFixtures({ fixtures, names, context, dataMode }) {
  const prepared = []
  for (const name of names || []) {
    const fixture = fixtures[name]
    assertContract(fixture?.kind === 'mp-e2e-fixture', `fixture is not registered: ${name}`)
    try {
      const prepare = await fixture.prepare(context)
      const verify = fixture.verify ? await fixture.verify({ ...context, prepare }) : { verified: true }
      if (verify?.verified !== true) {
        const error = new Error(`fixture verify failed: ${name}`)
        error.code = 'mp_e2e_fixture_verify_failed'
        error.details = verify
        throw error
      }
      prepared.push({ fixture, name, prepare, verify })
    } catch (error) {
      return { status: 'blocked', prepared, failure: { fixture: name, error: errorEvidence(error) } }
    }
  }
  return { status: 'ready', prepared, dataMode }
}

/** @param {object} options */
export async function cleanupFixtures({ prepared, context, dataMode }) {
  const cleanup = []
  for (const entry of [...prepared].reverse()) {
    try {
      const result = await entry.fixture.cleanup({ ...context, prepare: entry.prepare, verify: entry.verify })
      if (dataMode === 'live_real' && result?.readback?.verified !== true) {
        const error = new Error(`fixture cleanup lacks verified readback: ${entry.name}`)
        error.code = 'mp_e2e_fixture_readback_missing'
        error.details = result
        throw error
      }
      cleanup.push({ fixture: entry.name, result })
    } catch (error) {
      return { status: 'cleanup_failed', cleanup, failure: { fixture: entry.name, error: errorEvidence(error) } }
    }
  }
  return { status: 'ready', cleanup }
}
