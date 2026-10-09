import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, beforeEach, expect, test } from 'vitest'
import { guestClaimFixtureDdl } from './guest-claim-registration-fixture.js'
import type { UserPrincipalDto, UserRef } from '../../src/contracts/types.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlGuestClaimedOwnershipReader } from '../../src/user-plant/repository/mysql-guest-claimed-ownership-reader.js'

/** L3/unit_real_data：独立Expected来自guest-claimed-ownership-contract.md。
 * 真实MySQL8.4及已准入游客四表，成功三表链明确seed；用户/植物仍缩减归属外键夹具。
 * 身份Principal替身；不验证签名、Query API、类别或公开HTTP，不读取docs。
 * 单连接SELECT零锁/事务/写及前后快照核验，不复制认领完成或收据重放规则。 */
const container = `qhz-guest-ownership-${process.pid}`
let db: Connection, source: ReturnType<typeof createMysql2ConnectionSource>
const principal: UserPrincipalDto = {
  principalType: 'user',
  user_id: 'usr_ownership_owner01' as UserRef,
  sessionVersion: 1,
  authenticatedVia: 'wechat',
  issuedAt: '1970-01-01T00:00:01Z',
  expiresAt: '1970-01-01T00:00:09Z'
}
function input() {
  return { principal, guestPlantCaseRef: 'gpc_ownership_case01', nowMs: 4000 }
}
const owned = {
  status: 'owned',
  claimRef: 'gcl_ownership_command01',
  userPlantRef: 'upl_ownership_target01',
  guestPlantCaseRef: 'gpc_ownership_case01'
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
    throw new Error('隔离派生归属MySQL未就绪')
  }
  await db.query('CREATE DATABASE guest_ownership CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await db.query('USE guest_ownership')
  for (const statement of guestClaimFixtureDdl.split(';').filter(value => value.trim())) {
    await db.query(statement)
  }
  source = createMysql2ConnectionSource({
    host: '127.0.0.1',
    port,
    user: 'root',
    password: '',
    database: 'guest_ownership'
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
    "INSERT INTO users VALUES(1,'usr_ownership_owner01','active',''),(2,'usr_ownership_owner02','active','')"
  )
  await db.query(
    "INSERT INTO user_plants VALUES(1,1,'upl_ownership_target01','active',''),(2,2,'upl_ownership_other01','active','')"
  )
  await db.query(
    "INSERT INTO guest_sessions(id,identity_source,guest_session_ref,anonymous_subject_hash,possession_proof_hash,possession_proof_version,status,issued_at_ms,expires_at_ms,created_at_ms,updated_at_ms) VALUES(1,'server_issued_guest_token','gst_ownership_session01',REPEAT('a',64),REPEAT('c',64),2,'completed',1000,5000,1000,3000)"
  )
  await db.query(
    "INSERT INTO guest_plant_cases(id,guest_plant_case_ref,guest_session_internal_id,status,completed_at_ms,expires_at_ms,claimed_user_internal_id,claimed_user_plant_internal_id,version,created_at_ms,updated_at_ms) VALUES(1,'gpc_ownership_case01',1,'claimed',2000,5000,1,1,8,1000,3000)"
  )
  const requestHash = createHash('sha256')
    .update(
      '{"guestSessionRef":"gst_ownership_session01","guestPlantCaseRef":"gpc_ownership_case01","target":{"type":"existing_user_plant","user_plant_id":"upl_ownership_target01"}}'
    )
    .digest('hex')
  await db.execute(
    "INSERT INTO guest_claim_commands(id,claim_ref,guest_plant_case_internal_id,user_internal_id,target_type,requested_user_plant_internal_id,target_user_plant_internal_id,idempotency_key,request_hash,proof_version,status,attempt_count,created_at_ms,updated_at_ms) VALUES(1,'gcl_ownership_command01',1,1,'existing_user_plant',1,1,?,?,2,'completed',1,2000,3000)",
    ['b'.repeat(64), requestHash]
  )
  await db.query(
    'INSERT INTO guest_case_claims(id,guest_plant_case_internal_id,claim_command_internal_id,user_internal_id,user_plant_internal_id,claimed_at_ms,created_at_ms) VALUES(1,1,1,1,1,3000,3000)'
  )
})
async function snapshot() {
  const rows: unknown[] = []
  for (const table of [
    'users',
    'guest_sessions',
    'guest_plant_cases',
    'guest_claim_commands',
    'guest_case_claims',
    'user_plants'
  ]) {
    const [values] = await db.query(`SELECT * FROM ${table} ORDER BY id`)
    rows.push(values)
  }
  return rows
}
async function read(value = input()) {
  let connections = 0,
    queries = 0
  const guarded: typeof source = {
    getConnection: async () => {
      connections++
      const connection = await source.getConnection()
      return {
        ...connection,
        query: (sql, args) => {
          queries++
          expect(sql).toMatch(/^\s*SELECT\b/iu)
          expect(sql).not.toMatch(/\bFOR\s+(UPDATE|SHARE)\b/iu)
          return connection.query(sql, args)
        },
        execute: async () => {
          throw new Error('派生归属禁止写SQL')
        },
        beginTransaction: async () => {
          throw new Error('派生归属禁止事务')
        },
        commit: async () => {
          throw new Error('派生归属禁止提交')
        }
      }
    }
  }
  const before = await snapshot(),
    result = await createMysqlGuestClaimedOwnershipReader(guarded).readOwnership(value)
  expect({ connections, queries }).toEqual({ connections: 1, queries: 1 })
  expect(await snapshot()).toEqual(before)
  return result
}
test('本人完整成功链仅返回冻结四字段，单SELECT零锁/事务/写', async () => {
  expect(await read()).toEqual(owned)
})
test('跨用户及不存在/合法命名空间大小写不同案例统一not_found', async () => {
  expect(
    await read({
      ...input(),
      principal: { ...principal, user_id: 'usr_ownership_owner02' as UserRef }
    })
  ).toEqual({ status: 'not_found' })
  expect(await read({ ...input(), guestPlantCaseRef: 'gpc_ownership_absent01' })).toEqual({
    status: 'not_found'
  })
  expect(await read({ ...input(), guestPlantCaseRef: 'gpc_OWNERSHIP_CASE01' })).toEqual({
    status: 'not_found'
  })
})
test('数据库拒绝跨用户目标污染；外键拒绝不是Reader不一致行验收', async () => {
  const before = await snapshot()
  await expect(
    db.query('UPDATE guest_case_claims SET user_plant_internal_id=2 WHERE id=1')
  ).rejects.toThrow()
  await expect(
    db.query('UPDATE guest_plant_cases SET claimed_user_plant_internal_id=2 WHERE id=1')
  ).rejects.toThrow()
  expect(await snapshot()).toEqual(before)
  expect(await read()).toEqual(owned)
})
test('停用用户不可见，案例/会话后来到期不撤销本人既有归属，归档仍可见', async () => {
  await db.query("UPDATE guest_sessions SET status='expired' WHERE id=1")
  await db.query("UPDATE user_plants SET lifecycle_status='archived' WHERE id=1")
  expect(await read({ ...input(), nowMs: 6000 })).toEqual(owned)
  await db.query("UPDATE users SET status='disabled' WHERE id=1")
  expect(await read()).toEqual({ status: 'not_found' })
})
test.each(['deleting', 'deleted'])('目标%s统一不可见', async status => {
  await db.execute('UPDATE user_plants SET lifecycle_status=? WHERE id=1', [status])
  expect(await read()).toEqual({ status: 'not_found' })
})
test.each(['requested', 'processing', 'failed', 'no_fact'] as const)(
  '不完整成功链%s不授予当前归属',
  async status => {
    await db.query('DELETE FROM guest_case_claims')
    if (status === 'requested') {
      await db.query(
        "UPDATE guest_claim_commands SET status='requested',target_user_plant_internal_id=NULL,attempt_count=0"
      )
    }
    if (status === 'processing') {
      await db.query(
        "UPDATE guest_claim_commands SET status='processing',target_user_plant_internal_id=NULL,processing_lease_owner_hash=REPEAT('d',64),processing_lease_expires_at_ms=8000"
      )
    }
    if (status === 'failed') {
      await db.query(
        "UPDATE guest_claim_commands SET status='failed',target_user_plant_internal_id=NULL,failure_code='CONTROLLED_FAILURE'"
      )
    }
    expect(await read()).toEqual({ status: 'not_found' })
  }
)
test.each([
  'users',
  'guest_sessions',
  'guest_plant_cases',
  'guest_claim_commands',
  'guest_case_claims',
  'user_plants'
] as const)('技术字段污染%s不能作为业务归属', async table => {
  await db.query(`UPDATE ${table} SET _openid='technical-subject' WHERE id=1`)
  expect(await read()).toEqual({ status: 'not_found' })
})
test('损坏公开引用或未来原事实时间不可用，读取不会补写修复', async () => {
  await db.query("UPDATE guest_claim_commands SET claim_ref='invalid' WHERE id=1")
  expect(await read()).toEqual({ status: 'unavailable' })
  await db.query("UPDATE guest_claim_commands SET claim_ref='gcl_ownership_command01' WHERE id=1")
  await db.query('UPDATE guest_case_claims SET claimed_at_ms=4001 WHERE id=1')
  expect(await read()).toEqual({ status: 'unavailable' })
})
test('建连故障返回unavailable，不开放其他写入或重试连接', async () => {
  let attempts = 0
  const failing: typeof source = {
    getConnection: async () => {
      attempts++
      throw new Error('受控建连故障')
    }
  }
  const before = await snapshot()
  expect(await createMysqlGuestClaimedOwnershipReader(failing).readOwnership(input())).toEqual({
    status: 'unavailable'
  })
  expect(attempts).toBe(1)
  expect(await snapshot()).toEqual(before)
})
