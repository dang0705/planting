import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { createVisualDiagnosisModule } from '../../src/diagnosis/visual/visual-module.js'
import { createDiagnosisMaintenanceSweepFromSource } from '../../src/diagnosis/visual/visual-sweep-module.js'
import { RUNTIME_PARAMETERS } from '../../src/configuration/runtime-parameters.js'
import { calculateVisualRecordSha256 } from '../../src/diagnosis/visual/domain/visual-session-record.js'
import {
  toSqlParameters,
  withReadConnection
} from '../../src/foundation/database/mysql2-connection-source.js'
import {
  createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository,
  createMysqlHttpIdempotencyRepository,
  type HttpIdempotencySqlRow
} from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import { ModelProviderError } from '../../src/diagnosis/provider/visual-model-registry.js'
import {
  capabilitySnapshot,
  generationSnapshot,
  ownerPrincipal,
  promptRelease,
  validModelText
} from '../diagnosis/visual/support/visual-fakes.js'
import {
  startVisualDiagnosisMysqlHarness,
  visualHarnessRefs as refs,
  type VisualDiagnosisMysqlHarness
} from './support/visual-diagnosis-mysql-harness.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnd TDD 条款（本机真实库：并发重复提交、额度不足、失败释放、回放一致）；
 * diagnosis-visual-api.md §2.2（同键同参只建一个诊断、只预占一次；余额不足 409 且不创建诊断）、§2.3 与 §3
 * （完成按 ceil(costMicros/800) 结算并释放剩余；模型失败释放全部；回放返回当时保存的结构化结果）；
 * care-points-and-ai-quota.md（批次守恒：granted = available + reserved + consumed）。
 * 测试层次：unit_real_data（本机 Docker MySQL 8.4 + 全量 DDL + 真实幂等、额度预占/结算 Repository 与视觉诊断 Repository）；
 * 替换的边界：能力快照、策略读取、云存储、图片压缩与模型客户端（假实现，不发起真实调用）；不覆盖 CloudBase 网关与真实百炼。
 */
const now = Date.UTC(2026, 9, 11, 8, 0, 0)
let harness: VisualDiagnosisMysqlHarness
let modelMode: 'ok' | 'fail' = 'ok'
let clock = now
const scheduled: (() => Promise<unknown>)[] = []

function module() {
  const source = harness.source
  const ledger = createMysqlHttpIdempotencyRepository<never>({
    executeQuery: async (tx: any, sql, parameters) =>
      (await tx.connection.query(
        sql,
        toSqlParameters(parameters)
      )) as unknown as readonly HttpIdempotencySqlRow[],
    executeWrite: (tx: any, sql, parameters) =>
      tx.connection.execute(sql, toSqlParameters(parameters))
  })
  const commitUnknownReadOnlyRepository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository(
    {
      executeQuery: (sql, parameters) =>
        withReadConnection(
          source,
          async connection =>
            (await connection.query(
              sql,
              toSqlParameters(parameters)
            )) as unknown as readonly HttpIdempotencySqlRow[]
        )
    }
  )
  const assetRules = {
    contractVersion: 'user-plant-asset-rules/v1',
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxImageBytes: 5_242_880,
    replacedCoverCleanupDays: 7
  } as const
  return createVisualDiagnosisModule({
    source,
    driver: harness.driver,
    idempotency: {
      driver: harness.driver,
      idempotencyRepository: ledger as never,
      commitUnknownReadOnlyRepository
    },
    readHttpWriteRules: async () => ({
      contractVersion: 'http-request-write-policy/v2',
      jsonBodyLimitBytes: 1_048_576,
      idempotencyRetentionHours: 168
    }),
    readGenerationPolicy: async () => generationSnapshot,
    readAssetRules: async () => assetRules,
    readListRules: async () => ({
      contractVersion: 'user-plant-list-rules/v1',
      userPlantListPageSize: { default: 20, max: 50 },
      timelinePageSize: { default: 20, max: 50 }
    }),
    readCapabilitySnapshot: async () => capabilitySnapshot(['USER_DIAGNOSIS_VISUAL']),
    readPromptRelease: async () => promptRelease,
    readReservationTtlSeconds: async () => 900,
    readContextSummary: async () => null,
    storage: {
      getDownloadUrl: async id => `https://cdn.example.invalid/${encodeURIComponent(id)}`,
      download: async () => new Uint8Array([0xff, 0xd8, 0xff])
    },
    uploader: { upload: async objectId => ({ cloudObjectId: `cloud://env.bucket/${objectId}` }) },
    normalizer: {
      normalize: async () => ({
        bytes: Buffer.from([1]),
        mime: 'image/jpeg',
        width: 1024,
        height: 768
      })
    },
    createModelClient: () => ({
      complete: async modelCode => {
        if (modelMode === 'fail') {
          throw new ModelProviderError('invalid_request', 400)
        }
        return {
          text: validModelText,
          modelCode,
          latencyMs: 1,
          usage: {
            promptTokens: 10_000,
            completionTokens: 2_000,
            cachedTokens: 0,
            cacheCreationTokens: 0
          }
        }
      }
    }),
    modelCallBudgetMs: 120_000,
    scheduleProcessing: run => {
      scheduled.push(run)
    },
    onProcessingError: () => undefined,
    now: () => clock
  })
}

