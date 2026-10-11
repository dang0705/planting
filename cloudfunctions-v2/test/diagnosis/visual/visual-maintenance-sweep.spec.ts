import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, test } from 'vitest'

import {
  createDiagnosisMaintenanceSweep,
  createRecoverStaleVisualDiagnosesUseCase,
  type RecoverStaleVisualDiagnosesDependencies
} from '../../../src/diagnosis/visual/application/visual-maintenance-sweep.js'
import { createDiagnosisMaintenanceSweepEventHandler } from '../../../src/diagnosis/visual/event/diagnosis-maintenance-sweep-handler.js'
import { RUNTIME_PARAMETERS } from '../../../src/configuration/runtime-parameters.js'
import type { VisualSessionProcessingRow } from '../../../src/diagnosis/visual/repository/mysql-visual-diagnosis-repository.js'
import { findProjectRoot } from '../../support/project-root.js'
import { fixtureNow, generationRules, promptRelease } from './support/visual-fakes.js'

/**
 * Expected 来源：主代理 2026-10-11 裁决——(1) 一次视觉诊断从认领到写入终态不得超过「预占有效期 − 60 秒」，超时失败关闭并释放点数；
 * (2) 低频补偿作为独立阶段、各自有预算、互不影响：AI 额度预占到期扫描（复用已有逻辑）与「卡在 processing 超过整单时长」的会话回收；
 * 架构核对后不放进 care 函数（按业务域拆分），改为 diagnosis 域低频事件函数，频率与 care-maintenance-sweep 相同。
 * 额度合同：结果未知或预占到期只能进入对账，不得静默结算或释放。
 * 测试层次：unit_fake（仓储与额度用例为内存假实现）+ unit_real_data（读取配置目录与构建脚本）。
 */
const root = findProjectRoot()

function staleRow(
  ref: string,
  claimed: boolean,
  expiresAtMs: number
): VisualSessionProcessingRow & { readonly claimed: boolean } {
  return {
    visualDiagnosisRef: ref,
    status: 'processing',
    userRef: 'usr_visual_owner_0001',
    subject: { kind: 'user_plant', internalId: '11', userPlantRef: 'upl_visual_active_0001' },
    images: [],
    imageRefs: ['dvi_owned_00000001'],
    userQuestionZh: null,
    reservationRef: `aqr_${ref}`,
    versionGroup: {
      policyReleaseVersion: 'diagnosis-visual-generation/v1.0.0',
      policyContentSha256: 'a'.repeat(64),
      rules: generationRules,
      promptReleaseSha256: promptRelease.promptReleaseSha256,
      outputSchemaVersion: promptRelease.outputSchemaVersion,
      agentAllowlistVersion: promptRelease.agentAllowlistVersion,
      maxImageBytes: 5_242_880,
      reservationTtlSeconds: 300,
      reservationExpiresAtMs: expiresAtMs,
      processingDeadlineMs: expiresAtMs - 60_000
    },
    contextSummary: null,
    createdAtMs: expiresAtMs - 300_000,
    claimed
  }
}

function recoverHarness(
  rows: ReturnType<typeof staleRow>[],
  overrides: Partial<RecoverStaleVisualDiagnosesDependencies> = {}
) {
  const finalizations: Record<string, any>[] = []
  const settlements: Record<string, unknown>[] = []
  const marks: Record<string, unknown>[] = []
  const deps: RecoverStaleVisualDiagnosesDependencies = {
    runTransaction: work => work({ connection: null as never }),
    repository: {
      listStaleProcessingSessions: async (_context, input) =>
        rows
          .filter(row => row.versionGroup.processingDeadlineMs < input.nowMs)
          .slice(0, input.limit)
          .map(row => ({ visualDiagnosisRef: row.visualDiagnosisRef, claimed: row.claimed })),
      readSessionForProcessing: async (_context, ref) =>
        rows.find(row => row.visualDiagnosisRef === ref) ?? null,
      finalizeSession: async (_context, input) => {
        finalizations.push({ ref: input.visualDiagnosisRef, ...input.finalization })
        return 'finalized'
      }
    },
    settleQuota: async command => {
      settlements.push(command as never)
      return {
        kind: 'released',
        reservationRef: command.reservationRef,
        settledAmount: 0,
        releasedAmount: 23
      }
    },
    markProviderUnknown: async command => {
      marks.push(command as never)
      return { kind: 'pending_reconciliation', reservationRef: command.reservationRef }
    },
    now: () => fixtureNow,
    ...overrides
  }
  return {
    recover: createRecoverStaleVisualDiagnosesUseCase(deps),
    finalizations,
    settlements,
    marks
  }
}

