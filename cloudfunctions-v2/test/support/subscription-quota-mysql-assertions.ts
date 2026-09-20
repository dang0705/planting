import type { Pool, RowDataPacket } from 'mysql2/promise'
import { expect } from 'vitest'

/** 校验首次预占后的账户、批次、预占分摊和账本投影。 */
export async function expectReservedQuotaState(pool: Pool): Promise<void> {
  const [accountRows] = await pool.query<RowDataPacket[]>(`
    SELECT available_amount, reserved_amount, version, last_ledger_internal_id
    FROM ai_quota_accounts
  `)
  expect(accountRows).toEqual([
    expect.objectContaining({ available_amount: 2, reserved_amount: 8, version: 2 })
  ])
  expect(accountRows[Number('0')]?.last_ledger_internal_id).not.toBeNull()

  const [grantRows] = await pool.query<RowDataPacket[]>(`
    SELECT grant_ref, available_amount, reserved_amount, status, version
    FROM ai_quota_grants ORDER BY grant_ref
  `)
  expect(grantRows).toEqual([
    expect.objectContaining({
      grant_ref: 'aqg_subscription_real_a',
      available_amount: 0,
      reserved_amount: 5,
      status: 'partially_used',
      version: 2
    }),
    expect.objectContaining({
      grant_ref: 'aqg_subscription_real_b',
      available_amount: 2,
      reserved_amount: 3,
      status: 'partially_used',
      version: 2
    })
  ])

  const [countRows] = await pool.query<RowDataPacket[]>(`
    SELECT
      (SELECT COUNT(*) FROM ai_quota_reservations) AS reservation_count,
      (SELECT COUNT(*) FROM ai_quota_reservation_allocations) AS allocation_count,
      (SELECT COUNT(*) FROM ai_quota_ledger WHERE entry_type = 'reserve') AS ledger_count,
      (SELECT COALESCE(SUM(reserved_amount), 0)
       FROM ai_quota_reservation_allocations) AS allocated_amount
  `)
  expect(countRows).toEqual([
    expect.objectContaining({
      reservation_count: 1,
      allocation_count: 2,
      ledger_count: 2,
      allocated_amount: '8'
    })
  ])
}

