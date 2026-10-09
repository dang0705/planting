import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { guestClaimFixtureDdl } from './guest-claim-registration-fixture.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createMysql2ConnectionSource, toSqlParameters, type Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTransactionDriver, type MysqlTransactionContext } from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlGuestClaimProofRepository } from '../../src/user-plant/repository/mysql-guest-claim-proof-repository.js'
import { createMysqlGuestClaimCommandRegistrationRepository } from '../../src/user-plant/repository/mysql-guest-claim-command-registration-repository.js'
import { createMysqlGuestClaimLeaseRepository, type GuestClaimLeaseInput } from '../../src/user-plant/repository/mysql-guest-claim-lease-repository.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../../src/user-plant/repository/mysql-guest-claim-completed-receipt-reader.js'
import { createMysqlGuestClaimExistingCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-existing-completion-repository.js'
import { createMysqlGuestClaimNewPlantCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-new-plant-completion-repository.js'
import { createMysqlUserPlantRepository, type UserPlantSqlRow } from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { createGuestClaimCompletionApplicationService } from '../../src/user-plant/application/complete-guest-claim.js'
import { createClaimGuestPlantCaseApplicationService } from '../../src/user-plant/application/claim-guest-plant-case.js'

/**
 * L3/unit_real_data：Expected 来自 guest-claim-lease-test-matrix.md L2–L9、A1（硬规则 30 秒租约；guest-session-claim/v1 状态机；
 * guest-token/v1 §3 令牌即持有证明）。真实 MySQL 8.4、真实事务/行锁、真实登记/租约/完成/收据仓储与应用编排。
 * 夹具：认领四表取 003+023 冻结定义，users/user_plants 为缩减的归属外键边界；不覆盖 HTTP、身份 Provider 与派生对象类别。
 */
const container = `qhz-guest-lease-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const guestToken = Buffer.alloc(32, 7).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const principal: UserPrincipalDto = { principalType: 'user', user_id: 'usr_lease_owner0001' as UserRef, sessionVersion: 1, authenticatedVia: 'wechat', issuedAt: '1970-01-01T00:00:01Z', expiresAt: '1970-01-01T00:01:40Z' }
const now = 3000
const mine = 'c'.repeat(64)
const other = 'd'.repeat(64)
const requestHash = hash(JSON.stringify({ guestSessionRef: 'gst_lease_session0001', guestPlantCaseRef: 'gpc_lease_case000001', target: { type: 'existing_user_plant', user_plant_id: 'upl_lease_existing01' } }))
const leaseInput = (patch: Partial<GuestClaimLeaseInput> = {}): GuestClaimLeaseInput => ({
  userRef: principal.user_id, guestSessionRef: 'gst_lease_session0001', guestPlantCaseRef: 'gpc_lease_case000001',
  idempotencyKeyHash: 'b'.repeat(64), claimRef: 'gcl_lease_command0001', leaseOwnerHash: mine, nowMs: now, ...patch
})
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
    throw new Error('隔离游客认领租约MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE guest_lease CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE guest_lease')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(
      statement.includes('CREATE TABLE user_plants(')
        ? `CREATE TABLE user_plants(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,user_internal_id BIGINT UNSIGNED NOT NULL,public_user_plant_id VARCHAR(64) UNIQUE,lifecycle_status VARCHAR(24),_openid VARCHAR(64) DEFAULT '',current_identity_status VARCHAR(24) NOT NULL DEFAULT 'unidentified',confirmed_identity_internal_id BIGINT UNSIGNED NULL,version INT UNSIGNED NOT NULL DEFAULT 1,created_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 1000,updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 1000,UNIQUE KEY owner_id(user_internal_id,id))`
        : statement
    )
  }
  source = createMysql2ConnectionSource({ ...options, database: 'guest_lease' })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
beforeEach(async () => {
  for (const table of ['guest_case_claims', 'guest_claim_commands', 'guest_plant_cases', 'guest_sessions', 'user_plants', 'users']) {
    await db.query(`DELETE FROM ${table}`)
  }
  await db.query("INSERT INTO users VALUES(1,'usr_lease_owner0001','active',''),(2,'usr_lease_other00001','active','')")
  await db.query("INSERT INTO user_plants(id,user_internal_id,public_user_plant_id,lifecycle_status) VALUES(1,1,'upl_lease_existing01','active')")
  await db.execute("INSERT INTO guest_sessions(id,identity_source,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'server_issued_guest_token','gst_lease_session0001',NULL,?,1,'active',1000,90000,1000,2000)", [hash(guestToken)])
  await db.query("INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_lease_case000001',1,'completed',2000,90000,1,1000,2000)")
})
/** 写入一条命令（requested 或指定状态）。 */
async function seedCommand(status = 'requested', owner: string | null = null, expiresAt: number | null = null, attempts = 0) {
  await db.execute(`INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,failure_code,created_at_ms,updated_at_ms)
    VALUES(1,'gcl_lease_command0001',1,1,'existing_user_plant',1,?,?,1,?,?,?,?,?,2000,2000)`, ['b'.repeat(64), requestHash, status, owner, expiresAt, attempts, status === 'failed' ? 'CONTROLLED_FAILURE' : null])
}
async function command() {
  const [rows] = await db.query('SELECT status,processing_lease_owner_hash AS owner,CAST(processing_lease_expires_at_ms AS CHAR) AS expires,attempt_count AS attempts,CAST(updated_at_ms AS CHAR) AS updated FROM guest_claim_commands')
  return (rows as Array<Record<string, unknown>>)[0]
}
const acquire = (value = leaseInput()) => runDatabaseTransaction(createMysqlTransactionDriver(source, () => undefined), tx => createMysqlGuestClaimLeaseRepository().acquire(tx, value))

describe('游客认领处理租约（真实 MySQL）', () => {
  test('L2 requested → processing：attempt=1、期限 now+30000、服务端持有者摘要', async () => {
    await seedCommand()
    expect(await acquire()).toEqual({ status: 'acquired', leaseExpiresAtMs: now + 30_000, attemptCount: 1, takeover: false })
    expect(await command()).toEqual({ status: 'processing', owner: mine, expires: String(now + 30_000), attempts: 1, updated: String(now) })
  })
  test('L3 已过期租约（含到期边界）→ 接管：attempt+1，换新持有者', async () => {
    await seedCommand('processing', other, now, 2)
    expect(await acquire()).toEqual({ status: 'acquired', leaseExpiresAtMs: now + 30_000, attemptCount: 3, takeover: true })
    expect(await command()).toMatchObject({ owner: mine, attempts: 3, expires: String(now + 30_000) })
  })
  test('L4 未过期他人租约 → held，原行不变', async () => {
    await seedCommand('processing', other, now + 1, 1)
    const before = await command()
    expect(await acquire()).toEqual({ status: 'held' })
    expect(await command()).toEqual(before)
  })
  test.each(['completed', 'failed'] as const)('L5 %s → 不取得，原行不变', async status => {
    if (status === 'completed') {
      await db.query("UPDATE guest_plant_cases SET status='claimed',claimed_user_internal_id=1,claimed_user_plant_internal_id=1,version=2 WHERE id=1")
      await db.execute(`INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,target_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,attempt_count,created_at_ms,updated_at_ms)
        VALUES(1,'gcl_lease_command0001',1,1,'existing_user_plant',1,1,?,?,1,'completed',1,2000,2000)`, ['b'.repeat(64), requestHash])
    } else {
      await seedCommand('failed', null, null, 1)
    }
    const before = await command()
    expect(await acquire()).toEqual({ status })
    expect(await command()).toEqual(before)
  })
  test('L6 命令不存在、claimRef 不符、他人用户 → not_found，零写', async () => {
    expect(await acquire()).toEqual({ status: 'not_found' })
    await seedCommand()
    const before = await command()
    expect(await acquire(leaseInput({ claimRef: 'gcl_lease_otherref01' }))).toEqual({ status: 'not_found' })
    expect(await acquire(leaseInput({ userRef: 'usr_lease_other00001' }))).toEqual({ status: 'not_found' })
    expect(await command()).toEqual(before)
  })
  test('L9 两个事务并发取得同一 requested 命令 → 一个 acquired，一个 held', async () => {
    await seedCommand()
    const results = await Promise.all([acquire(), acquire(leaseInput({ leaseOwnerHash: other }))])
    expect(results.map(result => result.status).sort()).toEqual(['acquired', 'held'])
    expect((await command())?.attempts).toBe(1)
  })
  test('L8 持有者在租约到期后完成 → 既有完成核心返回 expired，零成功事实', async () => {
    await seedCommand()
    await acquire()
    const proofRepository = createMysqlGuestClaimProofRepository()
    const completion = createMysqlGuestClaimExistingCompletionRepository({ lockAndVerify: (tx, value) => proofRepository.lockAndVerify(tx, value) })
    const late = now + 30_000
    const result = await runDatabaseTransaction(createMysqlTransactionDriver(source, () => undefined), tx => completion.complete(tx, {
      principal, proof: { guestSessionRef: 'gst_lease_session0001', possessionProof: guestToken, nowMs: late, proofRotationGraceSeconds: null },
      guestPlantCaseRef: 'gpc_lease_case000001', target: { type: 'existing_user_plant', user_plant_id: 'upl_lease_existing01' },
      claimRef: 'gcl_lease_command0001', idempotencyKeyHash: 'b'.repeat(64), leaseOwnerHash: mine
    }))
    expect(result).toEqual({ status: 'expired' })
    const [facts] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
    expect(facts).toEqual([{ n: 0 }])
  })
})

describe('游客认领完整应用（真实 MySQL）', () => {
  function service() {
    const driver = createMysqlTransactionDriver(source, () => undefined)
    const proofRepository = createMysqlGuestClaimProofRepository()
    const lockAndVerify = (tx: MysqlTransactionContext<Mysql2QueryConnection>, value: Parameters<typeof proofRepository.lockAndVerify>[1]) => proofRepository.lockAndVerify(tx, value)
    const receiptReader = createMysqlGuestClaimCompletedReceiptReader(source)
    const plants = createMysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
      executeQuery: async (tx, text, parameters) => (await tx.connection.query(text, toSqlParameters(parameters))) as unknown as readonly UserPlantSqlRow[],
      executeWrite: (tx, text, parameters) => tx.connection.execute(text, toSqlParameters(parameters))
    })
    const completeClaim = createGuestClaimCompletionApplicationService({
      nowMs: () => now, driver,
      existingRepository: createMysqlGuestClaimExistingCompletionRepository({ lockAndVerify }),
      newPlantRepository: createMysqlGuestClaimNewPlantCompletionRepository({ lockAndVerify, plants }),
      completedReceiptReader: receiptReader
    })
    return createClaimGuestPlantCaseApplicationService({
      nowMs: () => now, driver, createLeaseOwnerHash: () => mine, completedReceiptReader: receiptReader,
      registrationRepository: createMysqlGuestClaimCommandRegistrationRepository({ lockAndVerify }),
      leaseRepository: createMysqlGuestClaimLeaseRepository(), completeClaim
    })
  }
  const claim = () => ({
    principal, proof: { guestSessionRef: 'gst_lease_session0001', possessionProof: guestToken, nowMs: now, proofRotationGraceSeconds: null },
    guestPlantCaseRef: 'gpc_lease_case000001', target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_lease_existing01' },
    claimRef: 'gcl_lease_command0001', idempotencyKeyHash: 'b'.repeat(64)
  })
  test('A1 登记→取得→完成：案例 claimed、命令 completed 且租约清除、唯一成功事实；同键重放返回原收据', async () => {
    const expected = { status: 'completed', claimRef: 'gcl_lease_command0001', userPlantRef: 'upl_lease_existing01', guestPlantCaseRef: 'gpc_lease_case000001', proofVersion: 1, claimedAtMs: now }
    expect(await service()(claim())).toEqual(expected)
    expect(await command()).toMatchObject({ status: 'completed', owner: null, expires: null, attempts: 1 })
    const [facts] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
    expect(facts).toEqual([{ n: 1 }])
    expect(await service()({ ...claim(), claimRef: 'gcl_lease_retry00001' })).toEqual(expected)
    const [again] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
    expect(again).toEqual([{ n: 1 }])
  })
  // Expected：主代理 2026-10-09 裁决 1/2——active 案例可认领；按案例逐个认领，会话最后一个未认领未过期案例被认领时同事务置 completed。
  test('active 案例可认领；同会话仍有未认领案例时会话保持 active，最后一个认领后 completed；completed 会话新命令被拒', async () => {
    await db.query("UPDATE guest_plant_cases SET status='active',completed_at_ms=NULL WHERE id=1")
    await db.query("INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(2,'gpc_lease_case000002',1,'active',NULL,90000,1,1000,2000),(3,'gpc_lease_case000003',1,'active',NULL,2500,1,1000,2000)")
    await db.query("INSERT INTO user_plants(id,user_internal_id,public_user_plant_id,lifecycle_status) VALUES(2,1,'upl_lease_existing02','active')")
    const sessionStatus = async () => ((await db.query('SELECT status FROM guest_sessions WHERE id=1'))[0] as Array<{ status: string }>)[0]?.status
    expect(await service()(claim())).toMatchObject({ status: 'completed', guestPlantCaseRef: 'gpc_lease_case000001' })
    expect(await sessionStatus()).toBe('active')
    const second = { ...claim(), guestPlantCaseRef: 'gpc_lease_case000002', target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_lease_existing02' }, claimRef: 'gcl_lease_command0002', idempotencyKeyHash: 'e'.repeat(64) }
    expect(await service()(second)).toMatchObject({ status: 'completed', guestPlantCaseRef: 'gpc_lease_case000002' })
    // 案例 3 已过期（2500 < now），不阻止会话完成。
    expect(await sessionStatus()).toBe('completed')
    // completed 会话：同键同参重放原收据；同案例新键被拒。
    expect(await service()({ ...second, claimRef: 'gcl_lease_retry00002' })).toMatchObject({ status: 'completed', claimRef: 'gcl_lease_command0002' })
    expect(await service()({ ...second, idempotencyKeyHash: 'f'.repeat(64), claimRef: 'gcl_lease_command0003' })).toEqual({ status: 'not_claimable' })
    expect(await service()({ ...claim(), guestPlantCaseRef: 'gpc_lease_case000003', claimRef: 'gcl_lease_command0004', idempotencyKeyHash: '9'.repeat(64) })).toEqual({ status: 'not_claimable' })
  })
  test('A4 他人持有未过期租约 → processing，零成功事实', async () => {
    await seedCommand('processing', other, now + 10_000, 1)
    expect(await service()(claim())).toEqual({ status: 'processing' })
    const [facts] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
    expect(facts).toEqual([{ n: 0 }])
  })
  test('错误游客令牌 → not_claimable，零命令', async () => {
    expect(await service()({ ...claim(), proof: { ...claim().proof, possessionProof: Buffer.alloc(32, 9).toString('base64url') } })).toEqual({ status: 'not_claimable' })
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM guest_claim_commands')
    expect(rows).toEqual([{ n: 0 }])
  })
})
