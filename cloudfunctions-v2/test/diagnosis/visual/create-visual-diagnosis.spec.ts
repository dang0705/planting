import { describe, expect, test } from 'vitest'

import {
  createCreateVisualDiagnosisUseCase,
  type CreateVisualDiagnosisDependencies
} from '../../../src/diagnosis/visual/application/create-visual-diagnosis.js'
import type { HttpIdempotencyPublicResponseSnapshot } from '../../../src/foundation/idempotency/http-idempotency.js'
import { IdempotentWriteRetryLaterError } from '../../../src/foundation/idempotency/run-idempotent-write.js'
import { AiQuotaReservationPersistenceError } from '../../../src/subscription/repository/ai-quota-reservation-repository-types.js'
import {
  CapabilitySnapshotExpiredError,
  CapabilitySnapshotUnavailableError
} from '../../../src/subscription/repository/mysql-capability-snapshot-reader.js'
import {
  capabilitySnapshot,
  fixtureNow,
  generationRules,
  generationSnapshot,
  ownerPrincipal,
  promptRelease
} from './support/visual-fakes.js'

/**
 * Expected 来源：diagnosis-visual-api.md §1（游客或无能力 403、快照失效 409）、§2.2 处理顺序
 * （归属：用户植物 404 USER_PLANT_NOT_FOUND / 已归档 409 USER_PLANT_ARCHIVED / 临时案例与图片 404 NOT_FOUND；
 * 幂等：同键同参返回首次结果、不同参数 409；在任何模型调用之前预占 estimatedPoints，余额不足 409 AI_QUOTA_INSUFFICIENT
 * 且不创建诊断；估算输入超限 400；返回 202 processing）、§3（productActionId 同键同参只预占一次）、§4（依赖不可用 503）；
 * CLAUDE.md（pending 配置无代码默认：预占有效期、提示词发布缺失即 503）。
 * 测试层次：unit_fake（仓储、幂等、额度、调度全部是内存假实现）。
 */
type Sessions = Map<string, Record<string, unknown>>

function harness(overrides: Partial<CreateVisualDiagnosisDependencies> = {}) {
  const sessions: Sessions = new Map()
  const reservations: Record<string, unknown>[] = []
  const scheduled: string[] = []
  const stored = new Map<string, { requestHash: string; snapshot: HttpIdempotencyPublicResponseSnapshot }>()
  let counter = 0
  const deps: CreateVisualDiagnosisDependencies = {
    readCapabilitySnapshot: async () => capabilitySnapshot(['USER_DIAGNOSIS_VISUAL']),
    readGenerationPolicy: async () => generationSnapshot,
    readAssetRules: async () => ({
      contractVersion: 'user-plant-asset-rules/v1',
      allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
      maxImageBytes: 5_242_880,
      replacedCoverCleanupDays: 7
    }),
    readPromptRelease: async () => promptRelease,
    readReservationTtlSeconds: async () => 900,
    readHttpWriteRules: async () => ({ contractVersion: 'http-request-write-policy/v2', jsonBodyLimitBytes: 1_048_576, idempotencyRetentionHours: 168 }),
    isModelProviderConfigured: () => true,
    readContextSummary: async () => null,
    runIdempotent: async (idempotency, work) => {
      const key = `${idempotency.principalScopeHash}:${idempotency.idempotencyKeyHash}`
      const previous = stored.get(key)
      if (previous !== undefined) {
        return previous.requestHash === idempotency.requestHash
          ? previous.snapshot
          : { status: 409, body: { error: { type: 'IDEMPOTENCY_CONFLICT', message: 'x' } } }
      }
      // 与 runIdempotentWrite 一致：业务步骤要求回滚时返回 503 且不记录首次结果。
      let snapshot: HttpIdempotencyPublicResponseSnapshot
      try {
        snapshot = await work({ connection: null as never })
      } catch (error) {
        if (error instanceof IdempotentWriteRetryLaterError) {
          return { status: 503, body: { error: { type: 'SERVICE_UNAVAILABLE', message: 'retry' } } }
        }
        throw error
      }
      stored.set(key, { requestHash: idempotency.requestHash, snapshot })
      return snapshot
    },
    repository: {
      readUserInternalId: async () => '1',
      readSubject: async (_context, input) => {
        if ('userPlantRef' in input.subject) {
          if (input.subject.userPlantRef === 'upl_visual_active_0001') {
            return { kind: 'user_plant', internalId: '11', userPlantRef: input.subject.userPlantRef, lifecycle: 'active' }
          }
          if (input.subject.userPlantRef === 'upl_visual_archived_01') {
            return { kind: 'user_plant', internalId: '12', userPlantRef: input.subject.userPlantRef, lifecycle: 'archived' }
          }
          return null
        }
        return input.subject.ephemeralPlantCaseRef === 'epc_visual_active_0001'
          ? { kind: 'authenticated_ephemeral', internalId: '31' }
          : null
      },
      readOwnedImages: async (_context, input) =>
        input.imageRefs
          .filter(ref => ref.startsWith('dvi_owned_'))
          .map(ref => ({ imageRef: ref, storageFileId: `cloud://e.b/${ref}`, mimeType: 'image/jpeg', byteSize: 10, contentSha256: 'e'.repeat(64) })),
      insertSession: async (_context, session) => {
        sessions.set(session.visualDiagnosisRef, session as never)
      }
    },
    reserveQuota: async command => {
      const existing = reservations.find(item => item.productActionId === command.productActionId)
      if (existing !== undefined) {
        if (existing.requestHash !== command.requestHash) {
          throw new AiQuotaReservationPersistenceError('IDEMPOTENCY_CONFLICT', 'x')
        }
        return { kind: 'replayed', reservationRef: existing.reservationRef } as never
      }
      reservations.push({ ...command, reservationRef: `aqr_fixture_${reservations.length + 1}0000` })
      return { kind: 'reserved', reservationRef: `aqr_fixture_${reservations.length}0000` } as never
    },
    scheduleProcessing: ref => {
      scheduled.push(ref)
    },
    createRef: prefix => `${prefix}fixture${String((counter += 1)).padStart(8, '0')}`,
    now: () => fixtureNow,
    ...overrides
  }
  return { create: createCreateVisualDiagnosisUseCase(deps), sessions, reservations, scheduled }
}

