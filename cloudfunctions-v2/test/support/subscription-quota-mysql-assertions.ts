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
