import { createHash } from 'node:crypto'
import { describe, expect, test } from 'vitest'

import {
  createGetVisualUploadTargets,
  createRegisterVisualImagesUseCase,
  type RegisterVisualImagesDependencies
} from '../../../src/diagnosis/visual/application/register-visual-images.js'
import { createReadVisualDiagnosisUseCases } from '../../../src/diagnosis/visual/application/read-visual-diagnosis.js'
import type { VisualSessionPublicRow } from '../../../src/diagnosis/visual/domain/visual-session-record.js'
import { StorageProviderUnavailableError } from '../../../src/foundation/storage/cloudbase-storage-http-adapter.js'
import { capabilitySnapshot, fixtureNow, ownerPrincipal } from './support/visual-fakes.js'

/**
 * Expected 来源：diagnosis-visual-api.md §2.1（上传路径 diagnosis/{usr}/visual/{yyyyMM}/{32hex}；登记时校验目录属于本人、
 * 类型属于 storage.upload.allowed_mime_types、大小不超过 storage.upload.max_image_bytes；不信任客户端声明）与 §4
 * （超大 413、类型不支持 415、不存在 404、依赖不可用 503）；§2.3（回放返回当时保存的结果；他人诊断 404；
 * 公开响应不含 user_id、模型代码、预占编号、成本等内部字段）；§1（无视觉诊断能力 403）。
 * 测试层次：unit_fake。
 */
const assetRules = {
  contractVersion: 'user-plant-asset-rules/v1' as const,
  allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] as const,
  maxImageBytes: 1000,
  replacedCoverCleanupDays: 7
}
const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3])
const fileId = (hex: string, ext = 'jpg') =>
  `cloud://env-1.bucket-1/diagnosis/${ownerPrincipal.user_id}/visual/202610/${hex.repeat(32)}.${ext}`

function registerHarness(overrides: Partial<RegisterVisualImagesDependencies> = {}) {
  const inserted: unknown[] = []
  let counter = 0
  const deps: RegisterVisualImagesDependencies = {
    readCapabilitySnapshot: async () => capabilitySnapshot(['USER_DIAGNOSIS_VISUAL']),
    readAssetRules: async () => assetRules,
    readHttpWriteRules: async () => ({ contractVersion: 'http-request-write-policy/v2', jsonBodyLimitBytes: 1_048_576, idempotencyRetentionHours: 168 }),
    storage: {
      getDownloadUrl: async id => (id.includes('missing') || id.includes('/visual/202610/0') ? null : `https://cdn.invalid/${id}`),
      download: async () => jpeg
    },
    runIdempotent: async (_idempotency, work) => work({ connection: null as never }),
    repository: {
      readUserInternalId: async () => '1',
      insertImages: async (_context, input) => {
        inserted.push(input)
        return input.images.map(image => ({ imageRef: image.imageRef }))
      }
    },
    createRef: prefix => `${prefix}fixture${String((counter += 1)).padStart(8, '0')}`,
    now: () => fixtureNow,
    ...overrides
  }
  return { register: createRegisterVisualImagesUseCase(deps), inserted }
}

describe('上传目标', () => {
  test('按张数返回本人上传路径、类型白名单与字节上限；无能力 403', async () => {
    const get = createGetVisualUploadTargets({
      readCapabilitySnapshot: async () => capabilitySnapshot(['USER_DIAGNOSIS_VISUAL']),
      readAssetRules: async () => assetRules,
      randomHex: () => 'c'.repeat(32),
      now: () => fixtureNow
    })
    expect(await get({ principal: ownerPrincipal, count: 2 })).toEqual({
      targets: [0, 1].map(() => ({
        cloudPath: `diagnosis/${ownerPrincipal.user_id}/visual/202610/${'c'.repeat(32)}`,
        allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        maxImageBytes: 1000
      }))
    })
    const denied = createGetVisualUploadTargets({
      readCapabilitySnapshot: async () => capabilitySnapshot([]),
      readAssetRules: async () => assetRules,
      randomHex: () => 'c'.repeat(32),
      now: () => fixtureNow
    })
    await expect(denied({ principal: ownerPrincipal, count: 1 })).rejects.toMatchObject({ status: 403, type: 'CAPABILITY_DENIED' })
  })
})