const request = {
  subject: { userPlantRef: 'upl_visual_active_0001' },
  imageRefs: ['dvi_owned_00000001'],
  userQuestionZh: '叶子发黄'
}
const call = (h: ReturnType<typeof harness>, body: Record<string, unknown> = request, key = 'idem-key-0001') =>
  h.create({ principal: ownerPrincipal, request: body as never, idempotencyKey: key })

describe('发起视觉诊断：成功路径', () => {
  test('预占 estimatedPoints 后创建处理中会话，返回 202，并调度处理', async () => {
    const h = harness()
    const result = await call(h)
    expect(result.status).toBe(202)
    const data = (result.body as { data: Record<string, unknown> }).data
    expect(data).toEqual({ visualDiagnosisRef: expect.stringMatching(/^vds_/u), status: 'processing', createdAt: '2026-10-11T08:00:00.000Z' })
    expect(h.reservations).toHaveLength(1)
    expect(h.reservations[0]).toMatchObject({
      userRef: ownerPrincipal.user_id,
      capability: 'USER_DIAGNOSIS_VISUAL',
      estimatedAmount: generationRules.costPolicy.estimatedPoints,
      costPolicyVersion: generationRules.costPolicy.costPolicyVersion,
      expiresAtMs: fixtureNow + 900_000
    })
    const session = h.sessions.get(String(data.visualDiagnosisRef))
    expect(session).toMatchObject({
      subject: { kind: 'user_plant', internalId: '11' },
      imageRefs: ['dvi_owned_00000001'],
      userQuestionZh: '叶子发黄',
      reservationRef: 'aqr_fixture_10000',
      versionGroup: {
        policyReleaseVersion: 'diagnosis-visual-generation/v1.0.0',
        promptReleaseSha256: promptRelease.promptReleaseSha256,
        outputSchemaVersion: promptRelease.outputSchemaVersion,
        maxImageBytes: 5_242_880,
        rules: generationRules
      }
    })
    expect(h.scheduled).toEqual([data.visualDiagnosisRef])
  })

  test('幂等记录保留期取自 http/request_write 策略（168 小时），与额度预占有效期无关', async () => {
    let expiresAtMs = 0
    const h = harness({
      readHttpWriteRules: async () => ({ contractVersion: 'http-request-write-policy/v2', jsonBodyLimitBytes: 1_048_576, idempotencyRetentionHours: 168 }),
      runIdempotent: async (idempotency, work) => {
        expiresAtMs = idempotency.expiresAtMs
        return work({ connection: null as never })
      }
    })
    await call(h)
    expect(expiresAtMs).toBe(fixtureNow + 168 * 3_600_000)
  })

  test('本人有效登录临时案例可诊断，不读取长期植物上下文', async () => {
    let summaryCalls = 0
    const h = harness({ readContextSummary: async () => { summaryCalls += 1; return null } })
    const result = await call(h, { subject: { ephemeralPlantCaseRef: 'epc_visual_active_0001' }, imageRefs: ['dvi_owned_00000001'] })
    expect(result.status).toBe(202)
    expect([...h.sessions.values()][0]).toMatchObject({ subject: { kind: 'authenticated_ephemeral', internalId: '31' }, userQuestionZh: null })
    expect(summaryCalls).toBe(0)
  })

  test('同键同参重放返回首次结果，只预占一次、只建一个会话；同键不同参数 409', async () => {
    const h = harness()
    const first = await call(h)
    const replay = await call(h)
    expect(replay).toEqual(first)
    expect(h.reservations).toHaveLength(1)
    expect(h.sessions.size).toBe(1)
    const conflict = await call(h, { ...request, userQuestionZh: '换了问题' })
    expect(conflict).toMatchObject({ status: 409, body: { error: { type: 'IDEMPOTENCY_CONFLICT' } } })
  })
})

