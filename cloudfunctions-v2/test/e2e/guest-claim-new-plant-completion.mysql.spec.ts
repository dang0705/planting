import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { guestClaimFixtureDdl } from './guest-claim-registration-fixture.js'
import type {
  UserPrincipalDto,
  UserRef,
  UserCapabilitySnapshotDto
} from '../../src/contracts/types.js'
import {
  createMysql2ConnectionSource,
  toSqlParameters,
  type Mysql2QueryConnection
} from '../../src/foundation/database/mysql2-connection-source.js'
import {
  createMysqlTransactionDriver,
  type MysqlTransactionContext
} from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlGuestClaimProofRepository } from '../../src/user-plant/repository/mysql-guest-claim-proof-repository.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../../src/user-plant/repository/mysql-guest-claim-completed-receipt-reader.js'
import { createMysqlGuestClaimNewPlantCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-new-plant-completion-repository.js'

/** L3/unit_real_data：独立Expected来自guest-claim-new-plant-completion-contract.md。
 * 真实MySQL8.4→真实证明/用户行锁与创建领域→新植物及认领四写→同事务读回。
 * processing命令、Principal和能力为明确夹具，不取得租约、不验证身份/权益Provider或公开HTTP。
 * 已准入游客四表夹具不变，仅隔离user_plants缩减表补创建初态列/AUTO_INCREMENT；非生产DDL。 */
const container = `qhz-guest-new-completion-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const possessionProof = Buffer.alloc(32, 7).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_newcompletion_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01Z',
  expiresAt: '1970-01-01T00:00:09Z'
}
function capability(): UserCapabilitySnapshotDto {
  return {
    contractVersion: 'capability-snapshot/v1',
    snapshotRef: 'cps_newcompletion_fixture01',
    subjectType: 'user',
    user_id: principal.user_id,
    tier: 'free',
    allowedCapabilities: ['USER_PLANT_CREATE'],
    rewardedAiScopes: [],
    activeUserPlantLimit: 1,
    generatedAt: '1970-01-01T00:00:02Z',
    validUntil: '1970-01-01T00:00:08Z',
    policyVersion: 'user-plant-limit/v1'
  }
}
function input() {
  return {
    principal,
    proof: {
      guestSessionRef: 'gst_newcompletion_session01',
      anonymousSubjectHash: 'a'.repeat(64),
      possessionProof,
      nowMs: 3000,
      proofRotationGraceSeconds: 30 as number | null
    },
    guestPlantCaseRef: 'gpc_newcompletion_case01',
    target: { type: 'new_user_plant' as const },
    claimRef: 'gcl_newcompletion_command01',
    idempotencyKeyHash: 'b'.repeat(64),
    leaseOwnerHash: 'd'.repeat(64),
    newUserPlantRef: 'upl_newcompletion_target01',
    capabilitySnapshot: capability() as UserCapabilitySnapshotDto | null
  }
}
const completed = {
  status: 'completed',
  claimRef: 'gcl_newcompletion_command01',
  userPlantRef: 'upl_newcompletion_target01',
  guestPlantCaseRef: 'gpc_newcompletion_case01',
  proofVersion: 1,
  claimedAtMs: 3000
}
function requestHash(caseRef = input().guestPlantCaseRef) {
  return hash(
    JSON.stringify({
      guestSessionRef: input().proof.guestSessionRef,
      guestPlantCaseRef: caseRef,
      target: { type: 'new_user_plant' }
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
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1)),
    options = { host: '127.0.0.1', port, user: 'root', password: '' }
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      db = await createConnection(options)
      await db.query('SELECT 1')
      ready = true
      break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离游客新建完成MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE guest_new_completion CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE guest_new_completion')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(
      statement.includes('CREATE TABLE user_plants(')
        ? `CREATE TABLE user_plants(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,user_internal_id BIGINT UNSIGNED NOT NULL,public_user_plant_id VARCHAR(64) UNIQUE,lifecycle_status VARCHAR(24),_openid VARCHAR(64) DEFAULT '',current_identity_status VARCHAR(24) NOT NULL DEFAULT 'unidentified',confirmed_identity_internal_id BIGINT UNSIGNED NULL,version INT UNSIGNED NOT NULL DEFAULT 1,created_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 1000,updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 1000,UNIQUE KEY owner_id(user_internal_id,id))`
        : statement
    )
  }
  source = createMysql2ConnectionSource({ ...options, database: 'guest_new_completion' })
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
    "INSERT INTO users VALUES(1,'usr_newcompletion_owner01','active',''),(2,'usr_newcompletion_owner02','active','')"
  )
  await db.query(
    "INSERT INTO user_plants(id,user_internal_id,public_user_plant_id,lifecycle_status) VALUES(1,1,'upl_newcompletion_archived01','archived'),(2,2,'upl_newcompletion_other01','active')"
  )
  await db.execute(
    "INSERT INTO guest_sessions(id,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,previous_possession_proof_hash,previous_proof_valid_until_ms,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'gst_newcompletion_session01',?,?,2,?,4500,'active',1000,10000,1000,2000)",
    ['a'.repeat(64), hash(possessionProof), hash(Buffer.alloc(32, 8).toString('base64url'))]
  )
  await db.query(
    "INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_newcompletion_case01',1,'completed',2000,5000,7,1000,2000),(2,'gpc_newcompletion_case02',1,'completed',2000,5000,7,1000,2000)"
  )
  await db.execute(
    "INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,created_at_ms,updated_at_ms) VALUES(1,'gcl_newcompletion_command01',1,1,'new_user_plant',?,?,1,'processing',?,8000,3,2000,2000)",
    ['b'.repeat(64), requestHash(), 'd'.repeat(64)]
  )
})
function repository() {
  const plants = createMysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
    executeQuery: async (tx, sql, args) =>
      (await tx.connection.query(
        sql,
        toSqlParameters(args)
      )) as unknown as readonly UserPlantSqlRow[],
    executeWrite: (tx, sql, args) => tx.connection.execute(sql, toSqlParameters(args))
  })
  return createMysqlGuestClaimNewPlantCompletionRepository({
    ...createMysqlGuestClaimProofRepository(),
    plants
  })
}
async function complete(value = input()) {
  return runDatabaseTransaction(
    createMysqlTransactionDriver(source, () => undefined),
    tx => repository().complete(tx, value)
  )
}
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
test('新建active/unidentified/v1与认领原子完成，保留原命令并清除上一版证明', async () => {
  expect(await complete()).toEqual(completed)
  const [plants] = await db.query(
    "SELECT public_user_plant_id,user_internal_id,lifecycle_status,current_identity_status,confirmed_identity_internal_id,version,CAST(created_at_ms AS CHAR) AS created,CAST(updated_at_ms AS CHAR) AS updated FROM user_plants WHERE public_user_plant_id='upl_newcompletion_target01'"
  )
  expect(plants).toEqual([
    {
      public_user_plant_id: completed.userPlantRef,
      user_internal_id: 1,
      lifecycle_status: 'active',
      current_identity_status: 'unidentified',
      confirmed_identity_internal_id: null,
      version: 1,
      created: '3000',
      updated: '3000'
    }
  ])
  const [commands] = await db.query(
    'SELECT claim_ref,request_hash,proof_version,attempt_count,status,requested_user_plant_internal_id,processing_lease_owner_hash,processing_lease_expires_at_ms FROM guest_claim_commands'
  )
  expect(commands).toEqual([
    {
      claim_ref: completed.claimRef,
      request_hash: requestHash(),
      proof_version: 1,
      attempt_count: 3,
      status: 'completed',
      requested_user_plant_internal_id: null,
      processing_lease_owner_hash: null,
      processing_lease_expires_at_ms: null
    }
  ])
  const [facts] = await db.query(
    'SELECT u.public_user_id,p.public_user_plant_id,e.status,e.version,CAST(f.claimed_at_ms AS CHAR) AS claimed FROM guest_case_claims f JOIN guest_plant_cases e ON e.id=f.guest_plant_case_internal_id AND e.claimed_user_internal_id=f.user_internal_id AND e.claimed_user_plant_internal_id=f.user_plant_internal_id JOIN user_plants p ON p.id=f.user_plant_internal_id AND p.user_internal_id=f.user_internal_id JOIN users u ON u.id=f.user_internal_id'
  )
  expect(facts).toEqual([
    {
      public_user_id: principal.user_id,
      public_user_plant_id: completed.userPlantRef,
      status: 'claimed',
      version: 8,
      claimed: '3000'
    }
  ])
  const [sessions] = await db.query(
    'SELECT possession_proof_version,previous_possession_proof_hash,previous_proof_valid_until_ms FROM guest_sessions'
  )
  expect(sessions).toEqual([
    {
      possession_proof_version: 2,
      previous_possession_proof_hash: null,
      previous_proof_valid_until_ms: null
    }
  ])
})
test.each(['null', 'denied', 'expired', 'other_owner', 'at_limit'] as const)(
  '创建能力%s零五写',
  async reason => {
    const value = input()
    if (reason === 'null') {
      value.capabilitySnapshot = null
    }
    if (reason === 'denied') {
      value.capabilitySnapshot = { ...capability(), allowedCapabilities: [] }
    }
    if (reason === 'expired') {
      value.capabilitySnapshot = { ...capability(), validUntil: '1970-01-01T00:00:03Z' }
    }
    if (reason === 'other_owner') {
      value.capabilitySnapshot = {
        ...capability(),
        user_id: 'usr_newcompletion_owner02' as UserRef
      }
    }
    if (reason === 'at_limit') {
      await db.query("UPDATE user_plants SET lifecycle_status='active' WHERE id=1")
    }
    const before = await snapshot()
    expect(await complete(value)).toEqual({
      status:
        reason === 'null'
          ? 'unavailable'
          : reason === 'expired'
            ? 'capability_snapshot_expired'
            : 'capability_denied'
    })
    expect(await snapshot()).toEqual(before)
  }
)
test.each([
  'user_plants',
  'guest_plant_cases',
  'guest_claim_commands',
  'guest_case_claims',
  'guest_sessions'
] as const)('真实%s写后故障，包含新植物的五写全部回滚', async table => {
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
            throw new Error('受控新植物五写故障')
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
  ).rejects.toThrow('受控新植物五写故障')
  expect(injected).toBe(true)
  expect(await snapshot()).toEqual(before)
})
test.each(['initial_plant', 'completed_fact'] as const)(
  '新植物已插入后%s读回故障，整笔创建与认领回滚',
  async stage => {
    let created = false,
      injected = false
    const guarded: typeof source = {
      getConnection: async () => {
        const connection = await source.getConnection()
        return {
          ...connection,
          execute: async (sql, args) => {
            const result = await connection.execute(sql, args)
            if (/INSERT\s+INTO\s+`?user_plants/iu.test(sql)) {
              created = true
            }
            return result
          },
          query: async (sql, args) => {
            if (
              created &&
              (stage === 'initial_plant'
                ? /SELECT\s+'plant'/iu.test(sql)
                : /\bguest_case_claims\b/iu.test(sql))
            ) {
              injected = true
              throw new Error('受控创建后读回故障')
            }
            return connection.query(sql, args)
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
    ).rejects.toThrow('受控创建后读回故障')
    expect({ created, injected }).toEqual({ created: true, injected: true })
    expect(await snapshot()).toEqual(before)
  }
)
test('两个案例并发争最后一个active名额仅一株创建并完成', async () => {
  const second = {
    ...input(),
    guestPlantCaseRef: 'gpc_newcompletion_case02',
    claimRef: 'gcl_newcompletion_command02',
    newUserPlantRef: 'upl_newcompletion_target02'
  }
  await db.execute(
    "INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,created_at_ms,updated_at_ms) VALUES(2,'gcl_newcompletion_command02',2,1,'new_user_plant',?,?,1,'processing',?,8000,3,2000,2000)",
    ['b'.repeat(64), requestHash(second.guestPlantCaseRef), 'd'.repeat(64)]
  )
  const results = await Promise.all([complete(), complete(second)])
  const [rows] = await db.query(
    "SELECT (SELECT COUNT(*) FROM user_plants WHERE user_internal_id=1 AND lifecycle_status='active') AS plants,(SELECT COUNT(*) FROM guest_case_claims) AS facts,(SELECT COUNT(*) FROM guest_claim_commands WHERE status='completed') AS commands"
  )
  expect(rows).toEqual([{ plants: 1, facts: 1, commands: 1 }])
  expect(results.filter(value => value.status === 'completed')).toHaveLength(1)
  expect(results.filter(value => value.status === 'capability_denied')).toHaveLength(1)
})
test('重复完成不创建第二株，候选变化/null能力不替换只读成功收据', async () => {
  await complete()
  const before = await snapshot()
  expect(
    await complete({
      ...input(),
      newUserPlantRef: 'upl_newcompletion_retry01',
      capabilitySnapshot: null
    })
  ).toEqual({ status: 'not_claimable' })
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
