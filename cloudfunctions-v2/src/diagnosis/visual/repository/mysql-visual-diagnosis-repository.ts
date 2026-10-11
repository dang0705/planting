import type { Mysql2QueryConnection } from '../../../foundation/database/mysql2-connection-source.js'
import type { ContextSummary } from '../domain/context-summary.js'
import type {
  NewVisualSession,
  VisualReleaseReason,
  VisualSessionFinalization,
  VisualSessionPublicRow,
  VisualSessionStatus,
  VisualSubjectRecord,
  VisualVersionGroup
} from '../domain/visual-session-record.js'

/**
 * 视觉诊断 Repository（032_diagnosis_visual_sessions.sql）：唯一 SQL 入口。
 *
 * 通俗说明：像前端的 API service 层，把「读用户、核验归属、登记图片、创建/认领/完结会话、读历史、写反馈」
 * 封装成函数；调用方只拿到领域对象，内部主键只在服务端流转，不进入公开响应。
 * 不可变由数据库触发器兜底：终态后改写、删除都会被拒绝。
 */

/** 只需要连接的执行上下文（事务上下文或只读连接都满足）。 */
export interface VisualSqlContext {
  /** 参数化 SQL 连接。 */
  readonly connection: Mysql2QueryConnection
}

/** 读到的诊断对象（含归属核验结果）。 */
export type VisualSubjectRead =
  | {
      /** 对象类型：本人用户植物。 */
      readonly kind: 'user_plant'
      /** 用户植物内部主键。 */
      readonly internalId: string
      /** 用户植物公开引用。 */
      readonly userPlantRef: string
      /** 生命周期：active 可诊断；archived 返回 409。 */
      readonly lifecycle: 'active' | 'archived'
    }
  | {
      /** 对象类型：本人有效登录临时案例。 */
      readonly kind: 'authenticated_ephemeral'
      /** 临时案例内部主键。 */
      readonly internalId: string
    }

/** 待登记的图片。 */
export interface NewVisualImage {
  /** 高熵图片公开引用 dvi_…。 */
  readonly imageRef: string
  /** 本人诊断上传目录中的云文件 ID。 */
  readonly storageFileId: string
  /** 按魔数判定的真实类型。 */
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** 下载校验得到的字节数。 */
  readonly byteSize: number
  /** 下载内容的 SHA-256。 */
  readonly contentSha256: string
}

/** 已登记图片行。 */
export interface VisualImageRow {
  /** 图片公开引用，格式 dvi_…。 */
  readonly imageRef: string
  /** 云文件 ID（服务端内部使用）。 */
  readonly storageFileId: string
  /** 按文件魔数判定的真实图片类型。 */
  readonly mimeType: 'image/jpeg' | 'image/png' | 'image/webp'
  /** 登记时下载校验得到的字节数。 */
  readonly byteSize: number
  /** 内容 SHA-256。 */
  readonly contentSha256: string
}

/** 处理所需的会话快照。 */
export interface VisualSessionProcessingRow {
  /** 诊断公开引用，格式 vds_…。 */
  readonly visualDiagnosisRef: string
  /** 会话状态：处理中、已完成、释放不扣点或失败不扣点。 */
  readonly status: VisualSessionStatus
  /** 用户公开引用（额度结算按用户进行）。 */
  readonly userRef: string
  /** 诊断对象：本人用户植物或本人登录临时案例。 */
  readonly subject: VisualSubjectRecord
  /** 按 imageIndex 顺序的已登记图片。 */
  readonly images: readonly VisualImageRow[]
  /** 用户描述（≤200 字，只作症状线索）。 */
  readonly userQuestionZh: string | null
  /** AI 额度预占公开引用（不进入公开响应）。 */
  readonly reservationRef: string
  /** 版本组：创建时锁定的策略、提示词与名单版本。 */
  readonly versionGroup: VisualVersionGroup
  /** 已校验的诊断上下文摘要；没有时为 null。 */
  readonly contextSummary: ContextSummary | null
  /** 图片引用（按顺序）。 */
  readonly imageRefs: readonly string[]
  /** 创建时间，UTC 毫秒。 */
  readonly createdAtMs: number
}