/** 校验部分结算后的账户、批次、预占、分摊和双类型账本投影。 */
export async function expectSettledQuotaState(pool: Pool, reservationRef: string): Promise<void> {
  const [accountRows] = await pool.query<RowDataPacket[]>(`
    SELECT available_amount, reserved_amount, consumed_amount, version
    FROM ai_quota_accounts
  `)
  expect(accountRows).toEqual([
    expect.objectContaining({
      available_amount: 4,
      reserved_amount: 0,
      consumed_amount: 6,
      version: 3
    })
  ])

  const [grantRows] = await pool.query<RowDataPacket[]>(`
    SELECT grant_ref, available_amount, reserved_amount, consumed_amount, status, version
    FROM ai_quota_grants ORDER BY grant_ref
  `)
  expect(grantRows).toEqual([
    expect.objectContaining({
      grant_ref: 'aqg_subscription_real_a',
      available_amount: 0,
      reserved_amount: 0,
      consumed_amount: 5,
      status: 'used',
      version: 3
    }),
    expect.objectContaining({
      grant_ref: 'aqg_subscription_real_b',
      available_amount: 4,
      reserved_amount: 0,
      consumed_amount: 1,
      status: 'partially_used',
      version: 3
    })
  ])

  const [settledRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        (SELECT status FROM ai_quota_reservations WHERE reservation_ref = ?) AS reservation_status,
        (SELECT settled_amount FROM ai_quota_reservations
         WHERE reservation_ref = ?) AS settled_amount,
        (SELECT SUM(remaining_amount)
         FROM ai_quota_reservation_allocations) AS remaining_amount,
        (SELECT SUM(settled_amount)
         FROM ai_quota_reservation_allocations) AS allocation_settled,
        (SELECT SUM(released_amount)
         FROM ai_quota_reservation_allocations) AS allocation_released,
        (SELECT COUNT(*) FROM ai_quota_ledger
         WHERE entry_type = 'settle') AS settle_ledger_count,
        (SELECT COUNT(*) FROM ai_quota_ledger
         WHERE entry_type = 'release') AS release_ledger_count
    `,
    [reservationRef, reservationRef]
  )
  expect(settledRows).toEqual([
    expect.objectContaining({
      reservation_status: 'settled',
      settled_amount: 6,
      remaining_amount: '0',
      allocation_settled: '6',
      allocation_released: '2',
      settle_ledger_count: 2,
      release_ledger_count: 1
    })
  ])
}

/** 校验超额成本进入待对账后没有提前改变账户、分摊或结算账本。 */
export async function expectPendingReconciliationState(
  pool: Pool,
  reservationRef: string
): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        a.available_amount, a.reserved_amount, a.consumed_amount,
        r.status AS reservation_status, r.settled_amount, r.actual_cost_micros,
        r.usage_evidence_ref, r.platform_absorbed_cost_micros,
        SUM(ra.remaining_amount) AS allocation_remaining,
        SUM(ra.settled_amount) AS allocation_settled,
        SUM(ra.released_amount) AS allocation_released
      FROM ai_quota_reservations r
      JOIN ai_quota_accounts a ON a.user_internal_id = r.user_internal_id
      JOIN ai_quota_reservation_allocations ra ON ra.reservation_internal_id = r.id
      WHERE r.reservation_ref = ?
      GROUP BY a.id, r.id
    `,
    [reservationRef]
  )
  expect(rows).toEqual([
    expect.objectContaining({
      available_amount: 0,
      reserved_amount: 4,
      consumed_amount: 6,
      reservation_status: 'pending_reconciliation',
      settled_amount: null,
      actual_cost_micros: 5600,
      usage_evidence_ref: 'usage_bailian_real_pending_001',
      platform_absorbed_cost_micros: 1600,
      allocation_remaining: '4',
      allocation_settled: '0',
      allocation_released: '0'
    })
  ])
  const [ledgerRows] = await pool.query<RowDataPacket[]>(
    `
      SELECT entry_type, COUNT(*) AS entry_count
      FROM ai_quota_ledger
      WHERE reservation_internal_id = (
        SELECT id FROM ai_quota_reservations WHERE reservation_ref = ?
      )
      GROUP BY entry_type ORDER BY entry_type
    `,
    [reservationRef]
  )
  expect(ledgerRows).toEqual([{ entry_type: 'reserve', entry_count: 1 }])
}

/** 校验最终账单把待对账预占结算到用户上限，并保留平台差额。 */
export async function expectResolvedPendingState(
  pool: Pool,
  reservationRef: string
): Promise<void> {
  const [rows] = await pool.query<RowDataPacket[]>(
    `
      SELECT
        a.available_amount, a.reserved_amount, a.consumed_amount,
        r.status AS reservation_status, r.settled_amount, r.actual_cost_micros,
        r.usage_evidence_ref, r.platform_absorbed_cost_micros,
        SUM(ra.remaining_amount) AS allocation_remaining,
        SUM(ra.settled_amount) AS allocation_settled,
        SUM(ra.released_amount) AS allocation_released,
        (SELECT COUNT(*) FROM ai_quota_ledger l
         WHERE l.reservation_internal_id = r.id AND l.entry_type = 'settle') AS settle_ledger_count
      FROM ai_quota_reservations r
      JOIN ai_quota_accounts a ON a.user_internal_id = r.user_internal_id
      JOIN ai_quota_reservation_allocations ra ON ra.reservation_internal_id = r.id
      WHERE r.reservation_ref = ?
      GROUP BY a.id, r.id
    `,
    [reservationRef]
  )
  expect(rows).toEqual([
    expect.objectContaining({
      available_amount: 0,
      reserved_amount: 0,
      consumed_amount: 10,
      reservation_status: 'settled',
      settled_amount: 4,
      actual_cost_micros: 5600,
      usage_evidence_ref: 'billing_bailian_real_final_001',
      platform_absorbed_cost_micros: 1600,
      allocation_remaining: '0',
      allocation_settled: '4',
      allocation_released: '0',
      settle_ledger_count: 1
    })
  ])
}