describe('回收卡在处理中的视觉诊断', () => {
  test('超过整单截止时刻的会话写成 failed_no_charge / model_failed；未到截止的不动', async () => {
    const h = recoverHarness([
      staleRow('vds_stale_unclaimed01', false, fixtureNow + 30_000),
      staleRow('vds_fresh_session_001', true, fixtureNow + 120_000)
    ])
    const summary = await h.recover({ batchLimit: 10, deadlineAtMs: fixtureNow + 60_000 })
    expect(summary).toEqual({ recovered: 1, outcome: 'drained' })
    expect(h.finalizations).toEqual([
      expect.objectContaining({
        ref: 'vds_stale_unclaimed01',
        status: 'failed_no_charge',
        releaseReason: 'model_failed',
        chargedPoints: 0,
        quotaOutcome: 'released'
      })
    ])
    expect(h.finalizations[0]?.recordSha256).toMatch(/^[0-9a-f]{64}$/u)
  })

  test('额度处理：从未认领→全部释放；已认领（可能已调用模型、结果未知）→转入对账；预占已到期→按 TTL 到期转入对账', async () => {
    const h = recoverHarness([
      staleRow('vds_stale_unclaimed01', false, fixtureNow + 30_000),
      staleRow('vds_stale_claimed0001', true, fixtureNow + 30_000),
      staleRow('vds_stale_expired0001', true, fixtureNow - 1)
    ])
    await h.recover({ batchLimit: 10, deadlineAtMs: fixtureNow + 60_000 })
    expect(h.settlements).toEqual([
      expect.objectContaining({ reservationRef: 'aqr_vds_stale_unclaimed01', settledAmount: 0 })
    ])
    expect(h.marks).toEqual([
      expect.objectContaining({ reservationRef: 'aqr_vds_stale_claimed0001' }),
      expect.objectContaining({
        reservationRef: 'aqr_vds_stale_expired0001',
        reason: 'reservation_ttl_expired'
      })
    ])
    expect(h.marks[0]).not.toHaveProperty('reason')
    expect(h.finalizations.map(item => item.quotaOutcome)).toEqual([
      'released',
      'pending_reconciliation',
      'pending_reconciliation'
    ])
  })

  test('阶段预算到点即停（deadline_reached），剩余留给下一轮', async () => {
    let clock = fixtureNow
    const h = recoverHarness(
      [
        staleRow('vds_stale_unclaimed01', false, fixtureNow + 30_000),
        staleRow('vds_stale_unclaimed02', false, fixtureNow + 30_000)
      ],
      { now: () => (clock += 40_000) }
    )
    const summary = await h.recover({ batchLimit: 10, deadlineAtMs: fixtureNow + 100_000 })
    expect(summary.outcome).toBe('deadline_reached')
    expect(summary.recovered).toBe(1)
  })
})

describe('diagnosis 低频补扫：两个独立阶段、各自预算、互不影响', () => {
  const settings = RUNTIME_PARAMETERS.diagnosis.maintenanceSweep.value

  test('两阶段各用自己的批量与预算；前一阶段失败不影响后一阶段', async () => {
    const calls: Record<string, unknown>[] = []
    const sweep = createDiagnosisMaintenanceSweep({
      scanExpiredReservations: async input => {
        calls.push({ phase: 'reservations', ...input })
        throw new Error('db down')
      },
      recoverStaleSessions: async input => {
        calls.push({ phase: 'sessions', ...input })
        return { recovered: 2, outcome: 'drained' }
      },
      settings,
      now: () => fixtureNow
    })
    const summary = await sweep({ functionTimeoutMs: 100_000 })
    expect(summary).toEqual({
      reservations: { outcome: 'failed', pendingCount: 0 },
      sessions: { outcome: 'drained', recovered: 2 }
    })
    expect(calls).toEqual([
      {
        phase: 'reservations',
        occurredAtMs: fixtureNow,
        batchLimit: settings.reservationExpiry.batchSize
      },
      {
        phase: 'sessions',
        batchLimit: settings.staleSessions.batchSize,
        deadlineAtMs:
          fixtureNow + Math.floor(100_000 * settings.staleSessions.budgetFractionOfFunctionTimeout)
      }
    ])
  })

  test('预占到期阶段按批循环直到不满一批或预算用尽；函数超时读不到时两阶段都不启动', async () => {
    let batches = 0
    const sweep = createDiagnosisMaintenanceSweep({
      scanExpiredReservations: async input => {
        batches += 1
        return { pendingCount: batches === 1 ? input.batchLimit : 3, reservationRefs: [] }
      },
      recoverStaleSessions: async () => ({ recovered: 0, outcome: 'drained' }),
      settings,
      now: () => fixtureNow
    })
    expect(await sweep({ functionTimeoutMs: 100_000 })).toMatchObject({
      reservations: { outcome: 'drained', pendingCount: settings.reservationExpiry.batchSize + 3 }
    })
    expect(await sweep({ functionTimeoutMs: null })).toEqual({
      reservations: { outcome: 'not_started', pendingCount: 0 },
      sessions: { outcome: 'not_started', recovered: 0 }
    })
    const handler = createDiagnosisMaintenanceSweepEventHandler({ sweep })
    expect(await handler({}, { time_limit_in_ms: 'x' })).toMatchObject({
      sessions: { outcome: 'not_started' }
    })
  })

  test('配置目录登记补扫参数，cron 与 care-maintenance-sweep 相同；构建脚本登记新事件函数', () => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'),
        'utf8'
      )
    ) as {
      variables: { id: string; status: string; currentValue: unknown }[]
    }
    const item = catalog.variables.find(variable => variable.id === 'diagnosis.maintenance_sweep')
    expect(item?.currentValue).toEqual(settings)
    expect(settings.cron).toBe(RUNTIME_PARAMETERS.care.maintenanceSweep.value.cron)
    expect(
      settings.reservationExpiry.budgetFractionOfFunctionTimeout +
        settings.staleSessions.budgetFractionOfFunctionTimeout
    ).toBeLessThan(1)
    expect(
      catalog.variables.find(variable => variable.id === 'diagnosis.visual.processing_deadline')
    ).toMatchObject({
      status: 'hard_rule',
      currentValue: { safetyMarginSeconds: 60 }
    })
    const build = fs.readFileSync(path.join(root, 'cloudfunctions-v2/scripts/build.mjs'), 'utf8')
    expect(build).toContain(
      "{ name: 'diagnosis-maintenance-sweep', entry: 'src/entries/diagnosis-maintenance-sweep.ts', kind: 'event' }"
    )
  })
})
