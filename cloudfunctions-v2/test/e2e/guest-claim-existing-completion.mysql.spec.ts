import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { guestClaimFixtureDdl } from './guest-claim-registration-fixture.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlGuestClaimProofRepository } from '../../src/user-plant/repository/mysql-guest-claim-proof-repository.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../../src/user-plant/repository/mysql-guest-claim-completed-receipt-reader.js'
import { createMysqlGuestClaimExistingCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-existing-completion-repository.js'

/** L3/unit_real_data：独立Expected来自guest-claim-existing-completion-contract.md。
 * 真实MySQL8.4→调用方事务→真实证明Repository→完成四写→同事务读回；processing原命令明确seed。
 * 用户/植物是已准入缩减归属夹具，匿名身份/Principal及既有租约是受控输入；不取得或计算租约。
 * 不覆盖公开HTTP、真实身份Provider、派生养护/诊断对象、计划与奖励，不读取docs。 */
const container = `qhz-guest-completion-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const proof = Buffer.alloc(32, 7).toString('base64url'),
  previousProof = Buffer.alloc(32, 8).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_completion_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01Z',
  expiresAt: '1970-01-01T00:00:09Z'
}
function input() {
  return {
    principal,
    proof: {
      guestSessionRef: 'gst_completion_session01',
      anonymousSubjectHash: 'a'.repeat(64),
      possessionProof: proof,
      nowMs: 3000,
      proofRotationGraceSeconds: 30 as number | null
    },
    guestPlantCaseRef: 'gpc_completion_case01',
    target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_completion_target01' },
    claimRef: 'gcl_completion_command01',
    idempotencyKeyHash: 'b'.repeat(64),
    leaseOwnerHash: 'd'.repeat(64)
  }
}
const completed = {
  status: 'completed',
  claimRef: 'gcl_completion_command01',
  userPlantRef: 'upl_completion_target01',
  guestPlantCaseRef: 'gpc_completion_case01',
  proofVersion: 1,
  claimedAtMs: 3000
}
function requestHash(target = 'upl_completion_target01') {
  return hash(
    JSON.stringify({
      guestSessionRef: 'gst_completion_session01',
      guestPlantCaseRef: 'gpc_completion_case01',
      target: { type: 'existing_user_plant', user_plant_id: target }
    })
  )
}
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
    throw new Error('隔离游客已有目标完成MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE guest_completion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE guest_completion')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(statement)
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'guest_completion'
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
    "INSERT INTO users VALUES(1,'usr_completion_owner01','active',''),(2,'usr_completion_owner02','active','')"
  )
  await db.query(
    "INSERT INTO user_plants VALUES(1,1,'upl_completion_target01','active',''),(2,1,'upl_completion_archived01','archived',''),(3,2,'upl_completion_other01','active','')"
  )
  await db.execute(
    "INSERT INTO guest_sessions(id,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,previous_possession_proof_hash,previous_proof_valid_until_ms,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'gst_completion_session01',?,?,2,?,4500,'active',1000,10000,1000,2000)",
    ['a'.repeat(64), hash(proof), hash(previousProof)]
  )
  await db.query(
    "INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_completion_case01',1,'completed',2000,5000,7,1000,2000)"
  )
  await db.execute(
    "INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,created_at_ms,updated_at_ms) VALUES(1,'gcl_completion_command01',1,1,'existing_user_plant',1,?,?,1,'processing',?,8000,3,2000,2000)",
    ['b'.repeat(64), requestHash(), 'd'.repeat(64)]
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
function repository() {
  return createMysqlGuestClaimExistingCompletionRepository(createMysqlGuestClaimProofRepository())
}
async function complete(value = input()) {
  return runDatabaseTransaction(
    createMysqlTransactionDriver(source, () => undefined),
    tx => repository().complete(tx, value)
  )
}
test('本人有效processing命令完成四项原子写入，保留原引用/证明版本/次数并清除上一版证明', async () => {
  expect(await complete()).toEqual(completed)
  const [cases] = await db.query(
    'SELECT status,claimed_user_internal_id,claimed_user_plant_internal_id,version,CAST(completed_at_ms AS CHAR) AS completed,CAST(expires_at_ms AS CHAR) AS expires,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated FROM guest_plant_cases'
  )
  expect(cases).toEqual([
    {
      status: 'claimed',
      claimed_user_internal_id: 1,
      claimed_user_plant_internal_id: 1,
      version: 8,
      completed: '2000',
      expires: '5000',
      created: '1000',
      updated: '3000'
    }
  ])
  const [commands] = await db.query(
    'SELECT claim_ref,request_hash,proof_version,attempt_count,status,target_user_plant_internal_id,processing_lease_owner_hash,processing_lease_expires_at_ms,CAST(created_at_ms AS CHAR) AS created FROM guest_claim_commands'
  )
  expect(commands).toEqual([
    {
      claim_ref: completed.claimRef,
      request_hash: requestHash(),
      proof_version: 1,
      attempt_count: 3,
      status: 'completed',
      target_user_plant_internal_id: 1,
      processing_lease_owner_hash: null,
      processing_lease_expires_at_ms: null,
      created: '2000'
    }
  ])
  const [facts] = await db.query(
    'SELECT guest_plant_case_internal_id,claim_command_internal_id,user_internal_id,user_plant_internal_id,CAST(claimed_at_ms AS CHAR) AS claimed FROM guest_case_claims'
  )
  expect(facts).toEqual([
    {
      guest_plant_case_internal_id: 1,
      claim_command_internal_id: 1,
      user_internal_id: 1,
      user_plant_internal_id: 1,
      claimed: '3000'
    }
  ])
  const [sessions] = await db.query(
    'SELECT possession_proof_hash,possession_proof_version,previous_possession_proof_hash,previous_proof_valid_until_ms FROM guest_sessions'
  )
  expect(sessions).toEqual([
    {
      possession_proof_hash: hash(proof),
      possession_proof_version: 2,
      previous_possession_proof_hash: null,
      previous_proof_valid_until_ms: null
    }
  ])
  const [plants] = await db.query('SELECT COUNT(*) AS n FROM user_plants')
  expect(plants).toEqual([{ n: 3 }])
})
test('本人归档目标允许完成但不会恢复active或创建新植物', async () => {
  const value = input()
  value.target.user_plant_id = 'upl_completion_archived01'
  await db.execute(
    'UPDATE guest_claim_commands SET requested_user_plant_internal_id=2,request_hash=? WHERE id=1',
    [requestHash(value.target.user_plant_id)]
  )
  const [before] = await db.query('SELECT * FROM user_plants ORDER BY id')
  expect(await complete(value)).toEqual({ ...completed, userPlantRef: 'upl_completion_archived01' })
  const [after] = await db.query('SELECT * FROM user_plants ORDER BY id')
  expect(after).toEqual(before)
})
test.each([
  'wrong_owner',
  'expired_lease',
  'requested',
  'failed',
  'proof_denied',
  'cross_user_target',
  'hash_conflict',
  'case_expired',
  'wrong_claim_ref'
] as const)('资格%s拒绝，四表及植物全量快照不变', async reason => {
  const value = input()
  if (reason === 'wrong_owner') {
    value.leaseOwnerHash = 'e'.repeat(64)
  }
  if (reason === 'expired_lease') {
    await db.query('UPDATE guest_claim_commands SET processing_lease_expires_at_ms=3000 WHERE id=1')
  }
  if (reason === 'requested') {
    await db.query(
      "UPDATE guest_claim_commands SET status='requested',processing_lease_owner_hash=NULL,processing_lease_expires_at_ms=NULL,attempt_count=0 WHERE id=1"
    )
  }
  if (reason === 'failed') {
    await db.query(
      "UPDATE guest_claim_commands SET status='failed',processing_lease_owner_hash=NULL,processing_lease_expires_at_ms=NULL,failure_code='CONTROLLED_FAILURE' WHERE id=1"
    )
  }
  if (reason === 'proof_denied') {
    value.proof.anonymousSubjectHash = 'c'.repeat(64)
  }
  if (reason === 'cross_user_target') {
    value.target.user_plant_id = 'upl_completion_other01'
  }
  if (reason === 'hash_conflict') {
    value.target.user_plant_id = 'upl_completion_archived01'
  }
  if (reason === 'case_expired') {
    value.proof.nowMs = 5000
  }
  if (reason === 'wrong_claim_ref') {
    value.claimRef = 'gcl_completion_other01'
  }
  const before = await snapshot()
  expect(await complete(value)).toEqual({
    status:
      reason === 'hash_conflict'
        ? 'idempotency_conflict'
        : reason === 'expired_lease' || reason === 'case_expired'
          ? 'expired'
          : 'not_claimable'
  })
  expect(await snapshot()).toEqual(before)
})
test.each([
  'guest_plant_cases',
  'guest_claim_commands',
  'guest_case_claims',
  'guest_sessions'
] as const)('真实%s写后故障，四项写入由外层事务整体回滚', async table => {
  let injected = false
  const guarded: typeof source = {
    getConnection: async () => {
      const connection = await source.getConnection()
      return {
        ...connection,
        execute: async (sql, args) => {
          const result = await connection.execute(sql, args)
          if (new RegExp(`\\b${table}\\b`, 'iu').test(sql)) {
            injected = true
            throw new Error('受控四写故障')
          }
          return result
        }
      }
    }
  }
  const before = await snapshot()
  await expect(
    runDatabaseTransaction(
      createMysqlTransactionDriver(guarded, () => undefined),
      tx => repository().complete(tx, input())
    )
  ).rejects.toThrow('受控四写故障')
  expect(injected).toBe(true)
  expect(await snapshot()).toEqual(before)
})
test('同命令再次complete不重写，成功只能经原只读收据端口复用', async () => {
  await complete()
  const before = await snapshot()
  expect(await complete()).toEqual({ status: 'not_claimable' })
  expect(await snapshot()).toEqual(before)
  const value = input()
  expect(
    await createMysqlGuestClaimCompletedReceiptReader(source).readCompleted({
      principal,
      guestSessionRef: value.proof.guestSessionRef,
      guestPlantCaseRef: value.guestPlantCaseRef,
      target: value.target,
      idempotencyKeyHash: value.idempotencyKeyHash,
      nowMs: value.proof.nowMs
    })
  ).toEqual(completed)
})
