import { describe, expect, test } from 'vitest'

import {
  createProcessVisualDiagnosisUseCase,
  type ProcessVisualDiagnosisDependencies
} from '../../../src/diagnosis/visual/application/process-visual-diagnosis.js'
import { calculateVisualRecordSha256 } from '../../../src/diagnosis/visual/domain/visual-session-record.js'
import type { VisualSessionProcessingRow } from '../../../src/diagnosis/visual/repository/mysql-visual-diagnosis-repository.js'
import { ImageNormalizationError } from '../../../src/diagnosis/image/image-normalizer.js'
import { ModelProviderError, type VisualModelRequest } from '../../../src/diagnosis/provider/visual-model-registry.js'
import { StorageProviderUnavailableError } from '../../../src/foundation/storage/cloudbase-storage-http-adapter.js'
import {
  fixtureNow,
  generationRules,
  notPlantModelText,
  promptRelease,
  validModelText
} from './support/visual-fakes.js'

/**
 * Expected 来源：diagnosis-visual-api.md §2.3 与 §3（可用结果按 ceil(实际 costMicros/800) 结算并释放剩余；
 * 非植物或图片不可用释放全部、不扣点；模型失败或两次安全门拒绝释放全部、不扣点；供应商结果未知进入 pending_reconciliation；
 * 第 2 次调用前确认累计成本仍在 maxCostMicros 以内；同一 productActionId 不重复扣费）；
 * diagnosis-visual-image-input/v1 与用户 2026-10-11 裁决（送模型前服务端压缩：长边 ≤1024、统一 JPEG、清除元数据；
 * 只用 HTTPS 临时地址交给模型）；ClickUp z8v0kmvhnd（结果不可变、带版本组与 SHA-256；不存模型原文）。
 * 测试层次：unit_fake（仓储、存储、压缩器、模型、额度都是内存假实现，不发起真实调用）。
 */
const ref = 'vds_fixture00000001'
function session(overrides: Partial<VisualSessionProcessingRow> = {}): VisualSessionProcessingRow {
  return {
    visualDiagnosisRef: ref,
    status: 'processing',
    userRef: 'usr_visual_owner_0001',
    subject: { kind: 'user_plant', internalId: '11', userPlantRef: 'upl_visual_active_0001' },
    images: [{ imageRef: 'dvi_owned_00000001', storageFileId: 'cloud://e.b/diagnosis/a.jpg', mimeType: 'image/jpeg', byteSize: 10, contentSha256: 'e'.repeat(64) }],
    imageRefs: ['dvi_owned_00000001'],
    userQuestionZh: '叶子发黄',
    reservationRef: 'aqr_fixture_10000',
    versionGroup: {
      policyReleaseVersion: 'diagnosis-visual-generation/v1.0.0',
      policyContentSha256: 'a'.repeat(64),
      rules: generationRules,
      promptReleaseSha256: promptRelease.promptReleaseSha256,
      outputSchemaVersion: promptRelease.outputSchemaVersion,
      agentAllowlistVersion: promptRelease.agentAllowlistVersion,
      maxImageBytes: 5_242_880
    },
    contextSummary: null,
    createdAtMs: fixtureNow,
    ...overrides
  }
}

type Usage = { promptTokens: number; completionTokens: number; cachedTokens: number; cacheCreationTokens: number }
const usage: Usage = { promptTokens: 10_000, completionTokens: 2_000, cachedTokens: 0, cacheCreationTokens: 0 }

