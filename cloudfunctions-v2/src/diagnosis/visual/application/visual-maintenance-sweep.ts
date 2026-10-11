import type {
  SettleAiQuotaCommand,
  SettleAiQuotaResult
} from '../../../subscription/application/settle-ai-quota.js'
import type {
  MarkAiQuotaProviderResultUnknownCommand,
  MarkAiQuotaProviderResultUnknownResult
} from '../../../subscription/application/mark-ai-quota-provider-result-unknown.js'
import type {
  ScanExpiredAiQuotaReservationsCommand,
  ScanExpiredAiQuotaReservationsResult
} from '../../../subscription/application/scan-expired-ai-quota-reservations.js'
import {
  calculateVisualRecordSha256,
  type VisualQuotaOutcome,
  type VisualSessionFinalization
} from '../domain/visual-session-record.js'
import type {
  MysqlVisualDiagnosisRepository,
  VisualSqlContext
} from '../repository/mysql-visual-diagnosis-repository.js'

/**
 * diagnosis 域低频补扫（主代理 2026-10-11 裁决）。
 *
 * 通俗说明：像前端的「定时清理任务」，分两个互不影响的阶段，各自有时间预算：
 * 1. AI 额度预占到期扫描——复用 subscription 的到期扫描逻辑：到期仍未结算的预占转入对账，不自动退还也不扣点；
 * 2. 回收卡在「处理中」超过整单截止时刻的视觉诊断——写成失败不扣点；额度按情况处理：
 *    从未被认领（没调过模型）→ 全部释放；已认领（可能已调用模型、结果未知）或预占已到期 → 转入对账，不静默结算。
 * 前一阶段失败只记录失败，不影响后一阶段。
 */

