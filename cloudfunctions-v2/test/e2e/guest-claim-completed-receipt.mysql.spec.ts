import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { guestClaimFixtureDdl } from './guest-claim-registration-fixture.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import {
  DatabaseCommitResultUnknownError,
  runDatabaseTransaction
} from '../../src/foundation/database/transaction-runner.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../../src/user-plant/repository/mysql-guest-claim-completed-receipt-reader.js'

/** L3/unit_real_data：独立Expected来自guest-claim-completed-receipt-contract.md。
 * 真实MySQL8.4及已准入四表夹具，completed成功链明确人工seed；只证明收据读取，不证明认领写用例。
 * 真实事务commit后故障注入模拟回包未知，随后新连接只读；并非实际网络故障。
 * Principal为已验真形状夹具，用户/植物表为缩减归属边界；不覆盖公开HTTP/身份/派生对象白名单。 */
const container = `qhz-guest-receipt-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_receipt_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01Z',
  expiresAt: '1970-01-01T00:00:09Z'
}
function input() {
  return {
    principal,
    guestSessionRef: 'gst_receipt_session01',
    guestPlantCaseRef: 'gpc_receipt_case01',
    target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_receipt_target01' } as
      | { type: 'new_user_plant' }
      | { type: 'existing_user_plant'; user_plant_id: string },
    idempotencyKeyHash: 'b'.repeat(64),
    nowMs: 4000
  }
}
const completed = {
  status: 'completed',
  claimRef: 'gcl_receipt_command01',
  userPlantRef: 'upl_receipt_target01',
  guestPlantCaseRef: 'gpc_receipt_case01',
  proofVersion: 2,
  claimedAtMs: 3000
}
const requestHash = createHash('sha256')
  .update(
    '{"guestSessionRef":"gst_receipt_session01","guestPlantCaseRef":"gpc_receipt_case01","target":{"type":"existing_user_plant","user_plant_id":"upl_receipt_target01"}}'
  )
  .digest('hex')
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr || r.stdout)
  }
  return r.stdout.trim()
}
beforeAll(async () => {
  docker([
    'run',
    '-d',
    '--name',
    container,
    '--tmpfs',
    '/var/lib/mysql',
    '-p',
    '127.0.0.1::3306',
    '-e',
    'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
    'mysql:8.4'
  ])
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await db.query('SELECT 1')
      ready = true
      break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离游客成功收据MySQL未就绪')
  }
  await db.query('CREATE DATABASE guest_receipt CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await db.query('USE guest_receipt')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(statement)
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'guest_receipt'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
beforeEach(async () => {
  for (const table of [
    'guest_case_claims',
    'guest_claim_commands',
    'guest_plant_cases',
    'guest_sessions',
    'user_plants',
    'users'
  ]) {
    await db.query(`DELETE FROM ${table}`)
  }
  await db.query(
    "INSERT INTO users VALUES(1,'usr_receipt_owner01','active',''),(2,'usr_receipt_owner02','active','')"
  )
  await db.query(
    "INSERT INTO user_plants VALUES(1,1,'upl_receipt_target01','active',''),(2,1,'upl_receipt_target02','archived',''),(3,2,'upl_receipt_other01','active','')"
  )
  await db.query(
    "INSERT INTO guest_sessions(id,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'gst_receipt_session01',REPEAT('a',64),REPEAT('c',64),2,'completed',1000,5000,1000,3000)"
  )
  await db.query(
    "INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,claimed_user_internal_id,claimed_user_plant_internal_id,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_receipt_case01',1,'claimed',2000,5000,1,1,8,1000,3000)"
  )
  await db.execute(
    "INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,target_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,attempt_count,created_at_ms,updated_at_ms) VALUES(1,'gcl_receipt_command01',1,1,'existing_user_plant',1,1,?,?,2,'completed',1,2000,3000)",
    ['b'.repeat(64), requestHash]
  )
  await db.query(
    'INSERT INTO guest_case_claims(id,guest_plant_case_internal_id,claim_command_internal_id,user_internal_id,user_plant_internal_id,claimed_at_ms,created_at_ms) VALUES(1,1,1,1,1,3000,3000)'
  )
})
async function snapshot() {
  const values: unknown[] = []
  for (const table of [
    'guest_sessions',
    'guest_plant_cases',
    'guest_claim_commands',
    'guest_case_claims',
    'user_plants'
  ]) {
    const [rows] = await db.query(`SELECT * FROM ${table} ORDER BY id`)
    values.push(rows)
  }
  return values
}
async function read(value = input()) {
  let connections = 0,
    reads = 0
  const guarded: typeof source = {
    getConnection: async () => {
      connections++
      const connection = await source.getConnection()
      return {
        ...connection,
        query: (sql, args) => {
          reads++
          expect(sql).toMatch(/^\s*SELECT\b/iu)
          expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/iu)
          return connection.query(sql, args)
        },
        execute: async () => {
          throw new Error('收据核对禁止写入')
        },
        beginTransaction: async () => {
          throw new Error('收据核对禁止事务')
        },
        commit: async () => {
          throw new Error('收据核对禁止提交')
        }
      }
    }
  }
  const before = await snapshot(),
    result = await createMysqlGuestClaimCompletedReceiptReader(guarded).readCompleted(value)
  expect({ connections, reads }).toEqual({ connections: 1, reads: 1 })
  expect(await snapshot()).toEqual(before)
  return result
}
test('完整三表成功链只返回冻结内部收据，单次新连接无锁零写', async () => {
  expect(await read()).toEqual(completed)
})
test('会话/案例后来到期仍读取原用户成功事实，归档可见而删除不可见', async () => {
  await db.query("UPDATE guest_sessions SET status='expired' WHERE id=1")
  expect(await read({ ...input(), nowMs: 6000 })).toEqual(completed)
  await db.query("UPDATE user_plants SET lifecycle_status='archived' WHERE id=1")
  expect(await read({ ...input(), nowMs: 6000 })).toEqual(completed)
  await db.query("UPDATE user_plants SET lifecycle_status='deleted' WHERE id=1")
  expect(await read()).toBeNull()
})
test.each([
  'other_user',
  'other_case',
  'other_session',
  'other_key',
  'case_case',
  'session_case'
] as const)('精确归属%s不见原用户收据', async kind => {
  const value = input()
  if (kind === 'other_user') {
    value.principal = { ...principal, user_id: 'usr_receipt_owner02' as UserRef }
  }
  if (kind === 'other_case') {
    value.guestPlantCaseRef = 'gpc_receipt_absent01'
  }
  if (kind === 'other_session') {
    value.guestSessionRef = 'gst_receipt_absent01'
  }
  if (kind === 'other_key') {
    value.idempotencyKeyHash = 'd'.repeat(64)
  }
  if (kind === 'case_case') {
    value.guestPlantCaseRef = 'gpc_RECEIPT_CASE01'
  }
  if (kind === 'session_case') {
    value.guestSessionRef = 'gst_RECEIPT_SESSION01'
  }
  expect(await read(value)).toBeNull()
})
test.each(['requested', 'processing', 'failed', 'no_fact'] as const)(
  '原命令%s不伪装成成功',
  async status => {
    await db.query('DELETE FROM guest_case_claims')
    if (status === 'requested') {
      await db.query(
        "UPDATE guest_claim_commands SET status='requested',target_user_plant_internal_id=NULL,attempt_count=0"
      )
    }
    if (status === 'processing') {
      await db.query(
        "UPDATE guest_claim_commands SET status='processing',target_user_plant_internal_id=NULL,processing_lease_owner_hash=REPEAT('e',64),processing_lease_expires_at_ms=8000,attempt_count=1"
      )
    }
    if (status === 'failed') {
      await db.query(
        "UPDATE guest_claim_commands SET status='failed',target_user_plant_internal_id=NULL,failure_code='CONTROLLED_FAILURE',attempt_count=1"
      )
    }
    expect(await read()).toBeNull()
  }
)
test.each([
  'guest_sessions',
  'guest_plant_cases',
  'guest_claim_commands',
  'guest_case_claims',
  'user_plants'
] as const)('技术字段污染%s不可见', async table => {
  await db.query(`UPDATE ${table} SET _openid='technical-subject' WHERE id=1`)
  expect(await read()).toBeNull()
})
test('坏请求摘要及未来认领时间不可用，数据库拒绝非法证明版本', async () => {
  await db.query("UPDATE guest_claim_commands SET request_hash=REPEAT('z',64) WHERE id=1")
  expect(await read()).toEqual({ status: 'unavailable' })
  await db.execute('UPDATE guest_claim_commands SET request_hash=? WHERE id=1', [requestHash])
  await db.query('UPDATE guest_case_claims SET claimed_at_ms=4001 WHERE id=1')
  expect(await read()).toEqual({ status: 'unavailable' })
  await expect(
    db.query('UPDATE guest_claim_commands SET proof_version=0 WHERE id=1')
  ).rejects.toThrow()
})
test('完整成功链同键异目标返回确定冲突，不披露原植物', async () => {
  expect(
    await read({
      ...input(),
      target: { type: 'existing_user_plant', user_plant_id: 'upl_receipt_target02' }
    })
  ).toEqual({ status: 'idempotency_conflict' })
})
test('数据库约束拒绝requested/final目标不一致及案例owner污染', async () => {
  await expect(
    db.query('UPDATE guest_claim_commands SET requested_user_plant_internal_id=2 WHERE id=1')
  ).rejects.toThrow()
  await expect(
    db.query(
      'UPDATE guest_plant_cases SET claimed_user_internal_id=2,claimed_user_plant_internal_id=3 WHERE id=1'
    )
  ).rejects.toThrow()
  expect(await read()).toEqual(completed)
})
test.each(['commit', 'rollback'] as const)(
  '实际%s后故障注入提交未知，新连接核对原结果且不写重试',
  async mode => {
    await db.query('DELETE FROM guest_case_claims')
    const transactionSource: typeof source = {
      getConnection: async () => {
        const connection = await source.getConnection()
        return {
          ...connection,
          commit: async () => {
            if (mode === 'commit') {
              await connection.commit()
            } else {
              await connection.rollback()
            }
            throw new DatabaseCommitResultUnknownError('受控提交回包未知')
          }
        }
      }
    }
    await expect(
      runDatabaseTransaction(
        createMysqlTransactionDriver(transactionSource, () => undefined),
        async tx => {
          await tx.connection.execute(
            'INSERT INTO guest_case_claims(id,guest_plant_case_internal_id,claim_command_internal_id,user_internal_id,user_plant_internal_id,claimed_at_ms,created_at_ms) VALUES(1,1,1,1,1,3000,3000)',
            []
          )
        }
      )
    ).rejects.toBeInstanceOf(DatabaseCommitResultUnknownError)
    expect(await read()).toEqual(mode === 'commit' ? completed : null)
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
    expect(rows).toEqual([{ n: mode === 'commit' ? 1 : 0 }])
  }
)
