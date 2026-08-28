import { defineFixture } from '../../../packages/miniprogram-e2e/src/contracts/index.mjs'

/**
 * Diagnostic leaves may use deterministic UI/account substitutes, but the
 * lifecycle is still explicit and auditable.  Live leaves do not use this
 * fixture; their product scenarios own their real API mutations and restore
 * them with their existing read-back assertions.
 */
export const plantingFixtures = {
  diagnostic_runtime: defineFixture({
    id: 'diagnostic_runtime',
    async prepare(context) {
      return {
        status: 'prepared',
        dataMode: context.dataMode,
        runtimeProjectPath: context.session?.runtimeProjectPath || null
      }
    },
    async verify({ prepare }) {
      return { verified: prepare?.status === 'prepared' }
    },
    async cleanup({ prepare }) {
      return {
        status: 'restored',
        readback: { verified: true, source: 'diagnostic_runtime_lifecycle' },
        prepared: prepare?.status || null
      }
    }
  })
}