function harness(options: {
  texts?: string[]
  modelError?: ModelProviderError
  usage?: Usage
  row?: VisualSessionProcessingRow
  overrides?: Partial<ProcessVisualDiagnosisDependencies>
} = {}) {
  const finalizations: Record<string, any>[] = []
  const settlements: Record<string, unknown>[] = []
  const unknowns: Record<string, unknown>[] = []
  const uploads: { objectId: string; contentType: string }[] = []
  const requests: VisualModelRequest[] = []
  let claimed = false
  let textIndex = 0
  const deps: ProcessVisualDiagnosisDependencies = {
    runTransaction: work => work({ connection: null as never }),
    repository: {
      claimProcessing: async () => {
        if (claimed) {
          return false
        }
        claimed = true
        return true
      },
      readSessionForProcessing: async () => options.row ?? session(),
      finalizeSession: async (_context, input) => {
        finalizations.push(input.finalization as never)
        return 'finalized'
      }
    },
    readPromptRelease: async () => promptRelease,
    storage: {
      getDownloadUrl: async fileId => `https://cdn.example.invalid/${encodeURIComponent(fileId)}`,
      download: async () => new Uint8Array([0xff, 0xd8, 0xff, 0x00])
    },
    uploader: {
      upload: async (objectId, _bytes, contentType) => {
        uploads.push({ objectId, contentType })
        return { cloudObjectId: `cloud://e.b/${objectId}` }
      }
    },
    normalizer: { normalize: async () => ({ bytes: Buffer.from([1, 2, 3]), mime: 'image/jpeg', width: 1024, height: 768 }) },
    createModelClient: () => ({
      complete: async (modelCode, request) => {
        requests.push(request)
        if (options.modelError !== undefined) {
          throw options.modelError
        }
        const texts = options.texts ?? [validModelText]
        const text = texts[Math.min(textIndex, texts.length - 1)] ?? ''
        textIndex += 1
        return { text, modelCode, latencyMs: 1, usage: options.usage ?? usage }
      }
    }),
    settleQuota: async command => {
      settlements.push(command as never)
      return command.settledAmount === 0
        ? { kind: 'released', reservationRef: command.reservationRef, settledAmount: 0, releasedAmount: 23 }
        : { kind: 'settled', reservationRef: command.reservationRef, settledAmount: command.settledAmount, releasedAmount: 23 - command.settledAmount }
    },
    markProviderUnknown: async command => {
      unknowns.push(command as never)
      return { kind: 'pending_reconciliation', reservationRef: command.reservationRef }
    },
    now: () => fixtureNow + 5000,
    ...options.overrides
  }
  return { process: createProcessVisualDiagnosisUseCase(deps), finalizations, settlements, unknowns, uploads, requests }
}

describe('处理视觉诊断：完成路径', () => {
  test('压缩并上传后用 HTTPS 临时地址调用模型，按实际成本结算，写入带 SHA-256 的不可变终态', async () => {
    const h = harness()
    expect(await h.process(ref)).toBe('finalized')
    expect(h.uploads).toEqual([
      { objectId: `diagnosis/usr_visual_owner_0001/visual-normalized/202610/${ref}-1.jpg`, contentType: 'image/jpeg' }
    ])
    expect(h.requests).toHaveLength(1)
    expect(h.requests[0]).toMatchObject({ prefixText: promptRelease.prefixText })
    expect(h.requests[0]?.imageUrls).toEqual([
      `https://cdn.example.invalid/${encodeURIComponent(`cloud://e.b/diagnosis/usr_visual_owner_0001/visual-normalized/202610/${ref}-1.jpg`)}`
    ])
    expect(h.requests[0]?.dynamicText).toContain('病例类型：长期植物')
    expect(h.requests[0]?.dynamicText).toContain('「叶子发黄」')
    // 10,000×0.2 + 2,000×0.8 = 3,600 微元 → ceil(3600/800) = 5 点
    expect(h.settlements).toEqual([
      expect.objectContaining({ userRef: 'usr_visual_owner_0001', reservationRef: 'aqr_fixture_10000', settledAmount: 5, actualCostMicros: 3600, platformAbsorbedCostMicros: 0 })
    ])
    const final = h.finalizations[0]!
    expect(final).toMatchObject({
      status: 'completed',
      releaseReason: null,
      modelCode: 'qwen3.7-flash',
      costMicros: 3600,
      chargedPoints: 5,
      quotaOutcome: 'settled',
      completedAtMs: fixtureNow + 5000,
      imageAssessment: { verdict: 'assessable' }
    })
    expect(final.publicResult).toMatchObject({ contractVersion: 'diagnosis-result/v2', titleZh: '白粉虱虫害' })
    const { recordSha256, ...rest } = final
    expect(recordSha256).toBe(calculateVisualRecordSha256(session(), rest as never))
    expect(JSON.stringify(final)).not.toContain(validModelText)
  })

  test('已被认领的会话直接跳过，不重复调用模型或结算', async () => {
    const h = harness()
    await h.process(ref)
    expect(await h.process(ref)).toBe('skipped')
    expect(h.requests).toHaveLength(1)
    expect(h.settlements).toHaveLength(1)
  })

  test('临时案例按临时案例拼装上下文', async () => {
    const h = harness({ row: session({ subject: { kind: 'authenticated_ephemeral', internalId: '31' } }) })
    await h.process(ref)
    expect(h.requests[0]?.dynamicText).toContain('病例类型：临时案例')
  })

  test('首次调用成本已到上限时不发起第 2 次调用；超出预估的点数交给额度用例对账，公开扣点封顶', async () => {
    const huge = { promptTokens: 28_800, completionTokens: 40_000, cachedTokens: 0, cacheCreationTokens: 0 }
    const bad = validModelText.replace('"detailZh":"搬开"', '"detailZh":"苦参碱稀释 1000 倍"').replace('"agentNames":[]}]', '"agentNames":["苦参碱"]}]')
    const gated = harness({ texts: [bad, validModelText], usage: huge })
    await gated.process(ref)
    expect(gated.requests).toHaveLength(1)
    expect(gated.finalizations[0]).toMatchObject({ status: 'failed_no_charge', releaseReason: 'safety_gate_rejected', chargedPoints: 0 })
    expect(gated.settlements[0]).toMatchObject({ settledAmount: 0 })
    const over = harness({
      usage: huge,
      overrides: {
        settleQuota: async command => ({ kind: 'pending_reconciliation', reservationRef: command.reservationRef, requestedSettlementAmount: command.settledAmount, quotaShortfallAmount: 1 })
      }
    })
    await over.process(ref)
    expect(over.finalizations[0]).toMatchObject({ status: 'completed', chargedPoints: 23, quotaOutcome: 'pending_reconciliation' })
  })
})

