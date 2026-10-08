import { describe, expect, it, vi } from 'vitest'
import { saveTemporaryCareResult } from '../../src/care/application/save-temporary-care-result.js'
import { lockTemporaryCareResult } from '../../src/care/domain/temporary-care-result-record.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'

/** Expected：统一计划的原结果重放、提交未知只读核对、归属及公开脱敏；L3 unit_fake，替换数据库边界。 */
const input = () => ({ owner: { kind: 'authenticated' as const, userRef: 'usr', caseRef: 'case' },
  sessionRef: 'session', resultRef: 'result', environmentContractVersion: 'care-environment-foundation/v2',
  inputManifest: { lastWateringAt: null }, algorithmReleaseManifest: { watering: null }, derivations: {},
  result: { capabilityType: 'watering', contractVersion: 'care-capability-result/v1', detailsSchemaVersion: 'watering-assessment/v1',
    generatedAt: '1970-01-01T00:00:01.000Z', status: 'temporarily_unavailable', amountMl: null },
  generatedAtMs: 1000, expiresAtMs: 2000 })
/** 仅替换存储和提交故障；已验真身份、已存在案例及策略期限由独立夹具显式提供。 */
function ports() {
  const record = lockTemporaryCareResult(input())
  const repository = { append: vi.fn().mockResolvedValue('created'),
    read: vi.fn().mockResolvedValue({ status: 'not_found' }) }
  const driver = { beginTransaction: vi.fn().mockResolvedValue({ transactionContext: true }),
    commitTransaction: vi.fn().mockResolvedValue(undefined), rollbackTransaction: vi.fn().mockResolvedValue(undefined),
    recordRollbackFailure: vi.fn().mockResolvedValue(undefined) }
  return { repository, driver, record, now: () => 1000 }
}
describe('临时养护结果保存用例｜unit_fake', () => {
  it('写后读回才返回result，不公开快照、版本清单、内部引用或SHA', async () => {
    const p = ports(); p.repository.read.mockResolvedValueOnce({ status: 'not_found' }).mockResolvedValueOnce({ status: 'found', record: p.record })
    expect(await saveTemporaryCareResult(p, input())).toEqual({ status: 'stored', result: input().result })
    expect(p.repository.append).toHaveBeenCalledTimes(1); expect(p.driver.commitTransaction).toHaveBeenCalledTimes(1)
  })
  it('相同原引用与内容直接读回；不同内容冲突，不覆盖原结果', async () => {
    const p = ports(); p.repository.read.mockResolvedValue({ status: 'found', record: p.record })
    expect(await saveTemporaryCareResult(p, input())).toEqual({ status: 'stored', result: input().result })
    expect(await saveTemporaryCareResult(p, { ...input(), inputManifest: { lastWateringAt: 100 } })).toEqual({ status: 'conflict' })
    expect(p.repository.append).not.toHaveBeenCalled(); expect(p.driver.beginTransaction).not.toHaveBeenCalled()
  })
  it.each([true, false])('提交响应丢失只读核对，无自动重写或回滚；已落盘=%s', async committed => {
    const p = ports(); p.driver.commitTransaction.mockRejectedValue(new DatabaseCommitResultUnknownError('fixture'))
    p.repository.read.mockResolvedValueOnce({ status: 'not_found' }).mockResolvedValueOnce(committed ? { status: 'found', record: p.record } : { status: 'not_found' })
    expect(await saveTemporaryCareResult(p, input())).toEqual(committed ? { status: 'stored', result: input().result } : { status: 'unavailable' })
    expect(p.repository.append).toHaveBeenCalledTimes(1); expect(p.driver.rollbackTransaction).not.toHaveBeenCalled()
  })
  it('不存在归属不会以本地计算结果冒充保存成功', async () => {
    const p = ports(); p.repository.append.mockResolvedValue('not_found')
    expect(await saveTemporaryCareResult(p, input())).toEqual({ status: 'not_found' })
  })
  it('损坏或读回失败返回不可用，不泄漏错误或重算历史', async () => {
    const p = ports(); p.repository.read.mockResolvedValue({ status: 'invalid_record' })
    expect(await saveTemporaryCareResult(p, input())).toEqual({ status: 'unavailable' })
    p.repository.read.mockRejectedValue(new Error('internal SQL secret'))
    expect(await saveTemporaryCareResult(p, input())).toEqual({ status: 'unavailable' })
    expect(p.repository.append).not.toHaveBeenCalled()
  })
  it('已提交但读回缺行不返回成功；普通写错误不盲重发', async () => {
    const p = ports()
    expect(await saveTemporaryCareResult(p, input())).toEqual({ status: 'unavailable' })
    const q = ports(); q.repository.append.mockRejectedValue(new Error('fixture failure'))
    expect(await saveTemporaryCareResult(q, input())).toEqual({ status: 'unavailable' })
    expect(q.repository.append).toHaveBeenCalledTimes(1)
  })
})
