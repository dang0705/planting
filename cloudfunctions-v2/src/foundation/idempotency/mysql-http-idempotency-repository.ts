import { createHash } from 'node:crypto'

import type { TransactionExecutionContext } from '../database/transaction-runner.js'
import type { HttpIdempotencyCommitUnknownReadOnlyRepository } from './commit-unknown-reconciliation.js'
import {
  determineHttpIdempotencyRequest,
  type HttpIdempotencyDecision,
  type HttpIdempotencyPublicResponseSnapshot,
  type HttpIdempotencyStoredRecord
} from './http-idempotency.js'

/** SHA-256 十六进制摘要的固定字符数。 */
const sha256HexLength = Number('64')

/** Repository 允许写入的最小 HTTP 状态码。 */
const minHTTPStatusCode = Number('200')

/** Repository 允许写入的最大 HTTP 状态码。 */
const maxHTTPStatusCode = Number('599')

/** 计数与时间边界使用的零值。 */
const zero = Number('0')

/** 唯一行和成功写入使用的单位值。 */
const one = Number('1')

/**
 * 幂等数据违反不可变合同或数据库读回不完整时抛出的内部错误。
 *
 * 该错误只能映射为脱敏的 `SERVICE_UNAVAILABLE`，错误消息、SQL 行和摘要不得进入公开响应。
 */
export class HttpIdempotencyDataCorruptedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HTTP幂等数据损坏错误'
  }
}

/** MySQL 驱动返回的最小写入结果。 */
export type HttpIdempotencySqlWriteResult = {
  /** 本次参数化语句真实影响的行数。 */
  readonly affectedRows: number
}

/**
 * Foundation 幂等 Repository 使用的参数化 SQL 执行端口。
 *
 * 具体适配器可以连接 CloudBase MySQL 或隔离测试 MySQL，但不得拼接参数、泄露连接对象，
 * 也不得脱离调用方传入的事务上下文执行写入。
 */