describe('发起视觉诊断：拒绝路径（不预占、不调用模型）', () => {
  test.each([
    ['无视觉诊断能力', { readCapabilitySnapshot: async () => capabilitySnapshot(['USER_PLANT_CREATE']) }, 403, 'CAPABILITY_DENIED'],
    ['能力快照失效', { readCapabilitySnapshot: async () => { throw new CapabilitySnapshotExpiredError() } }, 409, 'CAPABILITY_SNAPSHOT_EXPIRED'],
    ['能力快照不可用', { readCapabilitySnapshot: async () => { throw new CapabilitySnapshotUnavailableError() } }, 503, 'SERVICE_UNAVAILABLE'],
    ['生成策略未发布', { readGenerationPolicy: async () => null }, 503, 'SERVICE_UNAVAILABLE'],
    ['上传资产策略未发布', { readAssetRules: async () => null }, 503, 'SERVICE_UNAVAILABLE'],
    ['提示词发布待冻结', { readPromptRelease: async () => null }, 503, 'SERVICE_UNAVAILABLE'],
    ['预占有效期待冻结', { readReservationTtlSeconds: async () => null }, 503, 'SERVICE_UNAVAILABLE'],
    ['HTTP 写入策略未发布', { readHttpWriteRules: async () => null }, 503, 'SERVICE_UNAVAILABLE'],
    ['模型供应商未配置', { isModelProviderConfigured: () => false }, 503, 'SERVICE_UNAVAILABLE'],
    [
      '估算输入超过策略上限',
      { readGenerationPolicy: async () => ({ ...generationSnapshot, rules: { ...generationRules, costPolicy: { ...generationRules.costPolicy, maxInputTokens: 9000 } } }) },
      400,
      'VALIDATION_FAILED'
    ]
  ] as [string, Partial<CreateVisualDiagnosisDependencies>, number, string][])('%s → %s %s', async (_name, override, status, type) => {
    const h = harness(override)
    await expect(call(h)).rejects.toMatchObject({ status, type })
    expect(h.reservations).toHaveLength(0)
    expect(h.sessions.size).toBe(0)
  })

  test.each([
    ['他人或不存在的用户植物', { subject: { userPlantRef: 'upl_visual_stranger_01' }, imageRefs: ['dvi_owned_00000001'] }, 404, 'USER_PLANT_NOT_FOUND'],
    ['已归档的用户植物', { subject: { userPlantRef: 'upl_visual_archived_01' }, imageRefs: ['dvi_owned_00000001'] }, 409, 'USER_PLANT_ARCHIVED'],
    ['过期或他人的临时案例', { subject: { ephemeralPlantCaseRef: 'epc_visual_expired_001' }, imageRefs: ['dvi_owned_00000001'] }, 404, 'NOT_FOUND'],
    ['图片未登记或非本人', { subject: { userPlantRef: 'upl_visual_active_0001' }, imageRefs: ['dvi_owned_00000001', 'dvi_other_000000001'] }, 404, 'NOT_FOUND']
  ])('%s → %s %s（记录为首次结果）', async (_name, body, status, type) => {
    const h = harness()
    const result = await call(h, body)
    expect(result).toMatchObject({ status, body: { error: { type } } })
    expect(h.reservations).toHaveLength(0)
    expect(h.sessions.size).toBe(0)
    expect(h.scheduled).toEqual([])
  })

  test('额度不足 → 409 AI_QUOTA_INSUFFICIENT，不创建诊断', async () => {
    const h = harness({ reserveQuota: async () => ({ kind: 'insufficient_quota', estimatedAmount: 23, availableAmount: 5, shortfallAmount: 18 }) })
    const result = await call(h)
    expect(result).toMatchObject({ status: 409, body: { error: { type: 'AI_QUOTA_INSUFFICIENT' } } })
    expect(h.sessions.size).toBe(0)
    expect(h.scheduled).toEqual([])
  })

  test('额度服务异常 → 503（不记录首次结果，同键可重试）', async () => {
    const h = harness({ reserveQuota: async () => { throw new Error('db down') } })
    await expect(call(h)).resolves.toMatchObject({ status: 503, body: { error: { type: 'SERVICE_UNAVAILABLE' } } })
  })
})
