import { readQaAuthManifest, ensureQaAuthAvailable } from '../../../scripts/qa/qa-auth-coordinator.mjs'
import { resolveQaDevToolsProfile } from '../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'

/**
 * The adapter owns the actual profile launch. This provider only leases the
 * persistent, isolated QA profile; it never opens or mutates the daily one.
 */
export const plantingDevToolsProfileProvider = {
  async acquire() {
    let auth = readQaAuthManifest()
    if (!auth.material_ready) {
      ensureQaAuthAvailable({ qaProfile: resolveQaDevToolsProfile().profile })
      auth = readQaAuthManifest()
    }
    if (!auth.material_ready) {
      return {
        status: 'blocked',
        code: auth.code || 'qa_devtools_auth_required',
        reason: 'Planting QA profile is not authenticated',
        evidence: [{ type: 'profile_auth', value: auth }]
      }
    }
    const profile = resolveQaDevToolsProfile()
    const leaseId = `planting-qa-profile-${Date.now()}-${process.pid}`
    return {
      status: 'ready',
      leaseId,
      kind: 'wechat-isolated-persistent-qa-profile',
      home: profile.home,
      profile: profile.profile,
      auth,
      evidence: [{ type: 'profile_policy', value: { kind: 'isolated_persistent_qa', dailyProfileTouched: false, profile: profile.profile } }],
      async release() {
        return { status: 'released', leaseId, dailyProfileTouched: false }
      }
    }
  }
}
