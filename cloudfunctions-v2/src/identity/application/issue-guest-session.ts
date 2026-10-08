import { createHash } from 'node:crypto'

/** 每小时毫秒数。 */
const millisecondsPerHour = 3_600_000
/** 游客令牌随机字节数（256 位）。 */
const guestTokenBytes = 32
/** 游客会话公开引用随机字节数。 */
const guestRefBytes = 16
/** 允许使用游客令牌的平台；微信以 wx.login 静默登录，不走游客。 */
const guestPlatforms = new Set(['douyin', 'xiaohongshu'])
/** 64 位小写十六进制摘要格式。 */
const digestPattern = /^[a-f0-9]{64}$/u

/** 写入 guest_sessions 的新游客会话（迁移 023 字段）。 */
export interface GuestSessionInsert {
  /** 高熵公开引用 gst_…。 */
  readonly guestSessionRef: string
  /** 游客身份来源，新签发固定为服务端自发令牌。 */
  readonly identitySource: 'server_issued_guest_token'
  /** 游客令牌的 SHA-256（持有证明），不存原文。 */
  readonly possessionProofHash: string
  /** 持有证明版本，首次签发为 1。 */
  readonly possessionProofVersion: 1
  /** 可选平台匿名信号摘要（抖音 anonymous_openid 的 HMAC），仅防刷。 */
  readonly anonymousSubjectHash: string | null
  /** 签发限流键摘要。 */
  readonly issuanceSourceHash: string
  /** 新签发会话的状态，固定为 active。 */
  readonly status: 'active'
  /** 签发 UTC 毫秒。 */
  readonly issuedAtMs: number
  /** 失效 UTC 毫秒。 */
  readonly expiresAtMs: number
}

/** 签发用例依赖；存储与随机源可替换，规则不可替换。 */
export interface IssueGuestSessionDependencies {
  /** 游客会话存储（guest_sessions 表）。 */
  readonly repository: {
    /** 统计某限流键自某时刻以来的签发次数。 */
    readonly countIssuedSince: (issuanceSourceHash: string, sinceMs: number) => Promise<number>
    /** 写入新游客会话。 */
    readonly insert: (record: GuestSessionInsert) => Promise<void>
  }
  /** 密码学安全随机字节源。 */
  readonly randomBytes: (size: number) => Buffer
  /** 服务端可信 UTC 毫秒时钟。 */
  readonly now: () => number
  /** 已发布的游客策略；null 表示不可用，必须失败关闭。 */
  readonly policy: {
    /** 游客令牌有效小时数（identity.guest.session_ttl_hours）。 */
    readonly ttlHours: number
    /** 每来源每小时签发上限（identity.guest.issuance_rate_per_hour）。 */
    readonly ratePerHour: number
  } | null
}

/** 已由入口校验并摘要化的签发输入。 */
export interface IssueGuestSessionInput {
  /** 请求平台；只接受抖音、小红书。 */
  readonly platform: string
  /** 签发限流键摘要。 */
  readonly issuanceSourceHash: string
  /** 可选平台匿名信号摘要。 */
  readonly anonymousSignalHash: string | null
}

/** 签发结果；令牌只在 issued 分支出现一次。 */
export type IssueGuestSessionResult =
  | {
      /** 签发成功，令牌随本结果返回一次。 */
      readonly status: 'issued'
      /** 一次性返回的游客令牌原文（base64url）。 */
      readonly guestToken: string
      /** 游客会话公开引用。 */
      readonly guestSessionRef: string
      /** UTC ISO 失效时刻。 */
      readonly expiresAt: string
    }
  | {
      /** 非法输入、限流或依赖不可用。 */
      readonly status: 'invalid' | 'rate_limited' | 'unavailable'
    }

/**
 * guest-token/v1：为抖音、小红书未登录用户签发高熵游客令牌。
 * 只存令牌 SHA-256；同一来源一小时内超过上限返回 rate_limited；任何依赖失败均失败关闭。
 */
export async function issueGuestSession(dependencies: IssueGuestSessionDependencies, input: IssueGuestSessionInput): Promise<IssueGuestSessionResult> {
  if (!guestPlatforms.has(input.platform) || !digestPattern.test(input.issuanceSourceHash)
    || (input.anonymousSignalHash !== null && !digestPattern.test(input.anonymousSignalHash))) {
    return { status: 'invalid' }
  }
  const { policy } = dependencies
  if (policy === null) { return { status: 'unavailable' } }
  const now = dependencies.now()
  try {
    const issued = await dependencies.repository.countIssuedSince(input.issuanceSourceHash, now - millisecondsPerHour)
    if (issued >= policy.ratePerHour) { return { status: 'rate_limited' } }
    const guestToken = dependencies.randomBytes(guestTokenBytes).toString('base64url')
    const guestSessionRef = `gst_${dependencies.randomBytes(guestRefBytes).toString('base64url')}`
    const expiresAtMs = now + policy.ttlHours * millisecondsPerHour
    await dependencies.repository.insert({
      guestSessionRef, identitySource: 'server_issued_guest_token',
      possessionProofHash: createHash('sha256').update(guestToken).digest('hex'), possessionProofVersion: 1,
      anonymousSubjectHash: input.anonymousSignalHash, issuanceSourceHash: input.issuanceSourceHash,
      status: 'active', issuedAtMs: now, expiresAtMs,
    })
    return { status: 'issued', guestToken, guestSessionRef, expiresAt: new Date(expiresAtMs).toISOString() }
  } catch {
    return { status: 'unavailable' }
  }
}