export type HttpIdempotencySqlExecutor<TTransaction extends TransactionExecutionContext> = {
  /** 在指定事务内执行 INSERT 或 UPDATE，并返回真实影响行数。 */
  readonly executeWrite: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<HttpIdempotencySqlWriteResult>
  /** 在指定事务内执行参数化 SELECT；行锁生命周期必须服从该事务。 */
  readonly executeQuery: (
    transaction: TTransaction,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly HttpIdempotencySqlRow[]>
}

/**
 * 提交结果未知时使用的新连接参数化只读 SQL 端口。
 *
 * 该端口刻意不接收事务上下文、不提供写入方法，具体适配器必须从连接池获取并在查询后释放
 * 一条全新连接，不得复用提交结果未知的旧连接。
 */
export type HttpIdempotencyReadOnlySqlExecutor = {
  /** 在新连接上执行无锁参数化 SELECT；禁止隐式开始业务事务。 */
  readonly executeQuery: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly HttpIdempotencySqlRow[]>
}

/** `http_idempotency_records` 的受控读回形状。 */
export type HttpIdempotencySqlRow = {
  /** 规范化请求内容的 SHA-256。 */
  readonly request_hash: string
  /** 当前持久化状态；只允许处理中或已完成。 */
  readonly state: 'processing' | 'completed'
  /** 首次确定公开结果的 HTTP 状态码；处理中必须为空。 */
  readonly response_status: number | null
  /** 首次确定公开 JSON；驱动可以返回字符串或已解析对象。 */
  readonly response_json: string | Readonly<Record<string, unknown>> | null
  /** 规范化公开 JSON 的 SHA-256；处理中必须为空。 */
  readonly response_hash: string | null
  /** 已确定失败时的公开稳定错误类型；成功或处理中为空。 */
  readonly stable_error_type: string | null
}

/** 共享 HTTP 幂等唯一作用域；全部标识均为公开模板或不可逆摘要。 */
export type HttpIdempotencyScope = {
  /** 当前统一访问主体类型。 */
  readonly principalType: 'guest' | 'user' | 'service'
  /** 主体作用域不可逆 SHA-256，不得传入 user_id、游客令牌或服务密钥原文。 */
  readonly principalScopeHash: string
  /** 大写 HTTP 方法。 */
  readonly httpMethod: string
  /** 不含真实标识和敏感查询参数的规范化路由模板。 */
  readonly normalizedPath: string
  /** 路由登记表中的稳定业务动作。 */
  readonly operationId: string
  /** `Idempotency-Key` 的不可逆 SHA-256，不得传入原始请求头。 */
  readonly idempotencyKeyHash: string
}

/** 首次请求尝试写入 processing 占位所需的内部输入。 */
export type HttpIdempotencyReservationInput = HttpIdempotencyScope & {
  /** 规范化请求内容的 SHA-256。 */
  readonly requestHash: string
  /** 当次请求锁定策略计算出的到期时间，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 占位创建时间，UTC 毫秒。 */
  readonly createdAtMs: number
}

/** 首次确定公开结果在原事务内完成所需的内部输入。 */
export type HttpIdempotencyCompletionInput = HttpIdempotencyScope & {
  /** 首次占位时已经写入的规范化请求摘要。 */
  readonly requestHash: string
  /** 已完成公开 DTO 校验与脱敏的响应快照。 */
  readonly response: HttpIdempotencyPublicResponseSnapshot
  /** 首次结果确定时间，UTC 毫秒。 */
  readonly completedAtMs: number
}

/** 成功取得唯一占位，调用方才可以继续执行领域命令。 */
export type HttpIdempotencyReservationResult = {
  /** 表示当前请求已经真实写入唯一 processing 占位。 */
  readonly kind: 'reserved'
}

/** 首次结果已经在当前事务中写为完成态。 */
export type HttpIdempotencyCompletedResult = {
  /** 表示当前事务已经把首次公开结果写为 completed。 */
  readonly kind: 'completed'
  /** 已持久化且之后必须原样重放的公开响应。 */
  readonly response: HttpIdempotencyPublicResponseSnapshot
}

/** 从纯协议联合类型中排除的“尚可尝试占位”分支。 */
type HttpIdempotencyFirstReservationProtocolDecision = {
  /** 纯协议建议尝试占位；Repository 返回前必须把它落实为 reserved 或其他确定决策。 */
  readonly kind: 'reserve'
}

/** MySQL HTTP 幂等 Repository 的受控公开端口。 */
export type MysqlHttpIdempotencyRepository<TTransaction extends TransactionExecutionContext> = {
  /** 读取并锁定唯一作用域记录；不存在时返回 null。 */
  readonly read: (transaction: TTransaction, scope: HttpIdempotencyScope) => Promise<HttpIdempotencyStoredRecord | null>
  /** 尝试写入唯一 processing 占位；冲突后在同一事务锁定并裁决获胜记录。 */
  readonly tryReserve: (
    transaction: TTransaction,
    input: HttpIdempotencyReservationInput
  ) => Promise<HttpIdempotencyReservationResult | Exclude<HttpIdempotencyDecision, HttpIdempotencyFirstReservationProtocolDecision>>
  /** 把首次脱敏公开结果写为 completed；只允许更新同请求摘要的 processing 记录。 */
  readonly completionFirstResult: (
    transaction: TTransaction,
    input: HttpIdempotencyCompletionInput
  ) => Promise<HttpIdempotencyCompletedResult | Exclude<HttpIdempotencyDecision, HttpIdempotencyFirstReservationProtocolDecision>>
}

/** 判断未知值是否为普通 JSON 对象。 */
function isNormalObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把公开响应转换为可跨进程复算的 JSON。
 *
 * 对象键按 Unicode 字典序排序；数组保留业务顺序；不允许 undefined、非有限数和非 JSON 值。
 */
function normalizeJsonValue(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new HttpIdempotencyDataCorruptedError('公开响应包含非有限数值')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => normalizeJsonValue(item)).join(',')}]`
  }
  if (isNormalObject(value)) {
    const property = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${normalizeJsonValue(value[key])}`)
    return `{${property.join(',')}}`
  }
  throw new HttpIdempotencyDataCorruptedError('公开响应不是合法 JSON 值')
}

/** 计算规范化公开响应的 SHA-256。 */
function calculatePublicResponseDigest(body: Readonly<Record<string, unknown>>): {
  readonly json: string
  readonly hash: string
} {
  const json = normalizeJsonValue(body)
  return { json, hash: createHash('sha256').update(json).digest('hex') }
}

/** 判断字符串是否为小写 SHA-256 十六进制摘要。 */
function isSha256(value: string): boolean {
  return new RegExp(`^[a-f0-9]{${sha256HexLength}}$`, 'u').test(value)
}

/** 在执行 SQL 前验证只供内部调用的幂等作用域，避免 INSERT IGNORE 吞掉数据截断。 */
function verifyScope(scope: HttpIdempotencyScope): void {
  if (!isSha256(scope.principalScopeHash) || !isSha256(scope.idempotencyKeyHash)) {
    throw new HttpIdempotencyDataCorruptedError('幂等作用域摘要非法')
  }
  if (!/^[A-Z]{3,8}$/u.test(scope.httpMethod)) {
    throw new HttpIdempotencyDataCorruptedError('HTTP 方法不是受控大写值')
  }
  if (!scope.normalizedPath.startsWith('/') || scope.normalizedPath.length > Number('191')) {
    throw new HttpIdempotencyDataCorruptedError('规范化路由模板非法')
  }
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,95}$/u.test(scope.operationId)) {
    throw new HttpIdempotencyDataCorruptedError('业务动作标识非法')
  }
}

