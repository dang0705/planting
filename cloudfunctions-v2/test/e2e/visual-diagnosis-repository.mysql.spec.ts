import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { withReadConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlVisualDiagnosisRepository } from '../../src/diagnosis/visual/repository/mysql-visual-diagnosis-repository.js'
import type {
  NewVisualSession,
  VisualSessionFinalization
} from '../../src/diagnosis/visual/domain/visual-session-record.js'
import {
  startVisualDiagnosisMysqlHarness,
  visualHarnessRefs as refs,
  type VisualDiagnosisMysqlHarness
} from './support/visual-diagnosis-mysql-harness.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnd——会话与结果按 v2 公开结果持久化、不可变、带版本组与 SHA-256、可回放；
 * z8v0kmvh0f——反馈单独建表、只追加；diagnosis-visual-api.md §2.2（归属：用户植物不存在/非本人 404、已归档 409、
 * 临时案例非本人/不存在/已过期/非 active 404；图片未登记或非本人 404）与 §2.3（回放返回当时保存的结构化结果）。
 * 测试层次：unit_real_data（本机 Docker MySQL 8.4，按 manifest 执行全量 DDL 含 032）；不连接 CloudBase。
 */
const now = Date.UTC(2026, 9, 11, 8, 0, 0)
let harness: VisualDiagnosisMysqlHarness
const repository = createMysqlVisualDiagnosisRepository()
const tx = <T>(work: Parameters<typeof runDatabaseTransaction<never, T>>[1]) =>
  runDatabaseTransaction(harness.driver, work as never) as Promise<T>

const versionGroup = {
  policyReleaseVersion: 'diagnosis-visual-generation/v1.0.0',
  policyContentSha256: 'a'.repeat(64),
  promptReleaseSha256: 'b'.repeat(64),
  outputSchemaVersion: 'diagnosis-visual-gen-output/v1',
  agentAllowlistVersion: 'diagnosis-visual-gen-agent-allowlist/v1',
  maxImageBytes: 5_242_880,
  rules: { contractVersion: 'diagnosis-visual-generation/v1' }
}

function newSession(ref: string, reservationRef: string, createdAtMs: number, plant = true): NewVisualSession {
  return {
    visualDiagnosisRef: ref,
    userInternalId: '1',
    subject: plant
      ? { kind: 'user_plant', internalId: '11', userPlantRef: refs.activePlantRef }
      : { kind: 'authenticated_ephemeral', internalId: '31' },
    imageRefs: ['dvi_visual_image_0001'],
    userQuestionZh: '叶子发黄',
    reservationRef,
    versionGroup: versionGroup as never,
    contextSummary: null,
    createdAtMs
  }
}

const completed: VisualSessionFinalization = {
  status: 'completed',
  releaseReason: null,
  publicResult: { contractVersion: 'diagnosis-result/v2', titleZh: '白粉虱虫害' } as never,
  imageAssessment: {
    verdict: 'assessable',
    perImage: [{ imageIndex: 1, visiblePart: 'leaf_back', quality: 'good', qualityIssues: [] }]
  },
  modelCode: 'qwen3.7-flash',
  rawTextSha256s: ['c'.repeat(64)],
  calls: [{ modelCode: 'qwen3.7-flash', usage: { promptTokens: 9000, completionTokens: 1500, cachedTokens: 0, cacheCreationTokens: 0 } }],
  attempts: [{ modelCode: 'qwen3.7-flash', outcome: 'succeeded', httpStatus: 200 }],
  costMicros: 3000,
  chargedPoints: 4,
  quotaOutcome: 'settled',
  recordSha256: 'd'.repeat(64),
  completedAtMs: now + 5000
}

beforeAll(async () => {
  harness = await startVisualDiagnosisMysqlHarness({ name: 'repo', now, ownerQuota: 100 })
  harness.sql(`INSERT INTO diagnosis_visual_images (_openid, image_ref, user_internal_id, storage_file_id, mime_type, byte_size, content_sha256, registered_at_ms, created_at_ms, updated_at_ms)
    VALUES ('', 'dvi_visual_image_0001', 1, 'cloud://env.bucket/diagnosis/${refs.ownerRef}/visual/202610/${'1'.repeat(32)}.jpg', 'image/jpeg', 1000, '${'e'.repeat(64)}', ${now}, ${now}, ${now});`)
}, 120_000)

afterAll(() => harness?.stop())

describe('032 迁移与门禁触发器', () => {
  test('三张表与 6 个触发器存在', () => {
    expect(harness.sql(`SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('diagnosis_visual_images', 'diagnosis_visual_sessions', 'diagnosis_visual_feedback')`)).toBe('3')
    expect(harness.sql(`SELECT COUNT(*) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = DATABASE() AND TRIGGER_NAME LIKE 'tr_diag_visual_%'`)).toBe('6')
  })
})

