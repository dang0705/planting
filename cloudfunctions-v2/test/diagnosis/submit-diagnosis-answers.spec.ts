import { describe, expect, it, vi } from 'vitest'
import { createSubmitDiagnosisAnswersService } from '../../src/diagnosis/application/submit-diagnosis-answers.js'
import { lockQuestionPackageSnapshot } from '../../src/diagnosis/domain/question-package-snapshot.js'

// L1 unit_fake：Expected来自answer-persistence-contract.md及整包证据合同；事务/SQL端口均替换，不证明真实数据库。
const locked = lockQuestionPackageSnapshot({
  questionPackageReleaseRef: 'review/v1',
  mode: 'yellow_leaf',
  questionCount: 1,
  packageQuestions: [
    { questionKey: 'q', options: [{ optionKey: 'unknown' }, { optionKey: 'normal' }] }
  ]
})
function fixture() {
  const tx = { transactionContext: true as const }
  const driver = {
    beginTransaction: vi.fn(async () => tx),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
    recordRollbackFailure: vi.fn()
  }
  const rows: { questionKey: string; body: unknown }[] = []
  const repository = {
    lockOwned: vi.fn(async () => ({
      status: 'found' as const,
      session: { internalId: '1', status: 'active', snapshot: locked }
    })),
    readAnswers: vi.fn(async () => structuredClone(rows)),
    appendAnswers: vi.fn(
      async (
        _tx: unknown,
        _session: unknown,
        items: readonly { questionKey: string; body: unknown }[]
      ) => {
        rows.push(...structuredClone(items))
      }
    )
  }
  return {
    driver,
    repository,
    rows,
    run: createSubmitDiagnosisAnswersService({ driver, repository }),
    input: {
      userRef: 'usr',
      userPlantRef: 'upl',
      diagnosisRef: 'diag',
      occurredAtMs: 1000,
      submitted: {
        requestMode: 'answer_submit',
        answers: [{ questionKey: 'q', optionKey: 'unknown' }]
      }
    }
  }
}
describe('首次整包答案应用用例', () => {
  it('整包追加并原事务读回；公开候选结果不暴露内部引用或摘要', async () => {
    const f = fixture()
    expect(await f.run(f.input)).toEqual({ status: 'recorded', answerCount: 1 })
    expect(f.repository.appendAnswers).toHaveBeenCalledTimes(1)
    expect(f.repository.readAnswers).toHaveBeenCalledTimes(2)
    expect(f.driver.commitTransaction).toHaveBeenCalledTimes(1)
    expect(f.rows[0]!.body).toMatchObject({
      contractVersion: 'diagnosis-answer-evidence/v1',
      questionKey: 'q',
      optionKey: 'unknown',
      questionSnapshotSha256: locked.snapshotSha256
    })
  })
  it('相同内容重复提交不追加，不同内容不覆盖', async () => {
    const f = fixture()
    await f.run(f.input)
    expect(await f.run(f.input)).toEqual({ status: 'replayed', answerCount: 1 })
    expect(
      await f.run({
        ...f.input,
        submitted: {
          requestMode: 'answer_submit',
          answers: [{ questionKey: 'q', optionKey: 'normal' }]
        }
      })
    ).toEqual({ status: 'conflict' })
    expect(f.repository.appendAnswers).toHaveBeenCalledTimes(1)
  })
  it('跨用户归属拒绝后不读取答案或写入', async () => {
    const f = fixture()
    f.repository.lockOwned.mockResolvedValueOnce({ status: 'not_found' } as never)
    expect(await f.run(f.input)).toEqual({ status: 'not_found' })
    expect(f.repository.appendAnswers).not.toHaveBeenCalled()
  })
  it('无效成员与未填写复合题不能形成部分答案', async () => {
    const f = fixture()
    expect(
      await f.run({ ...f.input, submitted: { requestMode: 'answer_submit', answers: [] } })
    ).toEqual({ status: 'invalid_answers' })
    expect(f.repository.appendAnswers).not.toHaveBeenCalled()
  })
  it('读回损坏或写入失败抛错并由事务回滚，不能返回已保存', async () => {
    const f = fixture()
    f.repository.readAnswers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ questionKey: 'q', body: { bad: true } }])
    await expect(f.run(f.input)).rejects.toThrow('答案持久化读回不一致')
    expect(f.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
    const g = fixture()
    g.repository.appendAnswers.mockRejectedValueOnce(new Error('数据库写入失败'))
    await expect(g.run(g.input)).rejects.toThrow('数据库写入失败')
    expect(g.driver.rollbackTransaction).toHaveBeenCalledTimes(1)
  })
  it('已完成会话不能首次写答案，损坏半套答案不能补齐', async () => {
    const f = fixture()
    f.repository.lockOwned.mockResolvedValueOnce({
      status: 'found',
      session: { internalId: '1', status: 'completed', snapshot: locked }
    })
    expect(await f.run(f.input)).toEqual({ status: 'session_not_active' })
    const g = fixture()
    g.rows.push({ questionKey: 'extra', body: {} })
    expect(await g.run(g.input)).toEqual({ status: 'conflict' })
  })
  it.each([-1, NaN, Infinity, 1.5])('非法服务端时刻%s在任何SQL前拒绝', async occurredAtMs => {
    const f = fixture()
    await expect(f.run({ ...f.input, occurredAtMs })).rejects.toThrow('答案时间非法')
    expect(f.driver.beginTransaction).not.toHaveBeenCalled()
  })
})
