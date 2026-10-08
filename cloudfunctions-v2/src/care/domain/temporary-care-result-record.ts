import { calculateCanonicalJsonSha256, serializeCanonicalJson, type CanonicalJsonObject } from '../../foundation/json/canonical-json-sha256.js'

/** 已经通过身份验真的内部调用上下文；引用本身不能充当凭证。 */
export type TemporaryCareOwner = {
  /** 登录用户自愿使用临时案例。 */ readonly kind: 'authenticated'
  /** identity 解析的统一用户。 */ readonly userRef: string
  /** 已有登录临时案例。 */ readonly caseRef: string
} | {
  /** 游客持有证明已由上游验证。 */ readonly kind: 'guest'
  /** 验证后的游客会话引用。 */ readonly guestSessionRef: string
  /** 该游客会话拥有的植物案例。 */ readonly caseRef: string
}

/** 内部不可变结果，不作为公开 API 请求或响应。四份正文须先通过各自业务合同验证。 */
export interface TemporaryCareResultRecord {
  /** 二选一的已验真归属。 */ readonly owner: TemporaryCareOwner
  /** 已存在的临时养护会话。 */ readonly sessionRef: string
  /** 服务端生成的高熵结果引用。 */ readonly resultRef: string
  /** 当次环境合同，不跟随最新代码改写。 */ readonly environmentContractVersion: string
  /** 锁定的证据和配置输入。 */ readonly inputManifest: CanonicalJsonObject
  /** 实际使用的发布引用与摘要；无发布必须明确缺失。 */ readonly algorithmReleaseManifest: CanonicalJsonObject
  /** 受控推导集；不能包含思维链。 */ readonly derivations: CanonicalJsonObject
  /** 经应用用例准入并脱敏的统一结果。 */ readonly result: CanonicalJsonObject
  /** 服务端计算生成时刻。 */ readonly generatedAtMs: number
  /** 已锁定策略给出的到期时刻，本层不延长期限。 */ readonly expiresAtMs: number
}

/** 经过规范 JSON 复制及摘要核验的存储记录。 */
export interface LockedTemporaryCareResult extends TemporaryCareResultRecord {
  /** 对四份实际正文分别计算，不能接受调用者自报的摘要。 */
  readonly hashes: {
    /** 锁定输入清单正文的 SHA-256 摘要。 */ readonly inputManifest: string
    /** 算法发布清单正文的 SHA-256 摘要。 */ readonly algorithmReleaseManifest: string
    /** 受控推导集正文的 SHA-256 摘要。 */ readonly derivations: string
    /** 脱敏统一结果正文的 SHA-256 摘要。 */ readonly result: string
  }
}

/** 引用和版本沿用数据库字符容量；不是可调业务参数。 */
export function validateCareReference(value: unknown, max = 64): asserts value is string {
  if (typeof value !== 'string' || !value.length || value.trim() !== value || [...value].length > max) {
    throw new TypeError('临时养护引用或版本非法')
  }
}

/** UTC 毫秒必须在 JavaScript 日期与数据库整数的共同范围内。 */
export function validateCareTime(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) {
    throw new TypeError('临时养护时间非法')
  }
}

/** 严格归属二选一，拒绝同时自报两种身份或未知附加字段。 */
export function lockTemporaryCareOwner(owner: TemporaryCareOwner): TemporaryCareOwner {
  if (!owner || typeof owner !== 'object' || Array.isArray(owner)) { throw new TypeError('缺少临时案例归属') }
  const keys = owner.kind === 'authenticated' ? ['kind', 'userRef', 'caseRef'] : ['kind', 'guestSessionRef', 'caseRef']
  if (!['authenticated', 'guest'].includes(owner.kind) || Object.keys(owner).length !== 3
    || Object.keys(owner).some(k => !keys.includes(k))) { throw new TypeError('临时案例归属必须二选一') }
  validateCareReference(owner.caseRef)
  validateCareReference(owner.kind === 'authenticated' ? owner.userRef : owner.guestSessionRef)
  return Object.freeze({ ...owner })
}

/** 递归冻结已复制的 JSON；不冻结调用者原对象。 */
function freezeJson<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) { freezeJson(child) }
    Object.freeze(value)
  }
  return value
}

/** 异步操作之前锁定内容，避免排队等待连接期间被调用方改写。 */
export function lockTemporaryCareResult(input: TemporaryCareResultRecord): LockedTemporaryCareResult {
  const owner = lockTemporaryCareOwner(input.owner)
  validateCareReference(input.sessionRef)
  validateCareReference(input.resultRef)
  validateCareReference(input.environmentContractVersion, 48)
  validateCareTime(input.generatedAtMs)
  validateCareTime(input.expiresAtMs)
  if (input.expiresAtMs <= input.generatedAtMs) { throw new RangeError('结果期限必须晚于生成时间') }
  const clone = (value: CanonicalJsonObject): CanonicalJsonObject => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) { throw new TypeError('结果正文必须为 JSON 对象') }
    return freezeJson(JSON.parse(serializeCanonicalJson(value)) as CanonicalJsonObject)
  }
  const inputManifest = clone(input.inputManifest), algorithmReleaseManifest = clone(input.algorithmReleaseManifest)
  const derivations = clone(input.derivations), result = clone(input.result)
  validateCareReference(result.contractVersion, 48)
  validateCareReference(result.detailsSchemaVersion, 48)
  if (result.capabilityType !== 'watering' || result.generatedAt !== new Date(input.generatedAtMs).toISOString()) {
    throw new TypeError('结果能力或生成时间与存储记录不一致')
  }
  return Object.freeze({ owner, sessionRef: input.sessionRef, resultRef: input.resultRef,
    environmentContractVersion: input.environmentContractVersion, inputManifest, algorithmReleaseManifest,
    derivations, result, generatedAtMs: input.generatedAtMs, expiresAtMs: input.expiresAtMs,
    hashes: Object.freeze({ inputManifest: calculateCanonicalJsonSha256(inputManifest),
      algorithmReleaseManifest: calculateCanonicalJsonSha256(algorithmReleaseManifest),
      derivations: calculateCanonicalJsonSha256(derivations), result: calculateCanonicalJsonSha256(result) }) })
}
