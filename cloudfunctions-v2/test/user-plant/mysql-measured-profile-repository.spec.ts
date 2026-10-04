import { expect, test, vi } from 'vitest'
import { createMysqlMeasuredProfileRepository } from '../../src/user-plant/repository/mysql-measured-profile-repository.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'

/** L1/unit_fake：Expected来自当前内部持久化合同及原归属/乐观锁硬规则。
 * 真实经过Repository、严格测量准入和参数绑定；替换SQL连接，不证明数据库或HTTP。 */
const pot = { actualInnerPotConfirmed: true, drainageAvailable: true, potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 12 }
const input = { userRef: 'usr_profile_owner01', userPlantRef: 'upl_profile_plant01', expectedVersion: 1, nickname: '小青', measuredPot: pot, profileVersion: 'user-plant-profile/v1', occurredAtMs: 2000 }
const plant = { plant_id: '11', user_id: '22', version: 1, updated_at_ms: '1000' }
const profile = { nickname: '旧昵称', pot_profile_json: { substrate: { professional: 0.3 }, measuredPot: pot }, profile_completeness_version: 'user-plant-profile/v1', profile_completed_at_ms: '1500', version: 2, created_at_ms: '1000', updated_at_ms: '1500', _openid: '' }
function fixture(rows: readonly (readonly Record<string, unknown>[])[]) {
  const query = vi.fn<Mysql2QueryConnection['query']>()
  for (const row of rows) { query.mockResolvedValueOnce(row) }
  const execute = vi.fn<Mysql2QueryConnection['execute']>().mockResolvedValue({ affectedRows: 1, insertId: 1 })
  const connection: Mysql2QueryConnection = { query, execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn() }
  return { query, execute, tx: { transactionContext: true as const, connection }, repository: createMysqlMeasuredProfileRepository() }
}
test('联合归属未找到或版本过期，零写入', async () => {
  const missing = fixture([[]])
  expect(await missing.repository.save(missing.tx, input)).toEqual({ status: 'not_found' })
  expect(missing.execute).not.toHaveBeenCalled()
  const stale = fixture([[{ ...plant, version: 2 }]])
  expect(await stale.repository.save(stale.tx, input)).toEqual({ status: 'version_conflict' })
  expect(stale.execute).not.toHaveBeenCalled()
})
test('保存已有档案后读回，不泄露内部键；更新只包含明确测量子结构', async () => {
  const f = fixture([[plant], [profile], [{ nickname: '小青', pot_profile_json: { measuredPot: pot }, version: 2 }]])
  expect(await f.repository.save(f.tx, input)).toEqual({ status: 'saved', userPlantRef: input.userPlantRef, version: 2, nickname: '小青', measuredPot: pot })
  expect(f.execute).toHaveBeenCalledTimes(2)
  expect(f.execute.mock.calls[1]?.[0]).toContain('JSON_SET')
  expect(f.execute.mock.calls[1]?.[0]).not.toContain('profile_completed_at_ms=')
})
test('非法昵称、测量、版本或策略引用在SQL前拒绝', async () => {
  for (const value of [{ ...input, nickname: '植'.repeat(81) }, { ...input, measuredPot: { ...pot, waterRetention: 9 } }, { ...input, expectedVersion: 0 }, { ...input, profileVersion: '' }]) {
    const f = fixture([])
    await expect(f.repository.save(f.tx, value)).rejects.toThrow(TypeError)
    expect(f.query).not.toHaveBeenCalled()
  }
})
test('80个Unicode码点可接受，异步等待不改变锁定昵称和测量', async () => {
  const nickname = '🌱'.repeat(80), mutable = { ...input, nickname, measuredPot: { ...pot } }
  const f = fixture([[plant], [], [{ nickname, pot_profile_json: { measuredPot: pot }, version: 2 }]])
  const result = f.repository.save(f.tx, mutable)
  mutable.nickname = '变更'; mutable.measuredPot.potHeightCm = 100
  expect(await result).toMatchObject({ status: 'saved', nickname, measuredPot: pot })
})
test('已有档案损坏或版本容量耗尽，零写入', async () => {
  for (const value of [{ ...profile, _openid: 'invalid-subject' }, { ...profile, pot_profile_json: [] }, { ...profile, version: 4294967295 }]) {
    const f = fixture([[plant], [value]])
    expect(await f.repository.save(f.tx, input)).toEqual({ status: 'unavailable' })
    expect(f.execute).not.toHaveBeenCalled()
  }
})
test('写后读回不一致抛错，不能返回确定成功', async () => {
  const f = fixture([[plant], [], [{ nickname: '其他值', pot_profile_json: { measuredPot: pot }, version: 2 }]])
  await expect(f.repository.save(f.tx, input)).rejects.toThrow()
})