/** 历史列表游标（创建时间 + 公开引用，不含内部主键）。 */
export interface VisualListCursor {
  /** 上一页最后一条的创建时间，UTC 毫秒。 */
  readonly createdAtMs: number
  /** 上一页最后一条的诊断公开引用。 */
  readonly visualDiagnosisRef: string
}

/** 卡在处理中的会话（低频补扫回收对象）。 */
export interface StaleVisualSession {
  /** 诊断公开引用，格式 vds_…。 */
  readonly visualDiagnosisRef: string
  /** 是否已被后台处理认领（已认领说明可能已调用模型，额度结果未知）。 */
  readonly claimed: boolean
}

/** 最小反馈写入。 */
export interface NewVisualFeedback {
  /** 高熵反馈公开引用 dvf_…。 */
  readonly feedbackRef: string
  /** 提交反馈的用户内部主键。 */
  readonly userInternalId: string
  /** 所属诊断公开引用（必须属于该用户）。 */
  readonly visualDiagnosisRef: string
  /** 反馈类型：有无帮助或回访结局。 */
  readonly feedbackKind: 'helpfulness' | 'follow_up_outcome'
  /** 反馈取值：有帮助/没帮助，或好转/无变化/恶化。 */
  readonly feedbackValue: 'helpful' | 'not_helpful' | 'improved' | 'unchanged' | 'worse'
  /** 提交时间，UTC 毫秒。 */
  readonly submittedAtMs: number
}

/** 仓储数据损坏（读回字段不合法）；调用方按 503 处理。 */
export class VisualDiagnosisDataError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VisualDiagnosisDataError'
  }
}

/** MySQL 唯一键冲突错误码。 */
const duplicateEntryCode = 'ER_DUP_ENTRY'

/** 安全整数（BIGINT 字符串或数字）。 */
function toNumber(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed)) {
    throw new VisualDiagnosisDataError('视觉诊断数值字段损坏')
  }
  return parsed
}

/** 可空安全整数。 */
function toNullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : toNumber(value)
}

/** BIGINT 内部主键统一为字符串。 */
function toId(value: unknown): string {
  return String(toNumber(value))
}

/** JSON 列读回（mysql2 通常已解析为对象；字符串时再解析一次）。 */
function toJson<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T
}

/** 可空 JSON 列。 */
function toNullableJson<T>(value: unknown): T | null {
  return value === null || value === undefined ? null : toJson<T>(value)
}

/** 判断是否唯一键冲突。 */
function isDuplicate(error: unknown): boolean {
  return (error as { code?: unknown })?.code === duplicateEntryCode
}

/** 公开字段 SELECT 片段（与 mapPublicRow 一一对应）。 */
const publicColumns = `s.visual_diagnosis_ref, s.status, s.created_at_ms, s.completed_at_ms, s.public_result_json,
  s.image_assessment_json, s.release_reason, s.charged_points, s.record_sha256, p.public_user_plant_id`

/** 行 → 公开读回对象。 */
function mapPublicRow(row: Record<string, unknown>): VisualSessionPublicRow {
  return {
    visualDiagnosisRef: String(row.visual_diagnosis_ref),
    status: row.status as VisualSessionStatus,
    createdAtMs: toNumber(row.created_at_ms),
    completedAtMs: toNullableNumber(row.completed_at_ms),
    publicResult: toNullableJson(row.public_result_json),
    imageAssessment: toNullableJson(row.image_assessment_json),
    releaseReason: (row.release_reason ?? null) as VisualReleaseReason | null,
    chargedPoints: toNullableNumber(row.charged_points),
    recordSha256: (row.record_sha256 ?? null) as string | null,
    userPlantRef: (row.public_user_plant_id ?? null) as string | null
  }
}

/** 行 → 图片对象。 */
function mapImageRow(row: Record<string, unknown>): VisualImageRow {
  return {
    imageRef: String(row.image_ref),
    storageFileId: String(row.storage_file_id),
    mimeType: row.mime_type as VisualImageRow['mimeType'],
    byteSize: toNumber(row.byte_size),
    contentSha256: String(row.content_sha256)
  }
}

/** 编码历史游标（base64url JSON）。 */
export function encodeVisualListCursor(cursor: VisualListCursor): string {
  return Buffer.from(
    JSON.stringify([cursor.createdAtMs, cursor.visualDiagnosisRef]),
    'utf8'
  ).toString('base64url')
}