/** 生成唯一作用域 SQL 参数，顺序与 DDL 唯一键完全一致。 */
function buildScopeParameter(scope: HttpIdempotencyScope): readonly unknown[] {
  return [
    scope.principalType,
    scope.principalScopeHash,
    scope.httpMethod,
    scope.normalizedPath,
    scope.operationId,
    scope.idempotencyKeyHash
  ]
}

/** 从数据库行安全恢复幂等协议记录，并核验完成结果完整性。 */
function mapDatabaseRow(row: HttpIdempotencySqlRow): HttpIdempotencyStoredRecord {
  if (!isSha256(row.request_hash)) {
    throw new HttpIdempotencyDataCorruptedError('幂等请求摘要非法')
  }
  if (row.state === 'processing') {
    if (
      row.response_status !== null ||
      row.response_json !== null ||
      row.response_hash !== null ||
      row.stable_error_type !== null
    ) {
      throw new HttpIdempotencyDataCorruptedError('处理中记录携带了公开响应')
    }
    return { requestHash: row.request_hash, state: 'processing' }
  }

  if (
    row.response_status === null ||
    row.response_status < minHTTPStatusCode ||
    row.response_status > maxHTTPStatusCode ||
    row.response_json === null ||
    row.response_hash === null ||
    !isSha256(row.response_hash)
  ) {
    throw new HttpIdempotencyDataCorruptedError('完成记录缺少合法公开响应')
  }

  let parsed: unknown
  try {
    parsed =
      typeof row.response_json === 'string' ? JSON.parse(row.response_json) : row.response_json
  } catch {
    throw new HttpIdempotencyDataCorruptedError('完成记录的公开响应不是合法 JSON')
  }
  if (!isNormalObject(parsed)) {
    throw new HttpIdempotencyDataCorruptedError('完成记录的公开响应不是对象包装')
  }
  const { hash } = calculatePublicResponseDigest(parsed)
  if (hash !== row.response_hash) {
    throw new HttpIdempotencyDataCorruptedError('完成记录的公开响应摘要不匹配')
  }

  return {
    requestHash: row.request_hash,
    state: 'completed',
    response: { status: row.response_status, body: parsed }
  }
}

/** 从已脱敏公开错误响应中提取稳定错误类型；成功响应保持 null。 */
function extractStableErrorType(response: HttpIdempotencyPublicResponseSnapshot): string | null {
  if (response.status < Number('400')) {
    return null
  }
  const error = response.body.error
  if (!isNormalObject(error) || typeof error.type !== 'string' || error.type.length === zero) {
    throw new HttpIdempotencyDataCorruptedError('失败响应缺少稳定公开错误类型')
  }
  return error.type
}

/**
 * 创建只供未知提交对账使用的无锁 MySQL Repository。
 *
 * 查询仅恢复数据库当前已提交视图；不使用 `FOR UPDATE`、不占位、不等待，也不修改任何记录。
 */
export function createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository(
  executor: HttpIdempotencyReadOnlySqlExecutor
): HttpIdempotencyCommitUnknownReadOnlyRepository {
  return {
    async read(scope) {
      verifyScope(scope)
      const rows = await executor.executeQuery(
        `SELECT \`request_hash\`, \`state\`, \`response_status\`, \`response_json\`, \`response_hash\`, \`stable_error_type\`
         FROM \`http_idempotency_records\`
         WHERE \`principal_type\` = ?
           AND \`principal_scope_hash\` = ?
           AND \`http_method\` = ?
           AND \`normalized_path\` = ?
           AND \`operation_id\` = ?
           AND \`idempotency_key_hash\` = ?`,
        buildScopeParameter(scope)
      )
      if (rows.length === zero) {
        return null
      }
      if (rows.length !== one) {
        throw new HttpIdempotencyDataCorruptedError('唯一幂等作用域只读对账返回多条记录')
      }
      return mapDatabaseRow(rows[zero] as HttpIdempotencySqlRow)
    }
  }
}

