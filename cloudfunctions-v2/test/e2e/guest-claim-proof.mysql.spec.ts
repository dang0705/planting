import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import {
  createMysql2ConnectionSource,
  type Mysql2QueryConnection
} from '../../src/foundation/database/mysql2-connection-source.js'
import {
  createMysqlTransactionDriver,
  type MysqlTransactionContext
} from '../../src/foundation/database/mysql-transaction-driver.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlGuestClaimProofRepository } from '../../src/user-plant/repository/mysql-guest-claim-proof-repository.js'

/** L3/unit_real_data：独立Expected来自guest-claim-proof-contract.md及本轮已冻结列定义。
 * 真实MySQL8.4→外部事务→Repository→证明领域校验；匿名验真与发布宽限期是受控输入夹具。
 * 不覆盖HTTP、CloudBase匿名验真、会话签发、轮换写入或完整认领；只建隔离测试表、不读迁移文档。 */
const container = `qhz-guest-claim-proof-${process.pid}`
const currentProof = Buffer.alloc(32, 7).toString('base64url')
const previousProof = Buffer.alloc(32, 8).toString('base64url')
const digest = (proof: string) => createHash('sha256').update(proof).digest('hex')
const sessionRef = 'gst_guestproof_case01'
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
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
    throw new Error('隔离游客证明MySQL未就绪')
  }
  await db.query(
    'CREATE DATABASE guest_claim_proof CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
  )
  await db.query('USE guest_claim_proof')
  await db.query(`CREATE TABLE guest_sessions (
    id BIGINT UNSIGNED PRIMARY KEY, _openid VARCHAR(64) NOT NULL DEFAULT '',
    guest_session_ref VARCHAR(64) NOT NULL UNIQUE,
    anonymous_subject_hash CHAR(64) NOT NULL, possession_proof_hash CHAR(64) NOT NULL,
    possession_proof_version INT UNSIGNED NOT NULL,
    previous_possession_proof_hash CHAR(64) NULL, previous_proof_valid_until_ms BIGINT NULL,
    status VARCHAR(24) NOT NULL, issued_at_ms BIGINT NOT NULL, expires_at_ms BIGINT NOT NULL,
    failed_retention_until_ms BIGINT NULL, created_at_ms BIGINT NOT NULL, updated_at_ms BIGINT NOT NULL
  ) ENGINE=InnoDB`)
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'guest_claim_proof'
  })
}, 30000)
afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})
beforeEach(async () => {
  await db.query('DELETE FROM guest_sessions')
  await db.execute(
    "INSERT INTO guest_sessions VALUES(1,'',?,?,?,2,?,4000,'active',1000,5000,NULL,1000,2000)",
    [sessionRef, 'a'.repeat(64), digest(currentProof), digest(previousProof)]
  )
})
function command() {
  return {
    guestSessionRef: sessionRef,
    anonymousSubjectHash: 'a'.repeat(64),
    possessionProof: currentProof,
    nowMs: 3000,
    proofRotationGraceSeconds: 30 as number | null
  }
}
async function snapshot() {
  const [rows] = await db.query('SELECT * FROM guest_sessions')
  return rows
}
async function verify(value = command()) {
  const queries: { sql: string; parameters: unknown }[] = []
  const guarded: typeof source = {
    getConnection: async () => {
      const connection = await source.getConnection()
      return {
        ...connection,
        query: async (sql, parameters) => {
          queries.push({ sql, parameters })
          expect(sql).toMatch(/^\s*SELECT\b/iu)
          expect(sql).toMatch(/\bFOR\s+UPDATE\b/iu)
          expect(JSON.stringify({ sql, parameters })).not.toContain(value.possessionProof)
          return connection.query(sql, parameters)
        },
        execute: async () => {
          throw new Error('证明读取禁止写SQL')
        }
      }
    }
  }
  const before = await snapshot()
  const result = await runDatabaseTransaction(
    createMysqlTransactionDriver(guarded, () => undefined),
    tx => createMysqlGuestClaimProofRepository().lockAndVerify(tx, value)
  )
  expect(queries).toHaveLength(1)
  expect(await snapshot()).toEqual(before)
  return result
}
test.each(['active', 'completed'])(
  '当前证明%s会话成功，仅返回版本且一条锁定SQL零写',
  async status => {
    await db.execute('UPDATE guest_sessions SET status=? WHERE id=1', [status])
    expect(await verify()).toEqual({ status: 'verified', proofVersion: 2 })
  }
)
test('上一版宽限截止前返回原版本，截止边界和缺策略拒绝', async () => {
  expect(await verify({ ...command(), possessionProof: previousProof })).toEqual({
    status: 'verified',
    proofVersion: 1
  })
  expect(await verify({ ...command(), possessionProof: previousProof, nowMs: 4000 })).toEqual({
    status: 'not_claimable'
  })
  expect(
    await verify({ ...command(), possessionProof: previousProof, proofRotationGraceSeconds: null })
  ).toEqual({ status: 'not_claimable' })
  expect(
    await verify({ ...command(), possessionProof: previousProof, proofRotationGraceSeconds: 0 })
  ).toEqual({ status: 'not_claimable' })
  expect(await verify({ ...command(), proofRotationGraceSeconds: null })).toEqual({
    status: 'verified',
    proofVersion: 2
  })
})
test('签发时刻可用，到期时刻仅真实持有者获得过期结果', async () => {
  expect(await verify({ ...command(), nowMs: 1000 })).toEqual({
    status: 'verified',
    proofVersion: 2
  })
  expect(await verify({ ...command(), nowMs: 5000 })).toEqual({ status: 'expired' })
  expect(await verify({ ...command(), nowMs: 5000, anonymousSubjectHash: 'b'.repeat(64) })).toEqual(
    { status: 'not_claimable' }
  )
  expect(await verify({ ...command(), nowMs: 5000, possessionProof: previousProof })).toEqual({
    status: 'not_claimable'
  })
})
test('错误匿名主体和错误/非法持有证明统一拒绝且不泄露存在性', async () => {
  expect(await verify({ ...command(), anonymousSubjectHash: 'b'.repeat(64) })).toEqual({
    status: 'not_claimable'
  })
  expect(
    await verify({ ...command(), possessionProof: Buffer.alloc(32, 9).toString('base64url') })
  ).toEqual({ status: 'not_claimable' })
  expect(await verify({ ...command(), possessionProof: 'not-canonical!' })).toEqual({
    status: 'not_claimable'
  })
})
test('非空技术字段、不存在和仅大小写不同引用均不可认领', async () => {
  expect(await verify({ ...command(), guestSessionRef: 'gst_guestproof_absent' })).toEqual({
    status: 'not_claimable'
  })
  expect(
    await verify({ ...command(), guestSessionRef: 'gst_' + sessionRef.slice(4).toUpperCase() })
  ).toEqual({
    status: 'not_claimable'
  })
  await db.query("UPDATE guest_sessions SET _openid='technical-subject' WHERE id=1")
  expect(await verify()).toEqual({ status: 'not_claimable' })
})
test('failed统一拒绝，expired本人返回过期但错误证明仍不可认领', async () => {
  await db.query("UPDATE guest_sessions SET status='failed' WHERE id=1")
  expect(await verify()).toEqual({ status: 'not_claimable' })
  await db.query("UPDATE guest_sessions SET status='expired' WHERE id=1")
  expect(await verify()).toEqual({ status: 'expired' })
  expect(await verify({ ...command(), anonymousSubjectHash: 'b'.repeat(64) })).toEqual({
    status: 'not_claimable'
  })
})
test('损坏的上一版成对数据返回unavailable且不猜测修复', async () => {
  await db.query('UPDATE guest_sessions SET previous_proof_valid_until_ms=NULL WHERE id=1')
  expect(await verify()).toEqual({ status: 'unavailable' })
})
test('FOR UPDATE持锁直到调用方提交，第二事务被真实MySQL阻塞且之后读回', async () => {
  const first = await source.getConnection(),
    second = await source.getConnection()
  const tx = (
    connection: Mysql2QueryConnection
  ): MysqlTransactionContext<Mysql2QueryConnection> => ({ transactionContext: true, connection })
  let secondDone = false
  try {
    await first.beginTransaction()
    await second.beginTransaction()
    expect(
      await createMysqlGuestClaimProofRepository().lockAndVerify(tx(first), command())
    ).toEqual({ status: 'verified', proofVersion: 2 })
    let announce!: () => void
    const issued = new Promise<void>(resolve => {
      announce = resolve
    })
    const guarded: Mysql2QueryConnection = {
      ...second,
      query: (sql, args) => {
        announce()
        return second.query(sql, args)
      }
    }
    const pending = createMysqlGuestClaimProofRepository()
      .lockAndVerify(tx(guarded), command())
      .then(result => {
        secondDone = true
        return result
      })
    await issued
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(secondDone).toBe(false)
    await first.commit()
    expect(await pending).toEqual({ status: 'verified', proofVersion: 2 })
    await second.commit()
  } finally {
    await first.rollback().catch(() => undefined)
    await second.rollback().catch(() => undefined)
    await first.release()
    await second.release()
  }
})