/** 解码历史游标；不合法返回 null（调用方按 400 处理）。 */
export function decodeVisualListCursor(text: string): VisualListCursor | null {
  try {
    const value = JSON.parse(Buffer.from(text, 'base64url').toString('utf8')) as unknown
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      Number.isSafeInteger(value[0]) &&
      typeof value[1] === 'string' &&
      /^vds_[A-Za-z0-9_-]{8,60}$/u.test(value[1])
    ) {
      return { createdAtMs: value[0] as number, visualDiagnosisRef: value[1] }
    }
  } catch {
    return null
  }
  return null
}

/** 创建视觉诊断 Repository。 */
export function createMysqlVisualDiagnosisRepository() {
  /** 读取 active 用户内部主键；不存在返回 null。 */
  async function readUserInternalId(
    context: VisualSqlContext,
    userRef: string
  ): Promise<string | null> {
    const rows = await context.connection.query(
      "SELECT id FROM users WHERE BINARY public_user_id = ? AND status = 'active' LIMIT 1",
      [userRef]
    )
    return rows[0] === undefined ? null : toId(rows[0].id)
  }

  /** 核验诊断对象归属：用户植物（active/archived）或本人有效登录临时案例（active 且未过期）。 */
  async function readSubject(
    context: VisualSqlContext,
    input: {
      readonly userInternalId: string
      readonly subject:
        | { readonly userPlantRef: string }
        | { readonly ephemeralPlantCaseRef: string }
      readonly nowMs: number
    }
  ): Promise<VisualSubjectRead | null> {
    if ('userPlantRef' in input.subject) {
      const rows = await context.connection.query(
        `SELECT id, lifecycle_status, public_user_plant_id FROM user_plants
          WHERE user_internal_id = ? AND BINARY public_user_plant_id = ? AND lifecycle_status IN ('active', 'archived') LIMIT 1`,
        [input.userInternalId, input.subject.userPlantRef]
      )
      const row = rows[0]
      return row === undefined
        ? null
        : {
            kind: 'user_plant',
            internalId: toId(row.id),
            userPlantRef: String(row.public_user_plant_id),
            lifecycle: row.lifecycle_status === 'archived' ? 'archived' : 'active'
          }
    }
    const rows = await context.connection.query(
      `SELECT id FROM authenticated_ephemeral_plant_cases
        WHERE user_internal_id = ? AND BINARY ephemeral_plant_case_ref = ? AND status = 'active' AND expires_at_ms > ? LIMIT 1`,
      [input.userInternalId, input.subject.ephemeralPlantCaseRef, input.nowMs]
    )
    return rows[0] === undefined
      ? null
      : { kind: 'authenticated_ephemeral', internalId: toId(rows[0].id) }
  }

  /** 读取同一文件已登记的引用（只认本人）。 */
  async function readImageByFile(
    context: VisualSqlContext,
    userInternalId: string,
    storageFileId: string
  ) {
    const rows = await context.connection.query(
      'SELECT image_ref, user_internal_id FROM diagnosis_visual_images WHERE BINARY storage_file_id = ? LIMIT 1',
      [storageFileId]
    )
    const row = rows[0]
    if (row === undefined) {
      return null
    }
    if (toId(row.user_internal_id) !== userInternalId) {
      throw new VisualDiagnosisDataError('图片已被其他用户登记')
    }
    return String(row.image_ref)
  }

  /** 登记图片：同一文件重复登记返回已有引用（幂等）。 */
  async function insertImages(
    context: VisualSqlContext,
    input: {
      readonly userInternalId: string
      readonly images: readonly NewVisualImage[]
      readonly nowMs: number
    }
  ): Promise<readonly { readonly imageRef: string }[]> {
    const result: { imageRef: string }[] = []
    for (const image of input.images) {
      const existing = await readImageByFile(context, input.userInternalId, image.storageFileId)
      if (existing !== null) {
        result.push({ imageRef: existing })
        continue
      }
      try {
        await context.connection.execute(
          `INSERT INTO diagnosis_visual_images (_openid, image_ref, user_internal_id, storage_file_id, mime_type, byte_size, content_sha256, registered_at_ms, created_at_ms, updated_at_ms)
            VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            image.imageRef,
            input.userInternalId,
            image.storageFileId,
            image.mimeType,
            image.byteSize,
            image.contentSha256,
            input.nowMs,
            input.nowMs,
            input.nowMs
          ]
        )
        result.push({ imageRef: image.imageRef })
      } catch (error) {
        const raced = isDuplicate(error)
          ? await readImageByFile(context, input.userInternalId, image.storageFileId)
          : null
        if (raced === null) {
          throw error
        }
        result.push({ imageRef: raced })
      }
    }
    return result
  }

  /** 读取本人已登记图片（按请求顺序返回；不属于本人的被过滤，调用方据此返回 404）。 */
  async function readOwnedImages(
    context: VisualSqlContext,
    input: { readonly userInternalId: string; readonly imageRefs: readonly string[] }
  ): Promise<readonly VisualImageRow[]> {
    if (input.imageRefs.length === 0) {
      return []
    }
    const rows = await context.connection.query(
      `SELECT image_ref, storage_file_id, mime_type, byte_size, content_sha256 FROM diagnosis_visual_images
        WHERE user_internal_id = ? AND image_ref IN (${input.imageRefs.map(() => '?').join(', ')})`,
      [input.userInternalId, ...input.imageRefs]
    )
    const byRef = new Map(rows.map(row => [String(row.image_ref), mapImageRow(row)]))
    return input.imageRefs.flatMap(ref => {
      const image = byRef.get(ref)
      return image === undefined ? [] : [image]
    })
  }

  /** 创建处理中会话。 */
  async function insertSession(
    context: VisualSqlContext,
    session: NewVisualSession
  ): Promise<void> {
    await context.connection.execute(
      `INSERT INTO diagnosis_visual_sessions (_openid, visual_diagnosis_ref, user_internal_id, subject_kind, user_plant_internal_id,
          ephemeral_case_internal_id, image_refs_json, user_question_zh, reservation_ref, version_group_json, context_summary_json,
          status, created_at_ms, updated_at_ms)
        VALUES ('', ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, CAST(? AS JSON), CAST(? AS JSON), 'processing', ?, ?)`,
      [
        session.visualDiagnosisRef,
        session.userInternalId,
        session.subject.kind,
        session.subject.kind === 'user_plant' ? session.subject.internalId : null,
        session.subject.kind === 'authenticated_ephemeral' ? session.subject.internalId : null,
        JSON.stringify(session.imageRefs),
        session.userQuestionZh,
        session.reservationRef,
        JSON.stringify(session.versionGroup),
        session.contextSummary === null ? null : JSON.stringify(session.contextSummary),
        session.createdAtMs,
        session.createdAtMs
      ]
    )
  }

  /** 认领处理（同一会话只成功一次）。 */
  async function claimProcessing(
    context: VisualSqlContext,
    input: { readonly visualDiagnosisRef: string; readonly nowMs: number }
  ): Promise<boolean> {
    const result = await context.connection.execute(
      `UPDATE diagnosis_visual_sessions SET processing_claimed_at_ms = ?, updated_at_ms = GREATEST(updated_at_ms, ?)
        WHERE BINARY visual_diagnosis_ref = ? AND status = 'processing' AND processing_claimed_at_ms IS NULL`,
      [input.nowMs, input.nowMs, input.visualDiagnosisRef]
    )
    return result.affectedRows === 1
  }

  /** 读取处理所需快照（含按顺序的图片与用户公开引用）。 */
  async function readSessionForProcessing(
    context: VisualSqlContext,
    visualDiagnosisRef: string
  ): Promise<VisualSessionProcessingRow | null> {
    const rows = await context.connection.query(
      `SELECT s.visual_diagnosis_ref, s.status, s.user_internal_id, u.public_user_id, s.subject_kind, s.user_plant_internal_id,
          s.ephemeral_case_internal_id, p.public_user_plant_id, s.image_refs_json, s.user_question_zh, s.reservation_ref,
          s.version_group_json, s.context_summary_json, s.created_at_ms
        FROM diagnosis_visual_sessions s JOIN users u ON u.id = s.user_internal_id
        LEFT JOIN user_plants p ON p.id = s.user_plant_internal_id
        WHERE BINARY s.visual_diagnosis_ref = ? LIMIT 1`,
      [visualDiagnosisRef]
    )
    const row = rows[0]
    if (row === undefined) {
      return null
    }
    const userInternalId = toId(row.user_internal_id)
    const imageRefs = toJson<string[]>(row.image_refs_json)
    const images = await readOwnedImages(context, { userInternalId, imageRefs })
    if (images.length !== imageRefs.length) {
      throw new VisualDiagnosisDataError('视觉诊断图片读回不完整')
    }
    const subject: VisualSubjectRecord =
      row.subject_kind === 'user_plant'
        ? {
            kind: 'user_plant',
            internalId: toId(row.user_plant_internal_id),
            userPlantRef: String(row.public_user_plant_id)
          }
        : { kind: 'authenticated_ephemeral', internalId: toId(row.ephemeral_case_internal_id) }
    return {
      visualDiagnosisRef: String(row.visual_diagnosis_ref),
      status: row.status as VisualSessionStatus,
      userRef: String(row.public_user_id),
      subject,
      images,
      imageRefs,
      userQuestionZh: (row.user_question_zh ?? null) as string | null,
      reservationRef: String(row.reservation_ref),
      versionGroup: toJson<VisualVersionGroup>(row.version_group_json),
      contextSummary: toNullableJson<ContextSummary>(row.context_summary_json),
      createdAtMs: toNumber(row.created_at_ms)
    }
  }

  /** 写入一次终态；会话已不在处理中时返回 not_processing（不覆盖既有结果）。 */
  async function finalizeSession(
    context: VisualSqlContext,
    input: { readonly visualDiagnosisRef: string; readonly finalization: VisualSessionFinalization }
  ): Promise<'finalized' | 'not_processing'> {
    const f = input.finalization
    const result = await context.connection.execute(
      `UPDATE diagnosis_visual_sessions SET status = ?, release_reason = ?, public_result_json = CAST(? AS JSON),
          image_assessment_json = CAST(? AS JSON), model_code = ?, raw_text_sha256s_json = CAST(? AS JSON),
          model_calls_json = CAST(? AS JSON), model_attempts_json = CAST(? AS JSON), cost_micros = ?, charged_points = ?,
          quota_outcome = ?, record_sha256 = ?, completed_at_ms = ?, updated_at_ms = GREATEST(updated_at_ms, ?)
        WHERE BINARY visual_diagnosis_ref = ? AND status = 'processing'`,
      [
        f.status,
        f.releaseReason,
        f.publicResult === null ? null : JSON.stringify(f.publicResult),
        f.imageAssessment === null ? null : JSON.stringify(f.imageAssessment),
        f.modelCode,
        JSON.stringify(f.rawTextSha256s),
        JSON.stringify(f.calls),
        JSON.stringify(f.attempts),
        f.costMicros,
        f.chargedPoints,
        f.quotaOutcome,
        f.recordSha256,
        f.completedAtMs,
        f.completedAtMs,
        input.visualDiagnosisRef
      ]
    )
    return result.affectedRows === 1 ? 'finalized' : 'not_processing'
  }

  /** 列出 processing 且整单截止时刻（版本组 processingDeadlineMs）已过的会话，按截止时刻先后、限量；标明是否已被认领。 */
  async function listStaleProcessingSessions(
    context: VisualSqlContext,
    input: { readonly nowMs: number; readonly limit: number }
  ): Promise<readonly StaleVisualSession[]> {
    const rows = await context.connection.query(
      `SELECT visual_diagnosis_ref, processing_claimed_at_ms FROM diagnosis_visual_sessions
        WHERE status = 'processing'
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(version_group_json, '$.processingDeadlineMs')) AS UNSIGNED) < ?
        ORDER BY CAST(JSON_UNQUOTE(JSON_EXTRACT(version_group_json, '$.processingDeadlineMs')) AS UNSIGNED), id
        LIMIT ?`,
      [input.nowMs, input.limit]
    )
    return rows.map(row => ({
      visualDiagnosisRef: String(row.visual_diagnosis_ref),
      claimed: row.processing_claimed_at_ms !== null && row.processing_claimed_at_ms !== undefined
    }))
  }

  /** 读取本人会话的公开字段；非本人或不存在返回 null。 */
  async function readOwnedSession(
    context: VisualSqlContext,
    input: { readonly userInternalId: string; readonly visualDiagnosisRef: string }
  ): Promise<VisualSessionPublicRow | null> {
    const rows = await context.connection.query(
      `SELECT ${publicColumns} FROM diagnosis_visual_sessions s LEFT JOIN user_plants p ON p.id = s.user_plant_internal_id
        WHERE s.user_internal_id = ? AND BINARY s.visual_diagnosis_ref = ? LIMIT 1`,
      [input.userInternalId, input.visualDiagnosisRef]
    )
    return rows[0] === undefined ? null : mapPublicRow(rows[0])
  }

  /** 本人诊断历史：按创建时间倒序，可按植物筛选，游标翻页。 */
  async function listOwnedSessions(
    context: VisualSqlContext,
    input: {
      readonly userInternalId: string
      readonly userPlantRef: string | null
      readonly cursor: VisualListCursor | string | null
      readonly limit: number
    }
  ): Promise<{
    readonly rows: readonly VisualSessionPublicRow[]
    readonly nextCursor: string | null
  }> {
    const cursor =
      typeof input.cursor === 'string' ? decodeVisualListCursor(input.cursor) : input.cursor
    const conditions = ['s.user_internal_id = ?']
    const parameters: (string | number)[] = [input.userInternalId]
    if (input.userPlantRef !== null) {
      conditions.push('BINARY p.public_user_plant_id = ?')
      parameters.push(input.userPlantRef)
    }
    if (cursor !== null) {
      conditions.push(
        '(s.created_at_ms < ? OR (s.created_at_ms = ? AND BINARY s.visual_diagnosis_ref < ?))'
      )
      parameters.push(cursor.createdAtMs, cursor.createdAtMs, cursor.visualDiagnosisRef)
    }
    const rows = await context.connection.query(
      `SELECT ${publicColumns} FROM diagnosis_visual_sessions s LEFT JOIN user_plants p ON p.id = s.user_plant_internal_id
        WHERE ${conditions.join(' AND ')} ORDER BY s.created_at_ms DESC, s.visual_diagnosis_ref DESC LIMIT ?`,
      [...parameters, input.limit + 1]
    )
    const mapped = rows.map(mapPublicRow)
    const page = mapped.slice(0, input.limit)
    const last = page.at(-1)
    return {
      rows: page,
      nextCursor:
        mapped.length > input.limit && last !== undefined
          ? encodeVisualListCursor({
              createdAtMs: last.createdAtMs,
              visualDiagnosisRef: last.visualDiagnosisRef
            })
          : null
    }
  }

  /** 写入最小反馈：只追加；同一会话同类反馈只保留第一次；非本人会话返回 not_found。 */
  async function insertFeedback(
    context: VisualSqlContext,
    feedback: NewVisualFeedback
  ): Promise<'created' | 'duplicate' | 'not_found'> {
    const rows = await context.connection.query(
      'SELECT id FROM diagnosis_visual_sessions WHERE user_internal_id = ? AND BINARY visual_diagnosis_ref = ? LIMIT 1',
      [feedback.userInternalId, feedback.visualDiagnosisRef]
    )
    if (rows[0] === undefined) {
      return 'not_found'
    }
    try {
      await context.connection.execute(
        `INSERT INTO diagnosis_visual_feedback (_openid, feedback_ref, visual_session_internal_id, user_internal_id, feedback_kind,
            feedback_value, submitted_at_ms, created_at_ms, updated_at_ms) VALUES ('', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          feedback.feedbackRef,
          toId(rows[0].id),
          feedback.userInternalId,
          feedback.feedbackKind,
          feedback.feedbackValue,
          feedback.submittedAtMs,
          feedback.submittedAtMs,
          feedback.submittedAtMs
        ]
      )
      return 'created'
    } catch (error) {
      if (isDuplicate(error)) {
        return 'duplicate'
      }
      throw error
    }
  }

  return Object.freeze({
    readUserInternalId,
    readSubject,
    insertImages,
    readOwnedImages,
    insertSession,
    claimProcessing,
    readSessionForProcessing,
    finalizeSession,
    listStaleProcessingSessions,
    readOwnedSession,
    listOwnedSessions,
    insertFeedback
  })
}

/** 视觉诊断 Repository 类型。 */
export type MysqlVisualDiagnosisRepository = ReturnType<typeof createMysqlVisualDiagnosisRepository>
