import { createHash } from 'node:crypto'

import type { 事务执行上下文 } from '../database/transaction-runner.js'
import type { HTTP幂等提交未知只读Repository } from './commit-unknown-reconciliation.js'
import {
  判定HTTP幂等请求,
  type HTTP幂等决策,
  type HTTP幂等公开响应快照,
  type HTTP幂等已存记录
} from './http-idempotency.js'

/** SHA-256 十六进制摘要的固定字符数。 */
const SHA256十六进制长度 = Number('64')

/** Repository 允许写入的最小 HTTP 状态码。 */
const 最小HTTP状态码 = Number('200')

/** Repository 允许写入的最大 HTTP 状态码。 */
const 最大HTTP状态码 = Number('599')

/** 计数与时间边界使用的零值。 */
const 零 = Number('0')

/** 唯一行和成功写入使用的单位值。 */
const 一 = Number('1')

/**
 * 幂等数据违反不可变合同或数据库读回不完整时抛出的内部错误。
 *
 * 该错误只能映射为脱敏的 `SERVICE_UNAVAILABLE`，错误消息、SQL 行和摘要不得进入公开响应。
 */
export class HTTP幂等数据损坏错误 extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HTTP幂等数据损坏错误'
  }
}

/** MySQL 驱动返回的最小写入结果。 */
export type HTTP幂等SQL写入结果 = {
  /** 本次参数化语句真实影响的行数。 */
  readonly affectedRows: number
}

/**
 * Foundation 幂等 Repository 使用的参数化 SQL 执行端口。
 *
 * 具体适配器可以连接 CloudBase MySQL 或隔离测试 MySQL，但不得拼接参数、泄露连接对象，
 * 也不得脱离调用方传入的事务上下文执行写入。
 */