/** 回收用例依赖。 */
export interface RecoverStaleVisualDiagnosesDependencies {
  /** 在一个短事务中执行。 */
  readonly runTransaction: <T>(work: (context: VisualSqlContext) => Promise<T>) => Promise<T>
  /** 视觉诊断仓储（只用到下列方法）。 */
  readonly repository: Pick<
    MysqlVisualDiagnosisRepository,
    'listStaleProcessingSessions' | 'readSessionForProcessing' | 'finalizeSession'
  >
  /** AI 额度结算用例（settledAmount = 0 即全部释放）。 */
  readonly settleQuota: (command: SettleAiQuotaCommand) => Promise<SettleAiQuotaResult>
  /** 把预占转入对账（结果未知或 TTL 到期）。 */
  readonly markProviderUnknown: (
    command: MarkAiQuotaProviderResultUnknownCommand
  ) => Promise<MarkAiQuotaProviderResultUnknownResult>
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 阶段结局：处理完、预算到点、失败或未启动。 */
export type SweepPhaseOutcome = 'drained' | 'deadline_reached' | 'failed' | 'not_started'

/** 回收阶段摘要。 */
export interface RecoverStaleSummary {
  /** 本轮回收（写入终态）的会话数。 */
  readonly recovered: number
  /** 阶段结局：处理完、预算到点、失败或未启动。 */
  readonly outcome: SweepPhaseOutcome
}

/** 回收一条卡住会话的额度：未认领释放；已认领或已到期转入对账。 */
async function recoverQuota(
  deps: RecoverStaleVisualDiagnosesDependencies,
  input: {
    readonly userRef: string
    readonly reservationRef: string
    readonly claimed: boolean
    readonly expiresAtMs: number
    readonly nowMs: number
  }
): Promise<VisualQuotaOutcome> {
  try {
    if (input.nowMs >= input.expiresAtMs) {
      await deps.markProviderUnknown({
        userRef: input.userRef as never,
        reservationRef: input.reservationRef,
        occurredAtMs: input.nowMs,
        reason: 'reservation_ttl_expired'
      })
      return 'pending_reconciliation'
    }
    if (input.claimed) {
      await deps.markProviderUnknown({
        userRef: input.userRef as never,
        reservationRef: input.reservationRef,
        occurredAtMs: input.nowMs
      })
      return 'pending_reconciliation'
    }
    const result = await deps.settleQuota({
      userRef: input.userRef as never,
      reservationRef: input.reservationRef,
      settledAmount: 0,
      actualCostMicros: 0,
      usageEvidenceRef: 'sweep:stale_visual_diagnosis',
      platformAbsorbedCostMicros: 0,
      occurredAtMs: input.nowMs
    })
    return result.kind === 'replayed' ? result.status : result.kind
  } catch {
    return 'unconfirmed'
  }
}

/** 创建「回收卡住会话」用例：逐条回收，到阶段截止时刻即停。 */
export function createRecoverStaleVisualDiagnosesUseCase(
  deps: RecoverStaleVisualDiagnosesDependencies
) {
  return async (input: RecoverStaleInput): Promise<RecoverStaleSummary> => {
    const stale = await deps.runTransaction(context =>
      deps.repository.listStaleProcessingSessions(context, {
        nowMs: deps.now(),
        limit: input.batchLimit
      })
    )
    let recovered = 0
    for (const item of stale) {
      const nowMs = deps.now()
      if (nowMs >= input.deadlineAtMs) {
        return { recovered, outcome: 'deadline_reached' }
      }
      const row = await deps.runTransaction(context =>
        deps.repository.readSessionForProcessing(context, item.visualDiagnosisRef)
      )
      if (row === null || row.status !== 'processing') {
        continue
      }
      const quotaOutcome = await recoverQuota(deps, {
        userRef: row.userRef,
        reservationRef: row.reservationRef,
        claimed: item.claimed,
        expiresAtMs: row.versionGroup.reservationExpiresAtMs,
        nowMs
      })
      const finalization: Omit<VisualSessionFinalization, 'recordSha256'> = {
        status: 'failed_no_charge',
        releaseReason: 'model_failed',
        publicResult: null,
        imageAssessment: null,
        modelCode: null,
        rawTextSha256s: [],
        calls: [],
        attempts: [],
        costMicros: 0,
        chargedPoints: 0,
        quotaOutcome,
        completedAtMs: nowMs
      }
      const written = await deps.runTransaction(context =>
        deps.repository.finalizeSession(context, {
          visualDiagnosisRef: row.visualDiagnosisRef,
          finalization: {
            ...finalization,
            recordSha256: calculateVisualRecordSha256(row, finalization)
          }
        })
      )
      if (written === 'finalized') {
        recovered += 1
      }
    }
    return { recovered, outcome: 'drained' }
  }
}

/** 回收阶段输入。 */
export interface RecoverStaleInput {
  /** 本批最多回收的会话数。 */
  readonly batchLimit: number
  /** 本阶段截止时刻（UTC 毫秒），到点即停。 */
  readonly deadlineAtMs: number
}

/** 单个阶段的批量与预算。 */
export interface SweepPhaseBudget {
  /** 每批处理的条数上限。 */
  readonly batchSize: number
  /** 本阶段可用时长占函数超时的比例（0～1）。 */
  readonly budgetFractionOfFunctionTimeout: number
}

/** 预占到期阶段摘要。 */
export interface ReservationPhaseSummary {
  /** 阶段结局：处理完、预算到点、失败或未启动。 */
  readonly outcome: SweepPhaseOutcome
  /** 本轮转入对账的预占条数。 */
  readonly pendingCount: number
}

/** 补扫入口输入。 */
export interface DiagnosisMaintenanceSweepInput {
  /** 函数超时毫秒（运行时上下文 time_limit_in_ms）；读不到为 null，两阶段都不启动。 */
  readonly functionTimeoutMs: number | null
}

/** 补扫参数（RUNTIME_PARAMETERS.diagnosis.maintenanceSweep）。 */
export interface DiagnosisMaintenanceSweepSettings {
  /** 定时触发器 cron（与 care-maintenance-sweep 相同）。 */
  readonly cron: string
  /** 预占到期阶段：每批条数与预算占函数超时的比例。 */
  readonly reservationExpiry: SweepPhaseBudget
  /** 卡住会话阶段：每批条数与预算占函数超时的比例。 */
  readonly staleSessions: SweepPhaseBudget
}

/** 补扫依赖。 */
export interface DiagnosisMaintenanceSweepDependencies {
  /** 预占到期扫描（复用 subscription 用例，单批）。 */
  readonly scanExpiredReservations: (
    command: ScanExpiredAiQuotaReservationsCommand
  ) => Promise<ScanExpiredAiQuotaReservationsResult>
  /** 回收卡住的视觉诊断。 */
  readonly recoverStaleSessions: (input: RecoverStaleInput) => Promise<RecoverStaleSummary>
  /** 批量与预算参数。 */
  readonly settings: DiagnosisMaintenanceSweepSettings
  /** 服务端时钟，返回 UTC 毫秒。 */
  readonly now: () => number
}

/** 补扫摘要（只含计数，不含标识）。 */
export interface DiagnosisMaintenanceSweepSummary {
  /** 预占到期阶段：结局与转入对账的条数。 */
  readonly reservations: ReservationPhaseSummary
  /** 卡住会话阶段：结局与回收条数。 */
  readonly sessions: RecoverStaleSummary
}

/** 创建 diagnosis 低频补扫：两阶段依次执行，各自预算，互不影响。 */
export function createDiagnosisMaintenanceSweep(deps: DiagnosisMaintenanceSweepDependencies) {
  return async (
    input: DiagnosisMaintenanceSweepInput
  ): Promise<DiagnosisMaintenanceSweepSummary> => {
    const timeout = input.functionTimeoutMs
    if (timeout === null || !Number.isSafeInteger(timeout) || timeout <= 0) {
      return {
        reservations: { outcome: 'not_started', pendingCount: 0 },
        sessions: { outcome: 'not_started', recovered: 0 }
      }
    }
    const reservationsStart = deps.now()
    const reservationsDeadline =
      reservationsStart +
      Math.floor(timeout * deps.settings.reservationExpiry.budgetFractionOfFunctionTimeout)
    let pendingCount = 0
    let reservationsOutcome: SweepPhaseOutcome = 'drained'
    try {
      for (;;) {
        const nowMs = deps.now()
        if (nowMs >= reservationsDeadline) {
          reservationsOutcome = 'deadline_reached'
          break
        }
        const batch = await deps.scanExpiredReservations({
          occurredAtMs: nowMs,
          batchLimit: deps.settings.reservationExpiry.batchSize
        })
        pendingCount += batch.pendingCount
        if (batch.pendingCount < deps.settings.reservationExpiry.batchSize) {
          break
        }
      }
    } catch {
      reservationsOutcome = 'failed'
    }
    let sessions: DiagnosisMaintenanceSweepSummary['sessions']
    try {
      const sessionsStart = deps.now()
      sessions = await deps.recoverStaleSessions({
        batchLimit: deps.settings.staleSessions.batchSize,
        deadlineAtMs:
          sessionsStart +
          Math.floor(timeout * deps.settings.staleSessions.budgetFractionOfFunctionTimeout)
      })
    } catch {
      sessions = { outcome: 'failed', recovered: 0 }
    }
    return { reservations: { outcome: reservationsOutcome, pendingCount }, sessions }
  }
}