describe('登记图片', () => {
  test('下载校验后按真实类型与内容摘要登记，返回 registered', async () => {
    const h = registerHarness()
    const result = await h.register({ principal: ownerPrincipal, files: [{ fileId: fileId('a') }], idempotencyKey: 'idem-key-0001' })
    expect(result).toEqual({ status: 200, body: { data: { images: [{ imageRef: 'dvi_fixture00000001', status: 'registered' }] } } })
    expect(h.inserted[0]).toMatchObject({
      userInternalId: '1',
      images: [{ storageFileId: fileId('a'), mimeType: 'image/jpeg', byteSize: jpeg.length, contentSha256: createHash('sha256').update(jpeg).digest('hex') }]
    })
  })

  test.each([
    ['他人目录', [{ fileId: fileId('a').replace(ownerPrincipal.user_id, 'usr_stranger_000001') }], 400, 'VALIDATION_FAILED'],
    ['扩展名不在白名单', [{ fileId: fileId('a', 'gif') }], 400, 'VALIDATION_FAILED']
  ])('%s → %s %s（不访问存储）', async (_name, files, status, type) => {
    const h = registerHarness()
    await expect(h.register({ principal: ownerPrincipal, files, idempotencyKey: 'idem-key-0001' })).rejects.toMatchObject({ status, type })
  })

  test('文件不存在 404、超过字节上限 413、真实类型与扩展名不符 415、存储不可用 503', async () => {
    await expect(registerHarness().register({ principal: ownerPrincipal, files: [{ fileId: fileId('0') }], idempotencyKey: 'k-00000001' }))
      .rejects.toMatchObject({ status: 404, type: 'NOT_FOUND' })
    await expect(registerHarness({ storage: { getDownloadUrl: async () => 'https://x', download: async () => 'too_large' } })
      .register({ principal: ownerPrincipal, files: [{ fileId: fileId('a') }], idempotencyKey: 'k-00000001' }))
      .rejects.toMatchObject({ status: 413, type: 'PAYLOAD_TOO_LARGE' })
    await expect(registerHarness().register({ principal: ownerPrincipal, files: [{ fileId: fileId('a', 'png') }], idempotencyKey: 'k-00000001' }))
      .rejects.toMatchObject({ status: 415, type: 'UNSUPPORTED_MEDIA_TYPE' })
    await expect(registerHarness({ storage: { getDownloadUrl: async () => { throw new StorageProviderUnavailableError() }, download: async () => jpeg } })
      .register({ principal: ownerPrincipal, files: [{ fileId: fileId('a') }], idempotencyKey: 'k-00000001' }))
      .rejects.toMatchObject({ status: 503, type: 'SERVICE_UNAVAILABLE' })
  })

  test('无视觉诊断能力 403；资产策略未发布 503', async () => {
    await expect(registerHarness({ readCapabilitySnapshot: async () => capabilitySnapshot([]) })
      .register({ principal: ownerPrincipal, files: [{ fileId: fileId('a') }], idempotencyKey: 'k-00000001' }))
      .rejects.toMatchObject({ status: 403, type: 'CAPABILITY_DENIED' })
    await expect(registerHarness({ readAssetRules: async () => null })
      .register({ principal: ownerPrincipal, files: [{ fileId: fileId('a') }], idempotencyKey: 'k-00000001' }))
      .rejects.toMatchObject({ status: 503, type: 'SERVICE_UNAVAILABLE' })
  })
})

describe('取结果与历史（回放）', () => {
  const completedRow: VisualSessionPublicRow = {
    visualDiagnosisRef: 'vds_fixture00000001',
    status: 'completed',
    createdAtMs: fixtureNow,
    completedAtMs: fixtureNow + 5000,
    publicResult: { contractVersion: 'diagnosis-result/v2', titleZh: '白粉虱虫害' } as never,
    imageAssessment: { verdict: 'assessable', perImage: [{ imageIndex: 1, visiblePart: 'leaf_back', quality: 'good', qualityIssues: [] }] },
    releaseReason: null,
    chargedPoints: 5,
    recordSha256: 'd'.repeat(64),
    userPlantRef: 'upl_visual_active_0001'
  }
  const reads = createReadVisualDiagnosisUseCases({
    withReadContext: work => work({ connection: null as never }),
    repository: {
      readUserInternalId: async () => '1',
      readOwnedSession: async (_context, input) => (input.visualDiagnosisRef === completedRow.visualDiagnosisRef ? completedRow : null),
      listOwnedSessions: async () => ({ rows: [completedRow], nextCursor: 'cursor-1' })
    },
    readListRules: async () => ({ contractVersion: 'user-plant-list-rules/v1', userPlantListPageSize: { default: 20, max: 50 }, timelinePageSize: { default: 20, max: 50 } })
  })

  test('取结果返回当时保存的公开结果，不含内部字段；他人或不存在 404', async () => {
    const result = await reads.get({ principal: ownerPrincipal, visualDiagnosisRef: completedRow.visualDiagnosisRef })
    expect(result).toEqual({
      visualDiagnosisRef: 'vds_fixture00000001',
      status: 'completed',
      createdAt: '2026-10-11T08:00:00.000Z',
      completedAt: '2026-10-11T08:00:05.000Z',
      result: completedRow.publicResult,
      chargedPoints: 5,
      imageAssessment: completedRow.imageAssessment
    })
    const text = JSON.stringify(result)
    for (const forbidden of ['usr_', 'aqr_', 'recordSha256', 'qwen', 'costMicros']) {
      expect(text).not.toContain(forbidden)
    }
    await expect(reads.get({ principal: ownerPrincipal, visualDiagnosisRef: 'vds_other000000001' })).rejects.toMatchObject({ status: 404, type: 'NOT_FOUND' })
  })

  test('历史列表投影标题与植物引用，并透传游标；分页条数取自已发布列表策略', async () => {
    expect(await reads.list({ principal: ownerPrincipal, userPlantRef: null, cursor: null })).toEqual({
      items: [{ visualDiagnosisRef: 'vds_fixture00000001', status: 'completed', createdAt: '2026-10-11T08:00:00.000Z', titleZh: '白粉虱虫害', userPlantRef: 'upl_visual_active_0001' }],
      nextCursor: 'cursor-1'
    })
  })
})