describe('归属读取', () => {
  test('用户与诊断对象：active 植物、已归档植物、他人植物、有效与过期临时案例', async () => {
    await tx(async transaction => {
      const owner = await repository.readUserInternalId(transaction, refs.ownerRef)
      expect(owner).toBe('1')
      expect(await repository.readUserInternalId(transaction, 'usr_nobody_00000001')).toBeNull()
      expect(await repository.readSubject(transaction, { userInternalId: '1', subject: { userPlantRef: refs.activePlantRef }, nowMs: now }))
        .toEqual({ kind: 'user_plant', internalId: '11', userPlantRef: refs.activePlantRef, lifecycle: 'active' })
      expect(await repository.readSubject(transaction, { userInternalId: '1', subject: { userPlantRef: refs.archivedPlantRef }, nowMs: now }))
        .toMatchObject({ kind: 'user_plant', lifecycle: 'archived' })
      expect(await repository.readSubject(transaction, { userInternalId: '1', subject: { userPlantRef: refs.strangerPlantRef }, nowMs: now })).toBeNull()
      expect(await repository.readSubject(transaction, { userInternalId: '1', subject: { ephemeralPlantCaseRef: refs.activeCaseRef }, nowMs: now }))
        .toEqual({ kind: 'authenticated_ephemeral', internalId: '31' })
      expect(await repository.readSubject(transaction, { userInternalId: '1', subject: { ephemeralPlantCaseRef: refs.expiredCaseRef }, nowMs: now })).toBeNull()
      expect(await repository.readSubject(transaction, { userInternalId: '2', subject: { ephemeralPlantCaseRef: refs.activeCaseRef }, nowMs: now })).toBeNull()
    })
  })
})

describe('图片登记', () => {
  test('同一文件重复登记返回同一引用；他人读不到本人图片', async () => {
    const fileId = `cloud://env.bucket/diagnosis/${refs.ownerRef}/visual/202610/${'2'.repeat(32)}.png`
    const image = { imageRef: 'dvi_visual_image_0002', storageFileId: fileId, mimeType: 'image/png' as const, byteSize: 2000, contentSha256: 'f'.repeat(64) }
    const first = await tx(transaction => repository.insertImages(transaction, { userInternalId: '1', images: [image], nowMs: now }))
    const again = await tx(transaction =>
      repository.insertImages(transaction, { userInternalId: '1', images: [{ ...image, imageRef: 'dvi_visual_image_9999' }], nowMs: now })
    )
    expect(first).toEqual([{ imageRef: 'dvi_visual_image_0002' }])
    expect(again).toEqual([{ imageRef: 'dvi_visual_image_0002' }])
    await tx(async transaction => {
      expect((await repository.readOwnedImages(transaction, { userInternalId: '1', imageRefs: ['dvi_visual_image_0002'] })).map(row => row.storageFileId)).toEqual([fileId])
      expect(await repository.readOwnedImages(transaction, { userInternalId: '2', imageRefs: ['dvi_visual_image_0002'] })).toEqual([])
    })
    expect(() => harness.sql(`UPDATE diagnosis_visual_images SET byte_size = 1 WHERE image_ref = 'dvi_visual_image_0002'`)).toThrow(/不可修改/u)
  })
})

