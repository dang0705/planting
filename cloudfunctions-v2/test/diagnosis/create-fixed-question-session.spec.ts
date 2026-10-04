import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, vi } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'
import { createFixedQuestionSessionInTransaction } from '../../src/diagnosis/application/create-fixed-question-session.js'
import type { TransactionExecutionContext } from '../../src/foundation/database/transaction-runner.js'
import type { PersistentQuestionSession } from '../../src/diagnosis/repository/mysql-diagnosis-question-snapshot-repository.js'
/** unit_fake / L3：独立发布及持久化端口替身；不证明数据库或HTTP。 */
const content = JSON.parse(
  readFileSync(
    join(findProjectRoot(), 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'),
    'utf8'
  )
)
const snapshot = lockQuestionPackageSnapshot({
  questionPackageReleaseRef: 'bpr_question123',
  mode: 'yellow_leaf',
  questionCount: 4,
  packageQuestions: content.fixed.yellow_leaf
})
const input = {
  userRef: 'usr_owner123',
  userPlantRef: 'upl_owner123',
  mode: 'yellow_leaf' as const,
  startedAtMs: 1500
}
function harness() {
  const published = vi.fn(async () => ({ status: 'available' as const, snapshot }))
  const append = vi.fn(
    async (_tx: TransactionExecutionContext, _value: PersistentQuestionSession) =>
      'created' as 'created' | 'not_found'
  )
  const read = vi.fn(
    async (_tx: TransactionExecutionContext, _user: string, _plant: string, _ref: string) => ({
      status: 'found' as const,
      snapshot
    })
  )
  const run = createFixedQuestionSessionInTransaction({ published, append, read })
  return { published, append, read, run }
}
test('服务端生成引用，在同一事务锁定发布、创建并读回', async () => {
  const f = harness(),
    tx = { transactionContext: true as const }
  const result = await f.run(tx, input)
  expect(result.status).toBe('created')
  if (result.status !== 'created') {
    throw new Error('未创建')
  }
  expect(result.diagnosisRef).toMatch(/^dia_[A-Za-z0-9_-]{8,}$/u)
  expect(result.snapshot).toEqual(snapshot)
  expect(f.published).toHaveBeenCalledWith(tx, input.mode, input.startedAtMs)
  expect(f.append.mock.calls[0]![0]).toBe(tx)
  expect(f.read.mock.calls[0]![0]).toBe(tx)
})
test('发布未准入不创建任何会话', async () => {
  const f = harness()
  f.published.mockResolvedValueOnce({ status: 'unavailable' } as any)
  expect(await f.run({ transactionContext: true }, input)).toEqual({ status: 'unavailable' })
  expect(f.append).not.toHaveBeenCalled()
})
test('归属失败不读回或伪装成功', async () => {
  const f = harness()
  f.append.mockResolvedValueOnce('not_found')
  expect(await f.run({ transactionContext: true }, input)).toEqual({ status: 'not_found' })
  expect(f.read).not.toHaveBeenCalled()
})
test('读回内容摘要不一致必须抛错供事务回滚', async () => {
  const f = harness()
  f.read.mockResolvedValueOnce({
    status: 'found',
    snapshot: { ...snapshot, snapshotSha256: 'a'.repeat(64) }
  })
  await expect(f.run({ transactionContext: true }, input)).rejects.toThrow()
})
test('同摘要字段但读回正文变化也必须回滚', async () => {
  const f = harness()
  const copied = structuredClone(snapshot)
  Object.assign(copied.snapshot.packageQuestions[0]!, { text: '被篡改的正文' })
  f.read.mockResolvedValueOnce({ status: 'found', snapshot: copied })
  await expect(f.run({ transactionContext: true }, input)).rejects.toThrow()
})
