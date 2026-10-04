import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlSourceClaimEvidenceReader } from '../../src/diagnosis/repository/mysql-source-claim-evidence-reader.js'

/** 独立隔离容器，不读取项目凭证，不访问CloudBase或生产数据。 */
const container = `qhz-diag-source-${process.pid}`
const database = 'qhz_diag_source_evidence'
let source: ReturnType<typeof createMysql2ConnectionSource>
const ref = { sourceCode: 'reviewed-source', claimCode: 'multicausal', revisionNo: 0 }

/** 隔离测试管理动作失败即失败，不用成功空结果掩盖错误。 */
function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', input })
  if (result.status !== 0) { throw new Error(result.stderr || '隔离数据库操作失败') }
  return result.stdout.trim()
}
/** 只用于本测试拥有的空库建表与夹具，业务查询经实际Repository。 */
function mysql(sql: string, withDatabase = true): string {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot', ...(withDatabase ? [database] : [])], sql)
}

/** unit_real_data / L3：真实MySQL8.4、009的两张表、mysql2参数化读取，不含CMS、HTTP或许可准入。 */
describe('诊断精确来源证据真实MySQL读回', () => {
  beforeAll(async () => {
    docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
    let ready = false
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) { throw new Error('隔离MySQL未接受TCP查询') }
    mysql(`CREATE DATABASE ${database}`, false)
    // 读取许可限定两张来源表；不加载整个009迁移或其他诊断表。
    const ddl = readFileSync(join(findProjectRoot(), 'docs/backend-v2/schema/009_diagnosis_knowledge.sql'), 'utf8')
    for (const name of ['diagnosis_sources', 'diagnosis_source_claim_revisions']) {
      const start = ddl.indexOf('CREATE TABLE `' + name + '` (')
      const end = ddl.indexOf(';', start)
      if (start < 0 || end < 0) { throw new Error(`缺少指定来源表：${name}`) }
      mysql(ddl.slice(start, end + 1))
    }
    const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
    source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  }, 40_000)
  afterAll(() => { spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' }) })
  beforeEach(async () => {
    mysql('DELETE FROM diagnosis_source_claim_revisions; DELETE FROM diagnosis_sources;')
    const connection = await source.getConnection()
    try {
      const inserted = await connection.execute(`INSERT INTO diagnosis_sources
        (source_code,organization_zh,title_zh,locator_url,source_type,license_scope,source_state,verified_at_ms,created_at_ms)
        VALUES (?,?,?,?,?,?,?,?,?)`, ['reviewed-source','测试机构','测试资料','https://example.org/guide','institution','requires_review','verified',1000,900])
      for (const revisionNo of [0, 1]) {
        await connection.execute(`INSERT INTO diagnosis_source_claim_revisions
          (source_internal_id,claim_code,revision_no,source_locator,claim_zh,applicability_json,claim_role,evidence_sha256,verified_at_ms,created_at_ms)
          VALUES (?,?,?,?,?,CAST(? AS JSON),?,?,?,?)`, [inserted.insertId,'multicausal',revisionNo,'第二节',`测试修订${revisionNo}`,JSON.stringify({ taxa:['fixture-taxon'],scenarios:['container'] }),'support','a'.repeat(64),1100,1000])
      }
    } finally { connection.release() }
  })

  test('精确修订0及全部审核证据从真实mysql2读回', async () => {
    const [result] = await createMysqlSourceClaimEvidenceReader(source).read([ref])
    expect(result?.status).toBe('found')
    if (result?.status !== 'found') { throw new Error('应读回精确来源') }
    expect(result.reference).toEqual(ref)
    expect(result.evidence.claimZh).toBe('测试修订0')
    expect(result.evidence.licenseScope).toBe('requires_review')
    expect(result.evidence.applicability).toEqual({ taxa:['fixture-taxon'],scenarios:['container'] })
    expect(result.evidence.claimVerifiedAtMs).toBe(1100)
    expect(result.evidence.evidenceSha256).toBe('a'.repeat(64))
  })
  test('重复引用去重但不同修订分别读回，缺失修订不补最新', async () => {
    const results = await createMysqlSourceClaimEvidenceReader(source).read([ref,ref,{...ref,revisionNo:1},{...ref,revisionNo:2}])
    expect(results.map(x=>[x.reference.revisionNo,x.status])).toEqual([[0,'found'],[1,'found'],[2,'not_found']])
    const second=results[1]
    if (second?.status !== 'found') { throw new Error('应读回修订1') }
    expect(second.evidence.claimZh).toBe('测试修订1')
  })
  test('撤回来源保留原证据状态，不变成准入记录', async () => {
    mysql("UPDATE diagnosis_sources SET source_state='withdrawn',verified_at_ms=NULL;")
    const [result]=await createMysqlSourceClaimEvidenceReader(source).read([ref])
    if (result?.status !== 'found') { throw new Error('应读回撤回状态') }
    expect(result.evidence.sourceState).toBe('withdrawn')
    expect(result.evidence.sourceVerifiedAtMs).toBeNull()
  })
  test('数据库默认不区分大小写不改变业务精确引用', async () => {
    expect(await createMysqlSourceClaimEvidenceReader(source).read([{...ref,sourceCode:'REVIEWED-SOURCE'}])).toEqual([{reference:{...ref,sourceCode:'REVIEWED-SOURCE'},status:'not_found'}])
  })
  test('SQL引号与通配符不能扩展读取范围', async () => {
    const injected={...ref,claimCode:"%' OR 1=1 --"}
    expect(await createMysqlSourceClaimEvidenceReader(source).read([injected])).toEqual([{reference:injected,status:'not_found'}])
  })
  test('数据库中的损坏摘要也不能以字段存在当正常证据', async () => {
    mysql("UPDATE diagnosis_source_claim_revisions SET evidence_sha256='broken' WHERE revision_no=0;")
    expect(await createMysqlSourceClaimEvidenceReader(source).read([ref])).toEqual([{reference:ref,status:'invalid_record'}])
  })
})
