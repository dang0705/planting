import { describe, expect, it } from 'vitest'
import { lockTemporaryCareResult } from '../../src/care/domain/temporary-care-result-record.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'

/** Expected：统一计划临时案例XOR、不可变快照及存储合同；L1 unit_fake，无数据库或平台验真。 */
const fixture = () => ({
  owner: { kind: 'authenticated' as const, userRef: 'usr_owner', caseRef: 'ephemeral_owner' },
  sessionRef: 'care_session', resultRef: 'care_result', environmentContractVersion: 'care-environment-foundation/v2',
  inputManifest: { soil: { state: 'unknown' }, lastWateringAt: null },
  algorithmReleaseManifest: { watering: null }, derivations: {},
  result: { capabilityType: 'watering', contractVersion: 'care-capability-result/v1',
    detailsSchemaVersion: 'watering-assessment/v1', status: 'temporarily_unavailable',
    generatedAt: '2026-10-08T00:00:00.000Z', validUntil: null, recommendedActions: [] },
  generatedAtMs: 1791417600000, expiresAtMs: 1791504000000,
})

describe('临时养护结果结构锁定｜unit_fake', () => {
  it('输入先复制并按四份正文各自生成摘要，未知浇水不转成零', () => {
    const input = fixture(), locked = lockTemporaryCareResult(input)
    input.inputManifest.soil.state = 'wet'
    expect(locked.inputManifest).toEqual({ soil: { state: 'unknown' }, lastWateringAt: null })
    for (const field of ['inputManifest', 'algorithmReleaseManifest', 'derivations', 'result'] as const) {
      expect(locked.hashes[field]).toBe(calculateCanonicalJsonSha256(locked[field]))
    }
    expect(locked.result.status).toBe('temporarily_unavailable')
    expect(Object.isFrozen(locked.inputManifest.soil)).toBe(true)
  })
  it('两类归属不能混填，未知类别、额外身份字段及空引用均拒绝', () => {
    for (const owner of [null, { kind: 'guest', guestSessionRef: 'g', caseRef: 'c', userRef: 'u' },
      { kind: 'authenticated', userRef: '', caseRef: 'c' }, { kind: 'other', userRef: 'u', caseRef: 'c' }]) {
      expect(() => lockTemporaryCareResult({ ...fixture(), owner } as never)).toThrow()
    }
    expect(lockTemporaryCareResult({ ...fixture(), owner: { kind: 'guest', guestSessionRef: 'g', caseRef: 'c' } }).owner.kind).toBe('guest')
  })
  it('非法时间、期限倒置和结果生成时间不匹配拒绝', () => {
    for (const patch of [{ generatedAtMs: NaN }, { expiresAtMs: 1791417600000 },
      { generatedAtMs: -1 }, { expiresAtMs: Number.MAX_SAFE_INTEGER },
      { result: { ...fixture().result, generatedAt: '2026-10-09T00:00:00.000Z' } }]) {
      expect(() => lockTemporaryCareResult({ ...fixture(), ...patch })).toThrow()
    }
  })
  it('非完整JSON、数组顶层、空合同与非浇水结果拒绝', () => {
    for (const patch of [{ inputManifest: null }, { derivations: [] }, { inputManifest: { value: NaN } },
      { algorithmReleaseManifest: { date: new Date() } }, { environmentContractVersion: '' },
      { result: { ...fixture().result, contractVersion: '' } },
      { result: { ...fixture().result, capabilityType: 'diagnosis' } }]) {
      expect(() => lockTemporaryCareResult({ ...fixture(), ...patch } as never)).toThrow()
    }
  })
})
