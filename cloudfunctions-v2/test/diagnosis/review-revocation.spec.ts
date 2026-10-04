import { expect, test } from 'vitest'
import { lockDiagnosisReviewRevocation } from '../../src/diagnosis/domain/diagnosis-review-revocation.js'
import { createRevokeDiagnosisReview } from '../../src/diagnosis/application/revoke-diagnosis-review.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
/** L1/unit_fake：Expected来自review-revocation-contract.md与010；事务端口替身，不证明SQL/CMS。 */
const input = {
  revocationRef: 'revoke-fixture',
  reviewRef: 'review-fixture',
  contentSha256: 'a'.repeat(64),
  reviewProtocolVersion: 'fixture/v1',
  operatorRefHash: 'b'.repeat(64),
  reasonZh: '撤销结构制品批准',
  reviewEvidenceRef: null
}
test('完整命令锁定且摘要稳定；证据与理由变化改变摘要', () => {
  const a = lockDiagnosisReviewRevocation(input),
    b = lockDiagnosisReviewRevocation({ ...input })
  expect(a.requestSha256).toBe(b.requestSha256)
  expect(Object.isFrozen(a.command)).toBe(true)
  expect(lockDiagnosisReviewRevocation({ ...input, reasonZh: '不同理由' }).requestSha256).not.toBe(
    a.requestSha256
  )
  expect(
    lockDiagnosisReviewRevocation({ ...input, reviewEvidenceRef: 'evidence-fixture' }).requestSha256
  ).not.toBe(a.requestSha256)
  for (const v of [
    { ...input, reviewRef: '' },
    { ...input, operatorRefHash: 'secret' },
    { ...input, reviewProtocolVersion: undefined },
    { ...input, reasonZh: ' ' },
    { ...input, extra: true },
    { ...input, reviewEvidenceRef: 'x'.repeat(192) }
  ]) {
    expect(() => lockDiagnosisReviewRevocation(v)).toThrow(TypeError)
  }
})
function harness(
  receipt:
    | { status: 'not_found' }
    | { status: 'revoked'; revocationRef: string; revokedAtMs: number },
  commitUnknown = false
) {
  const calls: string[] = []
  const result = {
    status: 'revoked' as const,
    revocationRef: input.revocationRef,
    revokedAtMs: 2000
  }
  const app = createRevokeDiagnosisReview({
    driver: {
      beginTransaction: () => ({ transactionContext: true as const }),
      commitTransaction: () => {
        calls.push('commit')
        if (commitUnknown) {
          throw new DatabaseCommitResultUnknownError('fixture')
        }
      },
      rollbackTransaction: () => {
        calls.push('rollback')
      },
      recordRollbackFailure: () => {}
    },
    repository: {
      readReceipt: async () => {
        calls.push('receipt')
        return receipt
      },
      append: async () => {
        calls.push('append')
        return result
      },
      reconcile: async () => {
        calls.push('reconcile')
        return result
      }
    },
    now: () => {
      calls.push('clock')
      return 2000
    }
  })
  return { app, calls, result }
}
test('首次写入经过事务并读回；重放不再取时间或写入', async () => {
  const first = harness({ status: 'not_found' })
  expect(await first.app(input)).toEqual(first.result)
  expect(first.calls).toEqual(['receipt', 'clock', 'append', 'commit'])
  const replay = harness(first.result)
  expect(await replay.app(input)).toEqual(first.result)
  expect(replay.calls).toEqual(['receipt', 'commit'])
})
test('提交未知仅读回收据，不在原事务回滚或重跑写入', async () => {
  const h = harness({ status: 'not_found' }, true)
  expect(await h.app(input)).toEqual(h.result)
  expect(h.calls).toEqual(['receipt', 'clock', 'append', 'commit', 'reconcile'])
})
test('非法命令在获取事务之前拒绝', async () => {
  const h = harness({ status: 'not_found' })
  await expect(h.app({ ...input, reasonZh: '' })).rejects.toThrow(TypeError)
  expect(h.calls).toEqual([])
})
