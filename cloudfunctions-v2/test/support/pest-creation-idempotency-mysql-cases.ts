import { expect, test } from 'vitest'
import type { Connection } from 'mysql2/promise'
import { createIdempotentPestDiagnosisCreationService } from '../../src/diagnosis/application/idempotent-create-diagnosis.js'
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import {
  pestCreationMysqlHarness,
  pestCreationMysqlInput
} from './pest-creation-idempotency-mysql.js'

/** 使用调用方已经创建的隔离库与原子用例，注册明确的共享幂等验收场景。 */
export function registerPestIdempotencyMysqlTests(dependencies: {
  readonly atomicDependencies: () => {
    source: Parameters<typeof pestCreationMysqlHarness>[0]
    run: Parameters<typeof pestCreationMysqlHarness>[1]
  }
  readonly counts: () => Promise<unknown>
  readonly database: () => Connection
}) {
  const { atomicDependencies, counts } = dependencies
  /** unit_real_data / L3：实际资产→活动发布→选题→会话/视觉→共享账本；准备与公开投影是明确替身。 */
  test('真实共享幂等重放仅保存一组会话和视觉，不读取新发布', async () => {
    const { source, run: create } = atomicDependencies()
    let calls = 0
    const h = pestCreationMysqlHarness(source, async (tx, value) => {
      calls += 1
      return create(tx, value)
    })
    const request = pestCreationMysqlInput('pest-once'),
      before = await counts(),
      first = await h.run(request)
    expect(first.status).toBe(200)
    await dependencies
      .database()
      .query(
        "UPDATE active_business_policy_releases SET active_content_sha256=REPEAT('f',64) WHERE policy_code='dynamic_pest_question_packages'"
      )
    try {
      expect(await h.run({ ...request, startedAtMs: 1600 })).toEqual(first)
      expect(calls).toBe(1)
    } finally {
      await dependencies
        .database()
        .query(
          'UPDATE active_business_policy_releases a JOIN business_policy_releases r ON r.id=a.release_internal_id SET a.active_content_sha256=r.content_sha256'
        )
    }
    const after = await counts()
    expect(after).toEqual([
      {
        sessions: Number((before as any)[0].sessions) + 1,
        visuals: Number((before as any)[0].visuals) + 1
      }
    ])
    expect(
      (
        await dependencies
          .database()
          .execute(
            'SELECT state,response_status FROM http_idempotency_records WHERE idempotency_key_hash=?',
            [request.idempotency.idempotencyKeyHash]
          )
      )[0]
    ).toEqual([{ state: 'completed', response_status: 200 }])
    expect(JSON.stringify(first)).not.toContain('private-file-never-public')
  })
  test('真实同键换资产返回409，不追加会话和视觉', async () => {
    const { source, run: create } = atomicDependencies(),
      h = pestCreationMysqlHarness(source, create)
    expect((await h.run(pestCreationMysqlInput('pest-conflict'))).status).toBe(200)
    const before = await counts()
    expect((await h.run(pestCreationMysqlInput('pest-conflict', 'upa_other123'))).status).toBe(409)
    expect(await counts()).toEqual(before)
  })
  test('真实并发同键只有一次创建，两个调用读回同一响应', async () => {
    const { source, run: create } = atomicDependencies()
    let calls = 0
    const h = pestCreationMysqlHarness(source, async (tx, value) => {
      calls += 1
      return create(tx, value)
    })
    const request = pestCreationMysqlInput('pest-concurrent'),
      before = await counts()
    const results = await Promise.all([h.run(request), h.run(request)])
    expect(results[0]!.status).toBe(200)
    expect(results[1]).toEqual(results[0])
    expect(calls).toBe(1)
    expect(await counts()).toEqual([
      {
        sessions: Number((before as any)[0].sessions) + 1,
        visuals: Number((before as any)[0].visuals) + 1
      }
    ])
  })
  test('真实首次响应保存后故障回滚会话、视觉和账本', async () => {
    const { source, run: create } = atomicDependencies(),
      h = pestCreationMysqlHarness(source, create)
    const original = h.dependencies.idempotencyRepository.completionFirstResult
    const run = createIdempotentPestDiagnosisCreationService({
      ...h.dependencies,
      idempotencyRepository: {
        ...h.dependencies.idempotencyRepository,
        completionFirstResult: async (...args: Parameters<typeof original>) => {
          await original(...args)
          throw new Error('故障探针私有原文')
        }
      }
    })
    const request = pestCreationMysqlInput('pest-rollback'),
      before = await counts(),
      response = await run(request)
    expect(response.status).toBe(503)
    expect(JSON.stringify(response)).not.toContain('故障探针私有原文')
    expect(await counts()).toEqual(before)
    expect(
      (
        await dependencies
          .database()
          .execute(
            'SELECT COUNT(*) AS n FROM http_idempotency_records WHERE idempotency_key_hash=?',
            [request.idempotency.idempotencyKeyHash]
          )
      )[0]
    ).toEqual([{ n: 0 }])
  })
  test('真实提交后确认丢失使用新连接只读对账，不再次创建', async () => {
    const { source, run: create } = atomicDependencies()
    let calls = 0
    const h = pestCreationMysqlHarness(source, async (tx, value) => {
        calls += 1
        return create(tx, value)
      }),
      commit = h.dependencies.driver.commitTransaction
    const run = createIdempotentPestDiagnosisCreationService({
      ...h.dependencies,
      driver: {
        ...h.dependencies.driver,
        commitTransaction: async tx => {
          await commit(tx)
          throw new DatabaseCommitResultUnknownError('确认丢失')
        }
      }
    })
    const request = pestCreationMysqlInput('pest-unknown'),
      first = await run(request)
    expect(first.status).toBe(200)
    expect(await h.run(request)).toEqual(first)
    expect(calls).toBe(1)
  })
}