export type HTTP幂等SQL执行器<T事务 extends 事务执行上下文> = {
  /** 在指定事务内执行 INSERT 或 UPDATE，并返回真实影响行数。 */
  readonly 执行写入: (
    事务: T事务,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<HTTP幂等SQL写入结果>
  /** 在指定事务内执行参数化 SELECT；行锁生命周期必须服从该事务。 */
  readonly 执行查询: (
    事务: T事务,
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly HTTP幂等SQL行[]>
}

/**
 * 提交结果未知时使用的新连接参数化只读 SQL 端口。
 *
 * 该端口刻意不接收事务上下文、不提供写入方法，具体适配器必须从连接池获取并在查询后释放
 * 一条全新连接，不得复用提交结果未知的旧连接。
 */
export type HTTP幂等只读SQL执行器 = {
  /** 在新连接上执行无锁参数化 SELECT；禁止隐式开始业务事务。 */
  readonly 执行查询: (
    sql: string,
    parameters: readonly unknown[]
  ) => Promise<readonly HTTP幂等SQL行[]>
}

/** `http_idempotency_records` 的受控读回形状。 */
export type HTTP幂等SQL行 = {
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
export type HTTP幂等作用域 = {
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
export type HTTP幂等占位输入 = HTTP幂等作用域 & {
  /** 规范化请求内容的 SHA-256。 */
  readonly requestHash: string
  /** 当次请求锁定策略计算出的到期时间，UTC 毫秒。 */
  readonly expiresAtMs: number
  /** 占位创建时间，UTC 毫秒。 */
  readonly createdAtMs: number
}

/** 首次确定公开结果在原事务内完成所需的内部输入。 */
export type HTTP幂等完成输入 = HTTP幂等作用域 & {
  /** 首次占位时已经写入的规范化请求摘要。 */
  readonly requestHash: string
  /** 已完成公开 DTO 校验与脱敏的响应快照。 */
  readonly response: HTTP幂等公开响应快照
  /** 首次结果确定时间，UTC 毫秒。 */
  readonly completedAtMs: number
}

/** 成功取得唯一占位，调用方才可以继续执行领域命令。 */
export type HTTP幂等已占位结果 = {
  /** 表示当前请求已经真实写入唯一 processing 占位。 */
  readonly kind: 'reserved'
}

/** 首次结果已经在当前事务中写为完成态。 */
export type HTTP幂等已完成结果 = {
  /** 表示当前事务已经把首次公开结果写为 completed。 */
  readonly kind: 'completed'
  /** 已持久化且之后必须原样重放的公开响应。 */
  readonly response: HTTP幂等公开响应快照
}

/** 从纯协议联合类型中排除的“尚可尝试占位”分支。 */
type HTTP幂等首次占位协议决策 = {
  /** 纯协议建议尝试占位；Repository 返回前必须把它落实为 reserved 或其他确定决策。 */
  readonly kind: 'reserve'
}

/** MySQL HTTP 幂等 Repository 的受控公开端口。 */
export type MySQLHTTP幂等Repository<T事务 extends 事务执行上下文> = {
  /** 读取并锁定唯一作用域记录；不存在时返回 null。 */
  readonly 读取: (事务: T事务, 作用域: HTTP幂等作用域) => Promise<HTTP幂等已存记录 | null>
  /** 尝试写入唯一 processing 占位；冲突后在同一事务锁定并裁决获胜记录。 */
  readonly 尝试占位: (
    事务: T事务,
    输入: HTTP幂等占位输入
  ) => Promise<HTTP幂等已占位结果 | Exclude<HTTP幂等决策, HTTP幂等首次占位协议决策>>
  /** 把首次脱敏公开结果写为 completed；只允许更新同请求摘要的 processing 记录。 */
  readonly 完成首次结果: (
    事务: T事务,
    输入: HTTP幂等完成输入
  ) => Promise<HTTP幂等已完成结果 | Exclude<HTTP幂等决策, HTTP幂等首次占位协议决策>>
}

/** 判断未知值是否为普通 JSON 对象。 */
function 是普通对象(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 把公开响应转换为可跨进程复算的 JSON。
 *
 * 对象键按 Unicode 字典序排序；数组保留业务顺序；不允许 undefined、非有限数和非 JSON 值。
 */
function 规范化JSON值(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new HTTP幂等数据损坏错误('公开响应包含非有限数值')
    }
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => 规范化JSON值(item)).join(',')}]`
  }
  if (是普通对象(value)) {
    const 属性 = Object.keys(value)
      .sort()
      .map(key => `${JSON.stringify(key)}:${规范化JSON值(value[key])}`)
    return `{${属性.join(',')}}`
  }
  throw new HTTP幂等数据损坏错误('公开响应不是合法 JSON 值')
}

/** 计算规范化公开响应的 SHA-256。 */
function 计算公开响应摘要(body: Readonly<Record<string, unknown>>): {
  readonly json: string
  readonly hash: string
} {
  const json = 规范化JSON值(body)
  return { json, hash: createHash('sha256').update(json).digest('hex') }
}

/** 判断字符串是否为小写 SHA-256 十六进制摘要。 */
function 是SHA256(value: string): boolean {
  return new RegExp(`^[a-f0-9]{${SHA256十六进制长度}}$`, 'u').test(value)
}

/** 在执行 SQL 前验证只供内部调用的幂等作用域，避免 INSERT IGNORE 吞掉数据截断。 */
function 验证作用域(作用域: HTTP幂等作用域): void {
  if (!是SHA256(作用域.principalScopeHash) || !是SHA256(作用域.idempotencyKeyHash)) {
    throw new HTTP幂等数据损坏错误('幂等作用域摘要非法')
  }
  if (!/^[A-Z]{3,8}$/u.test(作用域.httpMethod)) {
    throw new HTTP幂等数据损坏错误('HTTP 方法不是受控大写值')
  }
  if (!作用域.normalizedPath.startsWith('/') || 作用域.normalizedPath.length > Number('191')) {
    throw new HTTP幂等数据损坏错误('规范化路由模板非法')
  }
  if (!/^[A-Za-z][A-Za-z0-9._-]{0,95}$/u.test(作用域.operationId)) {
    throw new HTTP幂等数据损坏错误('业务动作标识非法')
  }
}

/** 生成唯一作用域 SQL 参数，顺序与 DDL 唯一键完全一致。 */
function 生成作用域参数(作用域: HTTP幂等作用域): readonly unknown[] {
  return [
    作用域.principalType,
    作用域.principalScopeHash,
    作用域.httpMethod,
    作用域.normalizedPath,
    作用域.operationId,
    作用域.idempotencyKeyHash
  ]
}

/** 从数据库行安全恢复幂等协议记录，并核验完成结果完整性。 */
function 映射数据库行(row: HTTP幂等SQL行): HTTP幂等已存记录 {
  if (!是SHA256(row.request_hash)) {
    throw new HTTP幂等数据损坏错误('幂等请求摘要非法')
  }
  if (row.state === 'processing') {
    if (
      row.response_status !== null ||
      row.response_json !== null ||
      row.response_hash !== null ||
      row.stable_error_type !== null
    ) {
      throw new HTTP幂等数据损坏错误('处理中记录携带了公开响应')
    }
    return { requestHash: row.request_hash, state: 'processing' }
  }

  if (
    row.response_status === null ||
    row.response_status < 最小HTTP状态码 ||
    row.response_status > 最大HTTP状态码 ||
    row.response_json === null ||
    row.response_hash === null ||
    !是SHA256(row.response_hash)
  ) {
    throw new HTTP幂等数据损坏错误('完成记录缺少合法公开响应')
  }

  let parsed: unknown
  try {
    parsed =
      typeof row.response_json === 'string' ? JSON.parse(row.response_json) : row.response_json
  } catch {
    throw new HTTP幂等数据损坏错误('完成记录的公开响应不是合法 JSON')
  }
  if (!是普通对象(parsed)) {
    throw new HTTP幂等数据损坏错误('完成记录的公开响应不是对象包装')
  }
  const { hash } = 计算公开响应摘要(parsed)
  if (hash !== row.response_hash) {
    throw new HTTP幂等数据损坏错误('完成记录的公开响应摘要不匹配')
  }

  return {
    requestHash: row.request_hash,
    state: 'completed',
    response: { status: row.response_status, body: parsed }
  }
}

/** 从已脱敏公开错误响应中提取稳定错误类型；成功响应保持 null。 */
function 提取稳定错误类型(response: HTTP幂等公开响应快照): string | null {
  if (response.status < Number('400')) {
    return null
  }
  const error = response.body.error
  if (!是普通对象(error) || typeof error.type !== 'string' || error.type.length === 零) {
    throw new HTTP幂等数据损坏错误('失败响应缺少稳定公开错误类型')
  }
  return error.type
}

/**
 * 创建只供未知提交对账使用的无锁 MySQL Repository。
 *
 * 查询仅恢复数据库当前已提交视图；不使用 `FOR UPDATE`、不占位、不等待，也不修改任何记录。
 */
export function 创建MySQLHTTP幂等提交未知只读Repository(
  执行器: HTTP幂等只读SQL执行器
): HTTP幂等提交未知只读Repository {
  return {
    async 读取(作用域) {
      验证作用域(作用域)
      const rows = await 执行器.执行查询(
        `SELECT \`request_hash\`, \`state\`, \`response_status\`, \`response_json\`, \`response_hash\`, \`stable_error_type\`
         FROM \`http_idempotency_records\`
         WHERE \`principal_type\` = ?
           AND \`principal_scope_hash\` = ?
           AND \`http_method\` = ?
           AND \`normalized_path\` = ?
           AND \`operation_id\` = ?
           AND \`idempotency_key_hash\` = ?`,
        生成作用域参数(作用域)
      )
      if (rows.length === 零) {
        return null
      }
      if (rows.length !== 一) {
        throw new HTTP幂等数据损坏错误('唯一幂等作用域只读对账返回多条记录')
      }
      return 映射数据库行(rows[零] as HTTP幂等SQL行)
    }
  }
}

