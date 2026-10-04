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
import { createMysqlGuestClaimCommandRegistrationRepository } from '../../src/user-plant/repository/mysql-guest-claim-command-registration-repository.js'

/** L3/unit_real_data：独立Expected来自guest-claim-command-registration-contract.md。
 * 真实MySQL8.4→外层事务→真实持有证明→命令登记与读回；仅身份验真和证明策略输入是夹具。
 * 四张游客表由已准入共享夹具装载，用户/植物仅缩减归属边界；completed三表事实明确人工seed。
 * 不验证公开HTTP、CloudBase匿名验真、processing租约取得或完整认领完成，不读取docs。 */
const container = `qhz-guest-registration-${process.pid}`
const possessionProof = Buffer.alloc(32, 7).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_registration_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01Z',
  expiresAt: '1970-01-01T00:00:09Z'
}
function input() {
  return {
    principal,
    proof: {
      guestSessionRef: 'gst_registration_session01',
      anonymousSubjectHash: 'a'.repeat(64),
      possessionProof,
      nowMs: 3000,
      proofRotationGraceSeconds: null as number | null
    },
    guestPlantCaseRef: 'gpc_registration_case01',
    target: { type: 'new_user_plant' as const } as
      | { type: 'new_user_plant' }
      | { type: 'existing_user_plant'; user_plant_id: string },
    claimRef: 'gcl_registration_command01',
    idempotencyKeyHash: 'b'.repeat(64)
  }
}
function docker(args: string[]) {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout)
  }
  return result.stdout.trim()
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
    throw new Error('隔离游客命令登记MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE guest_registration CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE guest_registration')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(statement)
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'guest_registration'
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
    "INSERT INTO users VALUES(1,'usr_registration_owner01','active',''),(2,'usr_registration_owner02','active','')"
  )
  await db.query(
    "INSERT INTO user_plants VALUES(1,1,'upl_registration_active01','active',''),(2,1,'upl_registration_archived01','archived',''),(3,2,'upl_registration_other01','active',''),(4,1,'upl_registration_deleted01','deleted','')"
  )
  await db.execute(
    "INSERT INTO guest_sessions(id,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'gst_registration_session01',?,?,2,'active',1000,10000,1000,2000),(2,'gst_registration_session02',?,?,2,'active',1000,10000,1000,2000)",
    ['a'.repeat(64), hash(possessionProof), 'c'.repeat(64), hash(possessionProof)]
  )
  await db.query(
    "INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_registration_case01',1,'completed',2000,5000,7,1000,2000),(2,'gpc_registration_other01',2,'completed',2000,5000,7,1000,2000)"
  )
})
const registered = {
  status: 'registered',
  claimRef: 'gcl_registration_command01',
  proofVersion: 2,
  replayed: false
}
function repository() {
  return createMysqlGuestClaimCommandRegistrationRepository(createMysqlGuestClaimProofRepository())
}
async function register(value = input()) {
  return runDatabaseTransaction(
    createMysqlTransactionDriver(source, () => undefined),
    tx => repository().register(tx, value)
  )
}
async function state() {
  const rows: unknown[] = []
  for (const table of [
    'guest_sessions',
    'guest_plant_cases',
    'user_plants',
    'guest_claim_commands',
    'guest_case_claims'
  ]) {
    const [data] = await db.query(`SELECT * FROM ${table} ORDER BY id`)
    rows.push(data)
  }
  return rows
}
async function countCommands() {
  const [rows] = await db.query('SELECT COUNT(*) AS n FROM guest_claim_commands')
  return rows
}
test('新目标requested初态读回，登记不修改会话/案例/植物或生成成功事实', async () => {
  const before = await state()
  expect(await register()).toEqual(registered)
  const after = await state()
  expect(after.slice(0, 3)).toEqual(before.slice(0, 3))
  expect(after[4]).toEqual([])
  const [rows] = await db.query(
    'SELECT claim_ref,target_type,requested_user_plant_internal_id,target_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,failure_code,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated FROM guest_claim_commands'
  )
  expect(rows).toEqual([
    {
      claim_ref: registered.claimRef,
      target_type: 'new_user_plant',
      requested_user_plant_internal_id: null,
      target_user_plant_internal_id: null,
      idempotency_key: 'b'.repeat(64),
      request_hash: hash(
        '{"guestSessionRef":"gst_registration_session01","guestPlantCaseRef":"gpc_registration_case01","target":{"type":"new_user_plant"}}'
      ),
      proof_version: 2,
      status: 'requested',
      processing_lease_owner_hash: null,
      processing_lease_expires_at_ms: null,
      attempt_count: 0,
      failure_code: null,
      created: '3000',
      updated: '3000'
    }
  ])
})
test.each(['active', 'archived'])('已有本人%s目标可以登记，原植物不变化', async lifecycle => {
  const command = input()
  command.target = { type: 'existing_user_plant', user_plant_id: `upl_registration_${lifecycle}01` }
  const before = await state()
  expect(await register(command)).toEqual(registered)
  const [rows] = await db.query(
    'SELECT target_type,requested_user_plant_internal_id,target_user_plant_internal_id FROM guest_claim_commands'
  )
  expect(rows).toEqual([
    {
      target_type: 'existing_user_plant',
      requested_user_plant_internal_id: lifecycle === 'active' ? 1 : 2,
      target_user_plant_internal_id: null
    }
  ])
  expect((await state()).slice(0, 3)).toEqual(before.slice(0, 3))
})
test('同键候选及当前证明版本变化仍保留原引用/原版本且零新增', async () => {
  await register()
  const nextProof = Buffer.alloc(32, 9).toString('base64url')
  await db.execute(
    'UPDATE guest_sessions SET possession_proof_hash=?,possession_proof_version=3 WHERE id=1',
    [hash(nextProof)]
  )
  const before = await state()
  const command = input()
  command.claimRef = 'gcl_registration_retry01'
  command.proof.possessionProof = nextProof
  command.proof.nowMs = 4000
  expect(await register(command)).toEqual({ ...registered, replayed: true })
  expect(await state()).toEqual(before)
})
test('同键不同显式目标冲突，命令与原所有事实零变更', async () => {
  await register()
  const before = await state()
  const command = input()
  command.target = { type: 'existing_user_plant', user_plant_id: 'upl_registration_active01' }
  expect(await register(command)).toEqual({ status: 'idempotency_conflict' })
  expect(await state()).toEqual(before)
})
test.each([
  'wrong_subject',
  'other_session',
  'inactive_user',
  'other_target',
  'deleted_target'
] as const)('证明/归属%s拒绝零命令', async kind => {
  const command = input()
  if (kind === 'wrong_subject') {
    command.proof.anonymousSubjectHash = 'c'.repeat(64)
  }
  if (kind === 'other_session') {
    command.guestPlantCaseRef = 'gpc_registration_other01'
  }
  if (kind === 'inactive_user') {
    await db.query("UPDATE users SET status='disabled' WHERE id=1")
  }
  if (kind === 'other_target') {
    command.target = { type: 'existing_user_plant', user_plant_id: 'upl_registration_other01' }
  }
  if (kind === 'deleted_target') {
    command.target = { type: 'existing_user_plant', user_plant_id: 'upl_registration_deleted01' }
  }
  const before = await state()
  expect(await register(command)).toEqual({
    status: kind === 'inactive_user' ? 'principal_invalid' : 'not_claimable'
  })
  expect(await state()).toEqual(before)
})
test('案例未completed不可登记；案例到期拒绝新键但原命令引用仍可查询', async () => {
  await db.query("UPDATE guest_plant_cases SET status='active',completed_at_ms=NULL WHERE id=1")
  expect(await register()).toEqual({ status: 'not_claimable' })
  expect(await countCommands()).toEqual([{ n: 0 }])
  await db.query("UPDATE guest_plant_cases SET status='completed',completed_at_ms=2000 WHERE id=1")
  await register()
  const command = input()
  command.proof.nowMs = 5000
  expect(await register(command)).toEqual({ ...registered, replayed: true })
  command.idempotencyKeyHash = 'e'.repeat(64)
  command.claimRef = 'gcl_registration_expired01'
  expect(await register(command)).toEqual({ status: 'expired' })
  expect(await countCommands()).toEqual([{ n: 1 }])
})
test.each(['processing', 'failed'] as const)(
  '原%s状态及租约/失败数据重放原样保留',
  async status => {
    await register()
    if (status === 'processing') {
      await db.execute(
        "UPDATE guest_claim_commands SET status='processing',attempt_count=1,processing_lease_owner_hash=?,processing_lease_expires_at_ms=8000,updated_at_ms=4000",
        ['f'.repeat(64)]
      )
    } else {
      await db.query(
        "UPDATE guest_claim_commands SET status='failed',attempt_count=1,failure_code='CONTROLLED_FAILURE',updated_at_ms=4000"
      )
    }
    const before = await state()
    expect(await register()).toEqual({ ...registered, replayed: true })
    expect(await state()).toEqual(before)
  }
)
test('completed引用只有真实三表一致事实可复用，缺成功事实拒绝', async () => {
  await register()
  await db.query(
    "UPDATE guest_claim_commands SET status='completed',attempt_count=1,target_user_plant_internal_id=1,updated_at_ms=4000"
  )
  await db.query(
    "UPDATE guest_plant_cases SET status='claimed',claimed_user_internal_id=1,claimed_user_plant_internal_id=1,version=8,updated_at_ms=4000 WHERE id=1"
  )
  await db.query(
    'INSERT INTO guest_case_claims(guest_plant_case_internal_id,claim_command_internal_id,user_internal_id,user_plant_internal_id,claimed_at_ms,created_at_ms) SELECT 1,id,1,1,4000,4000 FROM guest_claim_commands'
  )
  const before = await state()
  expect(await register()).toEqual({ ...registered, replayed: true })
  expect(await state()).toEqual(before)
  await db.query('DELETE FROM guest_case_claims')
  expect(await register()).toEqual({ status: 'unavailable' })
})
test('同案例同键并发只登记一命令，两事务回原引用', async () => {
  const results = await Promise.all([
    register(),
    register({ ...input(), claimRef: 'gcl_registration_race01' })
  ])
  expect(results.filter(result => result.status === 'registered')).toHaveLength(2)
  expect(results.filter(result => result.status === 'registered' && !result.replayed)).toHaveLength(
    1
  )
  expect(
    new Set(results.map(result => (result.status === 'registered' ? result.claimRef : null))).size
  ).toBe(1)
  expect(await countCommands()).toEqual([{ n: 1 }])
})
test('插入后读回故障由外层真实事务回滚，不遗留requested命令', async () => {
  let inserted = false
  const guarded: typeof source = {
    getConnection: async () => {
      const connection = await source.getConnection()
      return {
        ...connection,
        execute: async (sql, args) => {
          const result = await connection.execute(sql, args)
          if (/INSERT\s+INTO\s+`?guest_claim_commands/iu.test(sql)) {
            inserted = true
          }
          return result
        },
        query: async (sql, args) => {
          if (inserted && /\bguest_claim_commands\b/iu.test(sql)) {
            throw new Error('受控登记后读回失败')
          }
          return connection.query(sql, args)
        }
      }
    }
  }
  const before = await state()
  await expect(
    runDatabaseTransaction(
      createMysqlTransactionDriver(guarded, () => undefined),
      tx => repository().register(tx, input())
    )
  ).rejects.toThrow('受控登记后读回失败')
  expect(inserted).toBe(true)
  expect(await state()).toEqual(before)
})