/** 创建只访问共享幂等表的 MySQL Repository。 */
export function createMysqlHttpIdempotencyRepository<TTransaction extends TransactionExecutionContext>(
  executor: HttpIdempotencySqlExecutor<TTransaction>
): MysqlHttpIdempotencyRepository<TTransaction> {
  const read = async (transaction: TTransaction, scope: HttpIdempotencyScope): Promise<HttpIdempotencyStoredRecord | null> => {
    verifyScope(scope)
    const rows = await executor.executeQuery(
      transaction,
      `SELECT \`request_hash\`, \`state\`, \`response_status\`, \`response_json\`, \`response_hash\`, \`stable_error_type\`
       FROM \`http_idempotency_records\`
       WHERE \`principal_type\` = ?
         AND \`principal_scope_hash\` = ?
         AND \`http_method\` = ?
         AND \`normalized_path\` = ?
         AND \`operation_id\` = ?
         AND \`idempotency_key_hash\` = ?
       FOR UPDATE`,
      buildScopeParameter(scope)
    )
    if (rows.length === zero) {
      return null
    }
    if (rows.length !== one) {
      throw new HttpIdempotencyDataCorruptedError('唯一幂等作用域读回了多条记录')
    }
    return mapDatabaseRow(rows[zero] as HttpIdempotencySqlRow)
  }

  return {
    read,
    async tryReserve(transaction, input) {
      verifyScope(input)
      if (
        !isSha256(input.requestHash) ||
        !Number.isSafeInteger(input.createdAtMs) ||
        !Number.isSafeInteger(input.expiresAtMs) ||
        input.createdAtMs < zero ||
        input.expiresAtMs <= input.createdAtMs
      ) {
        throw new HttpIdempotencyDataCorruptedError('幂等占位时间或请求摘要非法')
      }

      const result = await executor.executeWrite(
        transaction,
        `INSERT IGNORE INTO \`http_idempotency_records\`
          (\`_openid\`, \`principal_type\`, \`principal_scope_hash\`, \`http_method\`, \`normalized_path\`, \`operation_id\`, \`idempotency_key_hash\`, \`request_hash\`, \`state\`, \`response_status\`, \`response_json\`, \`response_hash\`, \`stable_error_type\`, \`expires_at_ms\`, \`completed_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
         VALUES ('', ?, ?, ?, ?, ?, ?, ?, 'processing', NULL, NULL, NULL, NULL, ?, NULL, ?, ?)`,
        [
          ...buildScopeParameter(input),
          input.requestHash,
          input.expiresAtMs,
          input.createdAtMs,
          input.createdAtMs
        ]
      )
      if (result.affectedRows === one) {
        return { kind: 'reserved' }
      }
      if (result.affectedRows !== zero) {
        throw new HttpIdempotencyDataCorruptedError('幂等占位返回了非法影响行数')
      }

      const storedRecord = await read(transaction, input)
      if (storedRecord === null) {
        throw new HttpIdempotencyDataCorruptedError('幂等占位冲突后未读回获胜记录')
      }
      const decision = determineHttpIdempotencyRequest(storedRecord, input.requestHash)
      if (decision.kind === 'reserve') {
        throw new HttpIdempotencyDataCorruptedError('已存幂等记录被错误裁决为首次占位')
      }
      return decision
    },
    async completionFirstResult(transaction, input) {
      verifyScope(input)
      if (
        !isSha256(input.requestHash) ||
        !Number.isSafeInteger(input.completedAtMs) ||
        input.completedAtMs < zero ||
        !Number.isInteger(input.response.status) ||
        input.response.status < minHTTPStatusCode ||
        input.response.status > maxHTTPStatusCode ||
        !isNormalObject(input.response.body)
      ) {
        throw new HttpIdempotencyDataCorruptedError('幂等完成输入非法')
      }
      const { json, hash } = calculatePublicResponseDigest(input.response.body)
      const stableErrorType = extractStableErrorType(input.response)
      const result = await executor.executeWrite(
        transaction,
        `UPDATE \`http_idempotency_records\`
         SET \`state\` = 'completed',
             \`response_status\` = ?,
             \`response_json\` = CAST(? AS JSON),
             \`response_hash\` = ?,
             \`stable_error_type\` = ?,
             \`completed_at_ms\` = ?,
             \`updated_at_ms\` = ?
         WHERE \`principal_type\` = ?
           AND \`principal_scope_hash\` = ?
           AND \`http_method\` = ?
           AND \`normalized_path\` = ?
           AND \`operation_id\` = ?
           AND \`idempotency_key_hash\` = ?
           AND \`request_hash\` = ?
           AND \`state\` = 'processing'`,
        [
          input.response.status,
          json,
          hash,
          stableErrorType,
          input.completedAtMs,
          input.completedAtMs,
          ...buildScopeParameter(input),
          input.requestHash
        ]
      )
      if (result.affectedRows === one) {
        return { kind: 'completed', response: input.response }
      }
      if (result.affectedRows !== zero) {
        throw new HttpIdempotencyDataCorruptedError('幂等完成返回了非法影响行数')
      }

      const storedRecord = await read(transaction, input)
      if (storedRecord === null) {
        throw new HttpIdempotencyDataCorruptedError('幂等完成未找到首次占位')
      }
      const decision = determineHttpIdempotencyRequest(storedRecord, input.requestHash)
      if (decision.kind === 'reserve') {
        throw new HttpIdempotencyDataCorruptedError('幂等完成读回被错误裁决为首次占位')
      }
      return decision
    }
  }
}
