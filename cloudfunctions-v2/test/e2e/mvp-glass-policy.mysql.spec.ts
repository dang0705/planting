import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlMvpGlassPolicyReader } from '../../src/care/repository/mysql-mvp-glass-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'

const container = `qhz-mvp-glass-${process.pid}`
const database = 'qhz_mvp_glass'
const capturedAt = '2026-10-04T12:00:00Z'
const now = Date.parse(capturedAt)
// 独立制品正文已按键排序；不是调用被测摘要函数反推Expected。
const body = { approximation: 'clear_glass_broadband_proxy', contractVersion: 'mvp-glass-policy/v1', doubleTransmission: 0.70, scopeCode: 'care_mvp_glass', singleTransmission: 0.83, sourceRef: 'mysql-test-clear-glass' }
const sha = createHash('sha256').update(JSON.stringify(body)).digest('hex')
let source: ReturnType<typeof createMysql2ConnectionSource>

/** 只操作本测试创建的隔离容器，不读取项目凭证或生产数据库。 */
function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', input })
  if (result.status !== 0) { throw new Error(result.stderr || '隔离MySQL操作失败') }
  return result.stdout.trim()
}
/** 测试容器内的建库及特定两表初始化。 */
function mysql(sql: string, db?: string): string {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot', ...(db ? [db] : [])], sql)
}
/** 参数化夹具写入；测试模拟审校发布，不代表真实参数已获得运营批准。 */
async function seed() {
  const connection = await source.getConnection()
  try {
    const result = await connection.execute(`INSERT INTO business_policy_releases
      (release_ref, domain_code, policy_code, schema_version, release_version, content_sha256,
       policy_json, status, effective_at_ms, verified_at_ms, created_at_ms, updated_at_ms)
      VALUES (?, ?, ?, ?, ?, ?, CAST(? AS JSON), ?, ?, ?, ?, ?)`,
    ['bpr_glass_mysql01', 'care', 'mvp_glass', 'mvp-glass-policy/v1', 'experiment-1', sha, JSON.stringify(body), 'active', now, now, now, now])
    await connection.execute(`INSERT INTO active_business_policy_releases
      (domain_code, policy_code, release_internal_id, active_release_version, active_content_sha256,
       activated_at_ms, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ['care', 'mvp_glass', result.insertId, 'experiment-1', sha, now, now, now])
  } finally { connection.release() }
}

/** unit_real_data：真实MySQL8.4→活动指针→发布正文→解析；不是HTTP、CloudBase或正式发布验收。 */
describe('unit_real_data 真实MySQL玻璃策略活动指针读回', () => {
  beforeAll(async () => {
    docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      // 初始化临时实例只有socket；等待TCP避免误判临时服务为正式就绪。
      const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) { throw new Error('隔离MySQL尚未就绪') }
    mysql(`CREATE DATABASE ${database}`)
    const ddl = readFileSync(join(findProjectRoot(), 'docs/backend-v2/schema/007_configuration.sql'), 'utf8')
    // 经具体读取许可仅提取两张策略表，不加载整个迁移或其他领域。
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
  it('读回活动发布，数据库与快照保持同一个规范正文摘要', async () => {
    const result = await createMysqlMvpGlassPolicyReader(source).read(capturedAt)
    expect(result.status).toBe('available')
    if (result.status !== 'available') { throw new Error('应读回有效发布') }
    expect(result.releaseRef).toBe('bpr_glass_mysql01')
    expect(result.snapshot.contentSha256).toBe(sha)
    expect(result.snapshot.doubleTransmission).toBe(0.70)
    expect(result.snapshot.configurationSnapshot.policyReleases[0]?.sha256).toBe(sha)
  })
  it('删除指针后明确不可用，不改读任意active行', async () => {
    mysql('DELETE FROM active_business_policy_releases;', database)
    expect((await createMysqlMvpGlassPolicyReader(source).read(capturedAt)).status).toBe('unavailable')
  })
  it('指针版本不匹配拒绝，不能以发布行active状态代替指针核验', async () => {
    mysql("UPDATE active_business_policy_releases SET active_release_version='other';", database)
    expect((await createMysqlMvpGlassPolicyReader(source).read(capturedAt)).status).toBe('invalid')
  })
  it('未经验证的发布拒绝，时间过期也不能采用', async () => {
    mysql('UPDATE business_policy_releases SET verified_at_ms=NULL;', database)
    expect((await createMysqlMvpGlassPolicyReader(source).read(capturedAt)).status).toBe('invalid')
    mysql(`UPDATE business_policy_releases SET verified_at_ms=${now}, effective_at_ms=${now - 1}, expires_at_ms=${now};`, database)
    expect((await createMysqlMvpGlassPolicyReader(source).read(capturedAt)).status).toBe('unavailable')
  })
  it('正文被篡改但摘要未更新时拒绝', async () => {
    mysql("UPDATE business_policy_releases SET policy_json=JSON_SET(policy_json, '$.singleTransmission', 0.99);", database)
    expect((await createMysqlMvpGlassPolicyReader(source).read(capturedAt)).status).toBe('invalid')
  })
})