/** 创建只访问共享幂等表的 MySQL Repository。 */
export function 创建MySQLHTTP幂等Repository<T事务 extends 事务执行上下文>(
  执行器: HTTP幂等SQL执行器<T事务>
): MySQLHTTP幂等Repository<T事务> {
  const 读取 = async (事务: T事务, 作用域: HTTP幂等作用域): Promise<HTTP幂等已存记录 | null> => {
    验证作用域(作用域)
    const rows = await 执行器.执行查询(
      事务,
      `SELECT \`request_hash\`, \`state\`, \`response_status\`, \`response_json\`, \`response_hash\`, \`stable_error_type\`
       FROM \`http_idempotency_records\`
       WHERE \`principal_type\` = ?
         AND \`principal_scope_hash\` = ?
         AND \`http_method\` = ?
         AND \`normalized_path\` = ?
         AND \`operation_id\` = ?
         AND \`idempotency_key_hash\` = ?
       FOR UPDATE`,
      生成作用域参数(作用域)
    )
    if (rows.length === 零) {
      return null
    }
    if (rows.length !== 一) {
      throw new HTTP幂等数据损坏错误('唯一幂等作用域读回了多条记录')
    }
    return 映射数据库行(rows[零] as HTTP幂等SQL行)
  }

  return {
    读取,
    async 尝试占位(事务, 输入) {
      验证作用域(输入)
      if (
        !是SHA256(输入.requestHash) ||
        !Number.isSafeInteger(输入.createdAtMs) ||
        !Number.isSafeInteger(输入.expiresAtMs) ||
        输入.createdAtMs < 零 ||
        输入.expiresAtMs <= 输入.createdAtMs
      ) {
        throw new HTTP幂等数据损坏错误('幂等占位时间或请求摘要非法')
      }

      const result = await 执行器.执行写入(
        事务,
        `INSERT IGNORE INTO \`http_idempotency_records\`
          (\`_openid\`, \`principal_type\`, \`principal_scope_hash\`, \`http_method\`, \`normalized_path\`, \`operation_id\`, \`idempotency_key_hash\`, \`request_hash\`, \`state\`, \`response_status\`, \`response_json\`, \`response_hash\`, \`stable_error_type\`, \`expires_at_ms\`, \`completed_at_ms\`, \`created_at_ms\`, \`updated_at_ms\`)
         VALUES ('', ?, ?, ?, ?, ?, ?, ?, 'processing', NULL, NULL, NULL, NULL, ?, NULL, ?, ?)`,
        [
          ...生成作用域参数(输入),
          输入.requestHash,
          输入.expiresAtMs,
          输入.createdAtMs,
          输入.createdAtMs
        ]
      )
      if (result.affectedRows === 一) {
        return { kind: 'reserved' }
      }
      if (result.affectedRows !== 零) {
        throw new HTTP幂等数据损坏错误('幂等占位返回了非法影响行数')
      }

      const 已存记录 = await 读取(事务, 输入)
      if (已存记录 === null) {
        throw new HTTP幂等数据损坏错误('幂等占位冲突后未读回获胜记录')
      }
      const 决策 = 判定HTTP幂等请求(已存记录, 输入.requestHash)
      if (决策.kind === 'reserve') {
        throw new HTTP幂等数据损坏错误('已存幂等记录被错误裁决为首次占位')
      }
      return 决策
    },
    async 完成首次结果(事务, 输入) {
      验证作用域(输入)
      if (
        !是SHA256(输入.requestHash) ||
        !Number.isSafeInteger(输入.completedAtMs) ||
        输入.completedAtMs < 零 ||
        !Number.isInteger(输入.response.status) ||
        输入.response.status < 最小HTTP状态码 ||
        输入.response.status > 最大HTTP状态码 ||
        !是普通对象(输入.response.body)
      ) {
        throw new HTTP幂等数据损坏错误('幂等完成输入非法')
      }
      const { json, hash } = 计算公开响应摘要(输入.response.body)
      const stableErrorType = 提取稳定错误类型(输入.response)
      const result = await 执行器.执行写入(
        事务,
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
          输入.response.status,
          json,
          hash,
          stableErrorType,
          输入.completedAtMs,
          输入.completedAtMs,
          ...生成作用域参数(输入),
          输入.requestHash
        ]
      )
      if (result.affectedRows === 一) {
        return { kind: 'completed', response: 输入.response }
      }
      if (result.affectedRows !== 零) {
        throw new HTTP幂等数据损坏错误('幂等完成返回了非法影响行数')
      }

      const 已存记录 = await 读取(事务, 输入)
      if (已存记录 === null) {
        throw new HTTP幂等数据损坏错误('幂等完成未找到首次占位')
      }
      const 决策 = 判定HTTP幂等请求(已存记录, 输入.requestHash)
      if (决策.kind === 'reserve') {
        throw new HTTP幂等数据损坏错误('幂等完成读回被错误裁决为首次占位')
      }
      return 决策
    }
  }
}
