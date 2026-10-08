import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlIdentitySessionPolicyReader } from '../../src/identity/repository/mysql-identity-session-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'

const container = `qhz-identity-policy-${process.pid}`
const database = 'qhz_identity_policy'
const capturedAt = '2026-10-08T12:00:00Z'
const now = Date.parse(capturedAt)
// 独立正文按合同固定字段顺序序列化；不调用被测摘要函数反推 Expected。
const body = { contractVersion: 'identity-session-policy/v1', scopeCode: 'identity_sessions', sessionTtlHours: 24, refreshWindowHours: 0 }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
let source: ReturnType<typeof createMysql2ConnectionSource>

/** 只操作本测试创建的隔离容器，不读取项目凭证或云端数据库。 */
function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', input })
  if (result.status !== 0) { throw new Error(result.stderr || '隔离MySQL操作失败') }
  return result.stdout.trim()
}
/** 测试容器内执行 SQL。 */
function mysql(sql: string, db?: string): string {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot', ...(db ? [db] : [])], sql)
}
/** 参数化夹具：模拟已审校的 identity_sessions 发布，不代表云端已发布。 */
async function seed() {
  const connection = await source.getConnection()
  try {
    const result = await connection.execute(`INSERT INTO business_policy_releases
      (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256,
       policy_json, status, effective_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?)`,
    ['bpr_identity_mysql01', 'identity', 'identity_sessions', 'identity-session-policy/v1', 'identity-sessions/v1', sha, JSON.stringify(body), 'active', now - 1000, now - 1000, now, now])
    await connection.execute(`INSERT INTO active_business_policy_releases
      (domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256,
       activated_at_ms, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['identity', 'identity_sessions', result.insertId, 'identity-sessions/v1', sha, now, now, now])
  } finally { connection.release() }
}

/** unit_real_data：真实 MySQL 8.4 → 活动指针 → 发布正文 → 解析；不是 HTTP、CloudBase 或真实登录验收。 */
describe('unit_real_data 真实MySQL登录会话策略读回', () => {
  beforeAll(async () => {
    docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) { throw new Error('隔离MySQL尚未就绪') }
    mysql(`CREATE DATABASE ${database}`)
    const ddl = readFileSync(join(findProjectRoot(), 'docs/backend-v2/schema/007_configuration.sql'), 'utf8')
    for (const name of ['business_policy_releases', 'active_business_policy_releases']) {
      const table = ddl.match(new RegExp('CREATE TABLE `' + name + '`[^;]*;', 's'))?.[0]
      if (!table) { throw new Error(`缺少指定策略表 ${name}`) }
      mysql(table, database)
    }
    const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
    source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  }, 40_000)
  afterAll(() => { spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' }) })
  beforeEach(async () => {
    mysql('DELETE FROM active_business_policy_releases; DELETE FROM business_policy_releases;', database)
    await seed()
  })
  it('读回活动发布：24 小时、续期 0，摘要与配置快照一致', async () => {
    const snapshot = await createMysqlIdentitySessionPolicyReader(source).read(capturedAt)
    expect(snapshot).toMatchObject({ sessionTtlHours: 24, refreshWindowHours: 0, releaseVersion: 'identity-sessions/v1', contentSha256: sha })
    expect(snapshot?.configurationSnapshot.policyReleases[0]?.sha256).toBe(sha)
  })
  it('删除活动指针后拒签（null），不改读任意 active 行', async () => {
    mysql('DELETE FROM active_business_policy_releases;', database)
    expect(await createMysqlIdentitySessionPolicyReader(source).read(capturedAt)).toBeNull()
  })
  it('正文被篡改而摘要未更新时拒签', async () => {
    mysql("UPDATE business_policy_releases SET policy_json=JSON_SET(policy_json, '$.sessionTtlHours', 720);", database)
    expect(await createMysqlIdentitySessionPolicyReader(source).read(capturedAt)).toBeNull()
  })
})
