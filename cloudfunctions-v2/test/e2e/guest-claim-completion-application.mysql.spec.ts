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
import { DatabaseCommitResultUnknownError } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlGuestClaimProofRepository } from '../../src/user-plant/repository/mysql-guest-claim-proof-repository.js'
import {
  createMysqlUserPlantRepository,
  type UserPlantSqlRow
} from '../../src/user-plant/repository/mysql-user-plant-repository.js'
import { createMysqlGuestClaimCompletedReceiptReader } from '../../src/user-plant/repository/mysql-guest-claim-completed-receipt-reader.js'
import { createMysqlGuestClaimExistingCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-existing-completion-repository.js'
import { createMysqlGuestClaimNewPlantCompletionRepository } from '../../src/user-plant/repository/mysql-guest-claim-new-plant-completion-repository.js'
import { createGuestClaimCompletionApplicationService } from '../../src/user-plant/application/complete-guest-claim.js'

/** L3/unit_real_data：Expected来自guest-claim-completion-application-contract.md。
 * 真实应用→新连接只读收据→真实事务/证明/两个Repository→MySQL五写及核对；processing命令明确seed。
 * Principal/能力/原租约为输入夹具；未知提交只替commit回包，真正commit或rollback后抛驱动未知异常。
 * 主代理 2026-10-09 裁决 2：单案例会话认领后同事务置 completed，写入计数随之加 1。
 * 隔离user_plants补创建初态列，非生产DDL；不覆盖身份Provider、租约取得、公开HTTP与派生对象。 */
const container = `qhz-guest-application-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const possessionProof = Buffer.alloc(32, 7).toString('base64url')
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_claimapp_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01Z',
  expiresAt: '1970-01-01T00:00:09Z'
}
function existingInput() {
  return {
    principal,
    proof: {
      guestSessionRef: 'gst_claimapp_session01',
      possessionProof,
      nowMs: 3000,
      proofRotationGraceSeconds: 30 as number | null
    },
    guestPlantCaseRef: 'gpc_claimapp_case01',
    target: { type: 'existing_user_plant' as const, user_plant_id: 'upl_claimapp_existing01' },
    claimRef: 'gcl_claimapp_command01',
    idempotencyKeyHash: 'b'.repeat(64),
    leaseOwnerHash: 'd'.repeat(64)
  }
}
function newInput() {
  return {
    ...existingInput(),
    target: { type: 'new_user_plant' as const },
    newUserPlantRef: 'upl_claimapp_new0001',
    capabilitySnapshot: {
      contractVersion: 'capability-snapshot/v1',
      snapshotRef: 'cps_claimapp_fixture01',
      subjectType: 'user',
      user_id: principal.user_id,
      tier: 'free',
      allowedCapabilities: ['USER_PLANT_CREATE'],
      rewardedAiScopes: [],
      activeUserPlantLimit: 2,
      generatedAt: '1970-01-01T00:00:02Z',
      validUntil: '1970-01-01T00:00:08Z',
      policyVersion: 'user-plant-limit/v1'
    } as UserCapabilitySnapshotDto | null
  }
}
const completed = {
  status: 'completed',
  claimRef: 'gcl_claimapp_command01',
  userPlantRef: 'upl_claimapp_existing01',
  guestPlantCaseRef: 'gpc_claimapp_case01',
  proofVersion: 1,
  claimedAtMs: 3000
}
function requestHash(kind: 'existing' | 'new') {
  const value = kind === 'existing' ? existingInput() : newInput()
  return hash(
    JSON.stringify({
      guestSessionRef: value.proof.guestSessionRef,
      guestPlantCaseRef: value.guestPlantCaseRef,
      target: value.target
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
    throw new Error('隔离游客完成应用MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE guest_application CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE guest_application')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(
      statement.includes('CREATE TABLE user_plants(')
        ? `CREATE TABLE user_plants(id BIGINT UNSIGNED PRIMARY KEY AUTO_INCREMENT,user_internal_id BIGINT UNSIGNED NOT NULL,public_user_plant_id VARCHAR(64) UNIQUE,lifecycle_status VARCHAR(24),_openid VARCHAR(64) DEFAULT '',current_identity_status VARCHAR(24) NOT NULL DEFAULT 'unidentified',confirmed_identity_internal_id BIGINT UNSIGNED NULL,version INT UNSIGNED NOT NULL DEFAULT 1,created_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 1000,updated_at_ms BIGINT UNSIGNED NOT NULL DEFAULT 1000,UNIQUE KEY owner_id(user_internal_id,id))`
        : statement
    )
  }
  source = createMysql2ConnectionSource({ ...options, database: 'guest_application' })
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
    "INSERT INTO users VALUES(1,'usr_claimapp_owner01','active',''),(2,'usr_claimapp_owner02','active','')"
  )
  await db.query(
    "INSERT INTO user_plants(id,user_internal_id,public_user_plant_id,lifecycle_status) VALUES(1,1,'upl_claimapp_existing01','active'),(2,1,'upl_claimapp_archived01','archived'),(3,2,'upl_claimapp_other001','active')"
  )
  await db.execute(
    "INSERT INTO guest_sessions(id,identity_source,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,previous_possession_proof_hash,previous_proof_valid_until_ms,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'server_issued_guest_token','gst_claimapp_session01',?,?,2,?,4500,'active',1000,5000,1000,2000)",
    ['a'.repeat(64), hash(possessionProof), hash(Buffer.alloc(32, 8).toString('base64url'))]
  )
  await db.query(
    "INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_claimapp_case01',1,'completed',2000,5000,7,1000,2000)"
  )
  await db.execute(
    "INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,processing_lease_owner_hash,processing_lease_expires_at_ms,attempt_count,created_at_ms,updated_at_ms) VALUES(1,'gcl_claimapp_command01',1,1,'existing_user_plant',1,?,?,1,'processing',?,8000,3,2000,2000)",
    ['b'.repeat(64), requestHash('existing'), 'd'.repeat(64)]
  )
})
async function seedNew() {
  await db.execute(
    "UPDATE guest_claim_commands SET target_type='new_user_plant',requested_user_plant_internal_id=NULL,request_hash=? WHERE id=1",
    [requestHash('new')]
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
function application(
  mode?: 'commit_unknown' | 'rollback_unknown' | 'write_failure' | 'read_failure',
  readBarrier?: (rows: readonly unknown[]) => Promise<void>,
  beforeTransaction?: () => Promise<void>
) {
  let now = 3000,
    transactions = 0,
    reads = 0,
    writes = 0
  const connections: object[] = []
  const txSource: typeof source = {
    getConnection: async () => {
      await beforeTransaction?.()
      transactions++
      const connection = await source.getConnection()
      connections.push(connection)
      return {
        ...connection,
        execute: async (sql, args) => {
          writes++
          const result = await connection.execute(sql, args)
          if (mode === 'write_failure') {
            throw new Error('受控真实写后SQL故障')
          }
          return result
        },
        commit: async () => {
          if (mode === 'rollback_unknown' && transactions === 1) {
            await connection.rollback()
          } else {
            await connection.commit()
          }
          if ((mode === 'commit_unknown' || mode === 'rollback_unknown') && transactions === 1) {
            throw new DatabaseCommitResultUnknownError('受控实际提交回包未知')
          }
        }
      }
    }
  }
  const readSource: typeof source = {
    getConnection: async () => {
      reads++
      const connection = await source.getConnection()
      connections.push(connection)
      return {
        ...connection,
        query: async (sql, args) => {
          expect(sql).toMatch(/^\s*SELECT\b/iu)
          expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/iu)
          if (mode === 'read_failure') {
            throw new Error('受控只读SQL故障')
          }
          const rows = await connection.query(sql, args)
          await readBarrier?.(rows)
          return rows
        },
        execute: async () => {
          throw new Error('应用收据核对禁止写SQL')
        },
        beginTransaction: async () => {
          throw new Error('应用收据核对禁止事务')
        }
      }
    }
  }
  const proof = createMysqlGuestClaimProofRepository()
  const plants = createMysqlUserPlantRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
    executeQuery: async (tx, sql, args) =>
      (await tx.connection.query(
        sql,
        toSqlParameters(args)
      )) as unknown as readonly UserPlantSqlRow[],
    executeWrite: (tx, sql, args) => tx.connection.execute(sql, toSqlParameters(args))
  })
  const service = createGuestClaimCompletionApplicationService({
    // 当前可信时刻为固定测试夹具，写事务仍使用原捕获时刻，没有生产默认。
    nowMs: () => now + 100,
    driver: createMysqlTransactionDriver(txSource, () => undefined),
    existingRepository: createMysqlGuestClaimExistingCompletionRepository(proof),
    newPlantRepository: createMysqlGuestClaimNewPlantCompletionRepository({ ...proof, plants }),
    completedReceiptReader: createMysqlGuestClaimCompletedReceiptReader(readSource)
  })
  return {
    service,
    setNowMs: (value: number) => {
      now = value
    },
    stats: () => ({ transactions, reads, writes, uniqueConnections: new Set(connections).size })
  }
}
test.each(['existing', 'new'] as const)('%s首次完成经真实事务保存并只读读回', async kind => {
  if (kind === 'new') {
    await seedNew()
  }
  const value = kind === 'existing' ? existingInput() : newInput(),
    app = application()
  const expected = {
    ...completed,
    userPlantRef: kind === 'existing' ? completed.userPlantRef : 'upl_claimapp_new0001'
  }
  expect(await app.service(value)).toEqual(expected)
  expect(app.stats()).toEqual({
    transactions: 1,
    reads: 1,
    writes: kind === 'existing' ? 5 : 6, // 裁决 2：单案例会话认领后同事务把会话置 completed，多 1 次写
    uniqueConnections: 2
  })
  const [rows] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
  expect(rows).toEqual([{ n: 1 }])
})
test.each(['existing', 'new'] as const)(
  '%s原收据在证明到期后重放不开始新事务，新目标null能力/新候选不替换原结果',
  async kind => {
    if (kind === 'new') {
      await seedNew()
    }
    const app = application(),
      value = kind === 'existing' ? existingInput() : newInput()
    const expected = {
      ...completed,
      userPlantRef: kind === 'existing' ? completed.userPlantRef : 'upl_claimapp_new0001'
    }
    expect(await app.service(value)).toEqual(expected)
    const before = await snapshot()
    value.proof.nowMs = 6000
    app.setNowMs(6000)
    value.claimRef = 'gcl_claimapp_retry0001'
    if ('capabilitySnapshot' in value) {
      value.capabilitySnapshot = null
      value.newUserPlantRef = 'upl_claimapp_retry0001'
    }
    expect(await app.service(value)).toEqual(expected)
    expect(await snapshot()).toEqual(before)
    expect(app.stats()).toEqual({
      transactions: 1,
      reads: 2,
      writes: kind === 'existing' ? 5 : 6, // 裁决 2：单案例会话认领后同事务把会话置 completed，多 1 次写
      uniqueConnections: 3
    })
  }
)
test.each(['existing', 'new'] as const)(
  '%s实际commit后未知结果新连接读原收据，只有一次写事务',
  async kind => {
    if (kind === 'new') {
      await seedNew()
    }
    const app = application('commit_unknown'),
      value = kind === 'existing' ? existingInput() : newInput()
    expect(await app.service(value)).toEqual({
      ...completed,
      userPlantRef: kind === 'existing' ? completed.userPlantRef : 'upl_claimapp_new0001'
    })
    expect(app.stats()).toEqual({
      transactions: 1,
      reads: 2,
      writes: kind === 'existing' ? 5 : 6, // 裁决 2：单案例会话认领后同事务把会话置 completed，多 1 次写
      uniqueConnections: 3
    })
    const [rows] = await db.query('SELECT COUNT(*) AS n FROM guest_case_claims')
    expect(rows).toEqual([{ n: 1 }])
  }
)
test.each(['existing', 'new'] as const)(
  '%s实际rollback后未知结果无收据返回unavailable，不再次创建或写入',
  async kind => {
    if (kind === 'new') {
      await seedNew()
    }
    const app = application('rollback_unknown'),
      before = await snapshot(),
      value = kind === 'existing' ? existingInput() : newInput()
    expect(await app.service(value)).toEqual({ status: 'unavailable' })
    expect(await snapshot()).toEqual(before)
    expect(app.stats()).toEqual({
      transactions: 1,
      reads: 2,
      writes: kind === 'existing' ? 5 : 6, // 裁决 2：单案例会话认领后同事务把会话置 completed，多 1 次写
      uniqueConnections: 3
    })
  }
)
test('普通SQL写后错误整体回滚，抛出异常而非未知提交重写', async () => {
  await seedNew()
  const app = application('write_failure'),
    before = await snapshot()
  await expect(app.service(newInput())).rejects.toThrow('受控真实写后SQL故障')
  expect(await snapshot()).toEqual(before)
  expect(app.stats()).toEqual({ transactions: 1, reads: 1, writes: 1, uniqueConnections: 2 })
})
test('预读故障不可用且零写事务、零重试', async () => {
  const app = application('read_failure'),
    before = await snapshot()
  expect(await app.service(existingInput())).toEqual({ status: 'unavailable' })
  expect(await snapshot()).toEqual(before)
  expect(app.stats()).toEqual({ transactions: 0, reads: 1, writes: 0, uniqueConnections: 1 })
})
test('跨用户目标拒绝，不生成归属或成功事实', async () => {
  const app = application(),
    before = await snapshot(),
    value = existingInput()
  value.principal = { ...principal, user_id: 'usr_claimapp_owner02' as UserRef }
  expect(await app.service(value)).toEqual({ status: 'not_claimable' })
  expect(await snapshot()).toEqual(before)
  // 合同更新：确定拒绝后只读一次核对并发原收据，跨用户仍不可见；零写Expected未改。
  expect(app.stats()).toEqual({ transactions: 1, reads: 2, writes: 0, uniqueConnections: 3 })
})
test('原完整成功同键异目标预读直接冲突，不启动新事务', async () => {
  const app = application()
  await app.service(existingInput())
  const before = await snapshot(),
    value = existingInput()
  value.target.user_plant_id = 'upl_claimapp_archived01'
  expect(await app.service(value)).toEqual({ status: 'idempotency_conflict' })
  expect(await snapshot()).toEqual(before)
  // 裁决 2：首次完成含会话置 completed 写入。
  expect(app.stats()).toEqual({ transactions: 1, reads: 2, writes: 5, uniqueConnections: 3 })
})

/** 原幂等合同：两份实际预读都null；确定让捕获较晚请求完成，等待者用新时刻核对。 */
test('同键新建两次真实预读均null，两个并发请求返回同一原成功且仅创建一次', async () => {
  await seedNew()
  let arrivals = 0,
    release!: () => void,
    releaseWinner!: () => void
  const ready = new Promise<void>(resolve => {
    release = resolve
  })
  const winnerFinished = new Promise<void>(resolve => {
    releaseWinner = resolve
  })
  const barrier = async (rows: readonly unknown[]) => {
    if (arrivals >= 2) {
      return
    }
    expect(rows).toEqual([])
    arrivals++
    if (arrivals === 2) {
      release()
    }
    await ready
  }
  const earlier = application(undefined, barrier, () => winnerFinished)
  const later = application(undefined, barrier)
  const first = newInput(),
    second = {
      ...newInput(),
      proof: { ...newInput().proof, nowMs: 3001 },
      newUserPlantRef: 'upl_claimapp_new0002'
    }
  try {
    const results = await Promise.all([
      earlier.service(first),
      later.service(second).finally(releaseWinner)
    ])
    const expected = { ...completed, userPlantRef: 'upl_claimapp_new0002', claimedAtMs: 3001 }
    expect(results).toEqual([expected, expected])
    const [rows] = await db.query(
      "SELECT (SELECT COUNT(*) FROM user_plants WHERE public_user_plant_id IN ('upl_claimapp_new0001','upl_claimapp_new0002')) AS plants,(SELECT COUNT(*) FROM guest_case_claims) AS facts,(SELECT COUNT(*) FROM guest_claim_commands WHERE status='completed') AS commands"
    )
    expect(rows).toEqual([{ plants: 1, facts: 1, commands: 1 }])
    expect(earlier.stats()).toEqual({ transactions: 1, reads: 2, writes: 0, uniqueConnections: 3 })
    // 裁决 2：新建目标完成含会话置 completed 写入。
    expect(later.stats()).toEqual({ transactions: 1, reads: 1, writes: 6, uniqueConnections: 2 })
  } finally {
    release()
    releaseWinner()
  }
})