describe('处理视觉诊断：不扣点与对账路径', () => {
  test('非植物：释放全部预占，released_no_charge 并带图片评估', async () => {
    const h = harness({ texts: [notPlantModelText] })
    await h.process(ref)
    expect(h.settlements[0]).toMatchObject({ settledAmount: 0 })
    expect(h.finalizations[0]).toMatchObject({ status: 'released_no_charge', releaseReason: 'not_plant', chargedPoints: 0, quotaOutcome: 'released', imageAssessment: { verdict: 'not_plant' } })
  })

  test('有明确错误码的模型失败：释放全部预占，failed_no_charge', async () => {
    const h = harness({ modelError: new ModelProviderError('invalid_request', 400) })
    await h.process(ref)
    expect(h.unknowns).toEqual([])
    expect(h.settlements[0]).toMatchObject({ settledAmount: 0 })
    expect(h.finalizations[0]).toMatchObject({ status: 'failed_no_charge', releaseReason: 'model_failed', chargedPoints: 0, quotaOutcome: 'released' })
  })

  test('超时或网络中断（结果未知）：不释放，进入对账', async () => {
    const h = harness({ modelError: new ModelProviderError('unavailable', 0) })
    await h.process(ref)
    expect(h.settlements).toEqual([])
    expect(h.unknowns).toEqual([expect.objectContaining({ userRef: 'usr_visual_owner_0001', reservationRef: 'aqr_fixture_10000' })])
    expect(h.finalizations[0]).toMatchObject({ status: 'failed_no_charge', releaseReason: 'model_failed', quotaOutcome: 'pending_reconciliation' })
  })

  test('图片无法解码：不调用模型，按图片不可用释放', async () => {
    const h = harness({ overrides: { normalizer: { normalize: async () => { throw new ImageNormalizationError('decode_failed') } } } })
    await h.process(ref)
    expect(h.requests).toEqual([])
    expect(h.finalizations[0]).toMatchObject({
      status: 'released_no_charge',
      releaseReason: 'image_unusable',
      imageAssessment: { verdict: 'image_unusable', perImage: [{ imageIndex: 1, visiblePart: 'unknown', quality: 'unusable', qualityIssues: [] }] }
    })
    expect(h.settlements[0]).toMatchObject({ settledAmount: 0 })
  })

  test.each([
    ['存储不可用', { storage: { getDownloadUrl: async () => { throw new StorageProviderUnavailableError() }, download: async () => new Uint8Array() } }],
    ['原图已不存在', { storage: { getDownloadUrl: async () => null, download: async () => new Uint8Array() } }],
    ['提示词发布已变更', { readPromptRelease: async () => ({ ...promptRelease, promptReleaseSha256: 'f'.repeat(64) }) }],
    ['模型供应商未配置', { createModelClient: () => null }]
  ] as [string, Partial<ProcessVisualDiagnosisDependencies>][])('%s：不调用模型，失败关闭并释放', async (_name, overrides) => {
    const h = harness({ overrides })
    await h.process(ref)
    expect(h.requests).toEqual([])
    expect(h.finalizations[0]).toMatchObject({ status: 'failed_no_charge', releaseReason: 'model_failed', chargedPoints: 0 })
    expect(h.settlements[0]).toMatchObject({ settledAmount: 0 })
  })

  test('结算调用失败时仍写入终态，额度结局记为 unconfirmed（由对账兜底）', async () => {
    const h = harness({ overrides: { settleQuota: async () => { throw new Error('db down') } } })
    await h.process(ref)
    expect(h.finalizations[0]).toMatchObject({ status: 'completed', chargedPoints: 5, quotaOutcome: 'unconfirmed' })
  })
})