describe('会话：认领一次、终态一次、不可修改与回放', () => {
  test('创建 → 并发认领只成功一次 → 写终态 → 读回与写入一致 → 再次写终态被拒', async () => {
    await tx(transaction => repository.insertSession(transaction, newSession('vds_visual_session_0001', 'aqr_visual_reserve_0001', now)))
    const claims = await Promise.all([
      tx(transaction => repository.claimProcessing(transaction, { visualDiagnosisRef: 'vds_visual_session_0001', nowMs: now + 1 })),
      tx(transaction => repository.claimProcessing(transaction, { visualDiagnosisRef: 'vds_visual_session_0001', nowMs: now + 2 }))
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)
    const processing = await tx(transaction => repository.readSessionForProcessing(transaction, 'vds_visual_session_0001'))
    expect(processing).toMatchObject({
      visualDiagnosisRef: 'vds_visual_session_0001',
      userRef: refs.ownerRef,
      subject: { kind: 'user_plant', userPlantRef: refs.activePlantRef },
      images: [{ imageRef: 'dvi_visual_image_0001', mimeType: 'image/jpeg' }],
      reservationRef: 'aqr_visual_reserve_0001',
      userQuestionZh: '叶子发黄',
      versionGroup
    })
    expect(await tx(transaction => repository.finalizeSession(transaction, { visualDiagnosisRef: 'vds_visual_session_0001', finalization: completed }))).toBe('finalized')
    expect(await tx(transaction => repository.finalizeSession(transaction, { visualDiagnosisRef: 'vds_visual_session_0001', finalization: { ...completed, chargedPoints: 1 } }))).toBe('not_processing')
    const replay = await withReadConnection(harness.source, connection =>
      repository.readOwnedSession({ connection }, { userInternalId: '1', visualDiagnosisRef: 'vds_visual_session_0001' })
    )
    expect(replay).toMatchObject({
      visualDiagnosisRef: 'vds_visual_session_0001',
      status: 'completed',
      createdAtMs: now,
      completedAtMs: now + 5000,
      publicResult: completed.publicResult,
      imageAssessment: completed.imageAssessment,
      chargedPoints: 4,
      releaseReason: null,
      recordSha256: 'd'.repeat(64),
      userPlantRef: refs.activePlantRef
    })
    expect(await withReadConnection(harness.source, connection =>
      repository.readOwnedSession({ connection }, { userInternalId: '2', visualDiagnosisRef: 'vds_visual_session_0001' })
    )).toBeNull()
    expect(() => harness.sql(`UPDATE diagnosis_visual_sessions SET charged_points = 0 WHERE visual_diagnosis_ref = 'vds_visual_session_0001'`)).toThrow(/不可修改/u)
    expect(() => harness.sql(`DELETE FROM diagnosis_visual_sessions WHERE visual_diagnosis_ref = 'vds_visual_session_0001'`)).toThrow(/不可删除/u)
  })

  test('处理中也不得改写输入与版本组；不得以终态直接创建', async () => {
    await tx(transaction => repository.insertSession(transaction, newSession('vds_visual_session_0002', 'aqr_visual_reserve_0002', now + 10, false)))
    expect(() => harness.sql(`UPDATE diagnosis_visual_sessions SET user_question_zh = '改' WHERE visual_diagnosis_ref = 'vds_visual_session_0002'`)).toThrow(/不可修改/u)
    expect(() => harness.sql(`INSERT INTO diagnosis_visual_sessions (_openid, visual_diagnosis_ref, user_internal_id, subject_kind, user_plant_internal_id, ephemeral_case_internal_id, image_refs_json, reservation_ref, version_group_json, status, release_reason, charged_points, quota_outcome, record_sha256, completed_at_ms, image_assessment_json, created_at_ms, updated_at_ms)
      VALUES ('', 'vds_visual_bad_0000001', 1, 'user_plant', 11, NULL, '[]', 'aqr_bad_000000001', '{}', 'failed_no_charge', 'model_failed', 0, 'released', '${'1'.repeat(64)}', ${now}, NULL, ${now}, ${now})`)).toThrow(/处理中/u)
  })

  test('历史列表：本人、按时间倒序、可按植物筛选、游标翻页；临时案例不带植物引用', async () => {
    await tx(transaction => repository.insertSession(transaction, newSession('vds_visual_session_0003', 'aqr_visual_reserve_0003', now + 20)))
    const page1 = await withReadConnection(harness.source, connection =>
      repository.listOwnedSessions({ connection }, { userInternalId: '1', userPlantRef: null, cursor: null, limit: 2 })
    )
    expect(page1.rows.map(row => row.visualDiagnosisRef)).toEqual(['vds_visual_session_0003', 'vds_visual_session_0002'])
    expect(page1.rows[1]?.userPlantRef).toBeNull()
    expect(page1.nextCursor).not.toBeNull()
    const page2 = await withReadConnection(harness.source, connection =>
      repository.listOwnedSessions({ connection }, { userInternalId: '1', userPlantRef: null, cursor: page1.nextCursor, limit: 2 })
    )
    expect(page2.rows.map(row => row.visualDiagnosisRef)).toEqual(['vds_visual_session_0001'])
    expect(page2.nextCursor).toBeNull()
    const plantOnly = await withReadConnection(harness.source, connection =>
      repository.listOwnedSessions({ connection }, { userInternalId: '1', userPlantRef: refs.activePlantRef, cursor: null, limit: 10 })
    )
    expect(plantOnly.rows.map(row => row.visualDiagnosisRef)).toEqual(['vds_visual_session_0003', 'vds_visual_session_0001'])
    expect((await withReadConnection(harness.source, connection =>
      repository.listOwnedSessions({ connection }, { userInternalId: '2', userPlantRef: null, cursor: null, limit: 10 })
    )).rows).toEqual([])
  })
})

describe('最小反馈：只追加、每类一条、只能本人提交', () => {
  test('有帮助反馈写入一次；同类再次提交为 duplicate；他人提交为 not_found；不可修改', async () => {
    const submit = (userInternalId: string, value: 'helpful' | 'not_helpful', feedbackRef: string) =>
      tx(transaction =>
        repository.insertFeedback(transaction, {
          feedbackRef,
          userInternalId,
          visualDiagnosisRef: 'vds_visual_session_0001',
          feedbackKind: 'helpfulness',
          feedbackValue: value,
          submittedAtMs: now + 6000
        })
      )
    expect(await submit('1', 'helpful', 'dvf_visual_feedback_01')).toBe('created')
    expect(await submit('1', 'not_helpful', 'dvf_visual_feedback_02')).toBe('duplicate')
    expect(await submit('2', 'helpful', 'dvf_visual_feedback_03')).toBe('not_found')
    expect(() => harness.sql(`UPDATE diagnosis_visual_feedback SET feedback_value = 'not_helpful'`)).toThrow(/只追加/u)
  })
})