const body = {
  subject: { userPlantRef: refs.activePlantRef },
  imageRefs: ['dvi_visual_flow_0001'],
  userQuestionZh: '叶子发黄'
}
const grant = () =>
  harness.sql(
    `SELECT available_amount, reserved_amount, consumed_amount FROM ai_quota_grants WHERE grant_ref = 'aqg_visual_owner_trial01'`
  )

beforeAll(async () => {
  harness = await startVisualDiagnosisMysqlHarness({ name: 'flow', now, ownerQuota: 30 })
  harness.sql(`INSERT INTO diagnosis_visual_images (_openid, image_ref, user_internal_id, storage_file_id, mime_type, byte_size, content_sha256, registered_at_ms, created_at_ms, updated_at_ms)
    VALUES ('', 'dvi_visual_flow_0001', 1, 'cloud://env.bucket/diagnosis/${refs.ownerRef}/visual/202610/${'1'.repeat(32)}.jpg', 'image/jpeg', 3, '${'e'.repeat(64)}', ${now}, ${now}, ${now});`)
}, 180_000)
afterAll(() => harness?.stop())

describe('视觉诊断真实库闭环', () => {
  test('并发重复提交：同键只建一个诊断、只预占一次；重试返回同一诊断', async () => {
    const { routeDependencies } = module()
    const results = await Promise.all(
      [1, 2, 3].map(() =>
        routeDependencies.createDiagnosis({
          principal: ownerPrincipal,
          request: body,
          idempotencyKey: 'idem-flow-key-0001'
        })
      )
    )
    expect(results.every(result => result.status === 202 || result.status === 503)).toBe(true)
    expect(results.some(result => result.status === 202)).toBe(true)
    expect(harness.sql('SELECT COUNT(*) FROM diagnosis_visual_sessions')).toBe('1')
    expect(harness.sql('SELECT COUNT(*) FROM ai_quota_reservations')).toBe('1')
    expect(grant()).toBe('7\t23\t0')
    const retry = await routeDependencies.createDiagnosis({
      principal: ownerPrincipal,
      request: body,
      idempotencyKey: 'idem-flow-key-0001'
    })
    const accepted = results.find(result => result.status === 202)!
    expect(retry).toEqual(accepted)
  })

  test('额度不足：409 AI_QUOTA_INSUFFICIENT，不创建诊断、不新增预占', async () => {
    const { routeDependencies } = module()
    const result = await routeDependencies.createDiagnosis({
      principal: ownerPrincipal,
      request: body,
      idempotencyKey: 'idem-flow-key-0002'
    })
    expect(result).toMatchObject({
      status: 409,
      body: { error: { type: 'AI_QUOTA_INSUFFICIENT' } }
    })
    expect(harness.sql('SELECT COUNT(*) FROM diagnosis_visual_sessions')).toBe('1')
    expect(harness.sql('SELECT COUNT(*) FROM ai_quota_reservations')).toBe('1')
  })

  test('完成：按实际成本结算 5 点并释放剩余；回放与存储记录一致，再次处理被跳过', async () => {
    const { routeDependencies, process } = module()
    const ref = harness.sql('SELECT visual_diagnosis_ref FROM diagnosis_visual_sessions')
    expect(await process(ref)).toBe('finalized')
    expect(await process(ref)).toBe('skipped')
    expect(grant()).toBe('25\t0\t5')
    expect(
      harness.sql(`SELECT status, settled_amount, actual_cost_micros FROM ai_quota_reservations`)
    ).toBe('settled\t5\t3600')
    const replay = await routeDependencies.getDiagnosis({
      principal: ownerPrincipal,
      visualDiagnosisRef: ref
    })
    expect(replay).toMatchObject({
      visualDiagnosisRef: ref,
      status: 'completed',
      chargedPoints: 5,
      result: { contractVersion: 'diagnosis-result/v2', titleZh: '白粉虱虫害' }
    })
    const again = await routeDependencies.getDiagnosis({
      principal: ownerPrincipal,
      visualDiagnosisRef: ref
    })
    expect(again).toEqual(replay)
    const stored = JSON.parse(
      harness.sql(`SELECT JSON_OBJECT('imageRefs', image_refs_json, 'userQuestionZh', user_question_zh, 'versionGroup', version_group_json,
        'contextSummary', context_summary_json, 'finalization', JSON_OBJECT('status', status, 'releaseReason', release_reason,
        'publicResult', public_result_json, 'imageAssessment', image_assessment_json, 'modelCode', model_code,
        'rawTextSha256s', raw_text_sha256s_json, 'calls', model_calls_json, 'attempts', model_attempts_json, 'costMicros', cost_micros,
        'chargedPoints', charged_points, 'quotaOutcome', quota_outcome, 'completedAtMs', completed_at_ms), 'recordSha256', record_sha256)
        FROM diagnosis_visual_sessions`)
    )
    expect(
      calculateVisualRecordSha256({ visualDiagnosisRef: ref, ...stored }, stored.finalization)
    ).toBe(stored.recordSha256)
    const list = await routeDependencies.listDiagnoses({
      principal: ownerPrincipal,
      userPlantRef: refs.activePlantRef,
      cursor: null
    })
    expect(list.items).toEqual([
      {
        visualDiagnosisRef: ref,
        status: 'completed',
        createdAt: new Date(now).toISOString(),
        titleZh: '白粉虱虫害',
        userPlantRef: refs.activePlantRef
      }
    ])
  })

  test('失败释放：模型失败后预占全部释放、不扣点，批次额度回到失败前', async () => {
    modelMode = 'fail'
    const { routeDependencies, process } = module()
    const created = await routeDependencies.createDiagnosis({
      principal: ownerPrincipal,
      request: body,
      idempotencyKey: 'idem-flow-key-0003'
    })
    expect(created.status).toBe(202)
    expect(grant()).toBe('2\t23\t5')
    const ref = (created.body as { data: { visualDiagnosisRef: string } }).data.visualDiagnosisRef
    expect(await process(ref)).toBe('finalized')
    expect(grant()).toBe('25\t0\t5')
    expect(
      harness.sql(
        `SELECT status, charged_points, release_reason, quota_outcome FROM diagnosis_visual_sessions WHERE visual_diagnosis_ref = '${ref}'`
      )
    ).toBe('failed_no_charge\t0\tmodel_failed\treleased')
    expect(
      await routeDependencies.getDiagnosis({ principal: ownerPrincipal, visualDiagnosisRef: ref })
    ).toMatchObject({ status: 'failed_no_charge', releaseReason: 'model_failed', chargedPoints: 0 })
  })

  // Expected 来源：主代理 2026-10-11 裁决——卡在处理中、超过整单截止时刻（预占到期 − 60 秒）的诊断由 diagnosis 低频补扫回收为失败并释放点数；
  // 预占已到期一律转入对账（reservation_ttl_expired），不静默结算；两阶段互不影响。
  test('补扫回收：未认领且预占未到期 → 失败不扣点、点数全部退回', async () => {
    modelMode = 'ok'
    clock = now
    const { routeDependencies } = module()
    const created = await routeDependencies.createDiagnosis({
      principal: ownerPrincipal,
      request: body,
      idempotencyKey: 'idem-flow-key-0004'
    })
    expect(created.status).toBe(202)
    expect(grant()).toBe('2\t23\t5')
    const ref = (created.body as { data: { visualDiagnosisRef: string } }).data.visualDiagnosisRef
    clock = now + 900_000 - 60_000 + 1
    const sweep = createDiagnosisMaintenanceSweepFromSource({
      source: harness.source,
      driver: harness.driver,
      settings: RUNTIME_PARAMETERS.diagnosis.maintenanceSweep.value,
      now: () => clock
    })
    const summary = await sweep({ functionTimeoutMs: 60_000 })
    expect(summary).toEqual({
      reservations: { outcome: 'drained', pendingCount: 0 },
      sessions: { outcome: 'drained', recovered: 1 }
    })
    expect(
      harness.sql(
        `SELECT status, release_reason, charged_points, quota_outcome FROM diagnosis_visual_sessions WHERE visual_diagnosis_ref = '${ref}'`
      )
    ).toBe('failed_no_charge\tmodel_failed\t0\treleased')
    expect(grant()).toBe('25\t0\t5')
  })

  test('补扫回收：预占已到期 → 到期扫描转入对账（reservation_ttl_expired），会话失败不扣点、额度结局为待对账', async () => {
    clock = now + 1_000_000
    const { routeDependencies } = module()
    const created = await routeDependencies.createDiagnosis({
      principal: ownerPrincipal,
      request: body,
      idempotencyKey: 'idem-flow-key-0005'
    })
    const ref = (created.body as { data: { visualDiagnosisRef: string } }).data.visualDiagnosisRef
    clock = now + 1_000_000 + 900_000
    const sweep = createDiagnosisMaintenanceSweepFromSource({
      source: harness.source,
      driver: harness.driver,
      settings: RUNTIME_PARAMETERS.diagnosis.maintenanceSweep.value,
      now: () => clock
    })
    const summary = await sweep({ functionTimeoutMs: 60_000 })
    expect(summary).toEqual({
      reservations: { outcome: 'drained', pendingCount: 1 },
      sessions: { outcome: 'drained', recovered: 1 }
    })
    const reservation = harness.sql(
      `SELECT r.status, r.reconciliation_reason FROM ai_quota_reservations r JOIN diagnosis_visual_sessions s ON s.reservation_ref = r.reservation_ref WHERE s.visual_diagnosis_ref = '${ref}'`
    )
    expect(reservation).toBe('pending_reconciliation\treservation_ttl_expired')
    expect(
      harness.sql(
        `SELECT status, quota_outcome FROM diagnosis_visual_sessions WHERE visual_diagnosis_ref = '${ref}'`
      )
    ).toBe('failed_no_charge\tpending_reconciliation')
    expect(grant()).toBe('2\t23\t5')
  })
})
