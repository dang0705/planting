import { resolveDynamicPestQuestionRelease } from '../../src/diagnosis/domain/dynamic-pest-release.js'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { findProjectRoot } from '../support/project-root.js'
import { calculateCanonicalJsonSha256 } from '../../src/foundation/json/canonical-json-sha256.js'

/** unit_real_data / L3：真实MySQL8.4、007策略表及020/021触发器；只用内容夹具，不操作生产。 */
const root = findProjectRoot(),
  container = `qhz-pest-release-guard-${process.pid}`
let db: Connection
function docker(args: string[]) {
  const r = spawnSync('docker', args, { encoding: 'utf8' })
  if (r.status !== 0) {
    throw new Error(r.stderr)
  }
  return r.stdout.trim()
}
async function migration(name: string) {
  const text = readFileSync(join(root, 'docs/backend-v2/schema', name), 'utf8')
  const body = text.split('DELIMITER $$')[1]!.split('DELIMITER ;')[0]!
  for (const sql of body
    .split('$$')
    .map(s => s.trim())
    .filter(Boolean)) {
    await db.query(sql)
  }
}
async function seed(
  ref: string,
  status = 'active',
  domain = 'diagnosis',
  policy = 'dynamic_pest_question_packages'
) {
  const raw = JSON.parse(
    readFileSync(join(root, 'cloudfunctions-v2/models/diagnosis/v1-reuse/questions.json'), 'utf8')
  )
  const body = {
    contractVersion: 'diagnosis-dynamic-pest-question-packages/v1',
    sourceRef: `v1-reuse#${ref}`,
    sourceSha256: '40385731fe0ed7d20c9331b1be6aee10c13ebb900350a4576c14edd0ea07107f',
    questions: raw.pestQuestions,
    tierQuestionLimits: { low: 3, medium: 2, high: 1, very_likely: 1, direct: 0 },
    evidenceGroupByKey: {}
  }
  await db.execute(
    'INSERT INTO business_policy_releases (release_ref,domain_code,policy_code,schema_version,release_version,content_sha256,policy_json,status,effective_at_ms,verified_at_ms,created_at_ms,updated_at_ms) VALUES (?,?,?,?,?,?,CAST(? AS JSON),?,1000,900,800,1000)',
    [
      ref,
      domain,
      policy,
      body.contractVersion,
      ref,
      calculateCanonicalJsonSha256(body),
      JSON.stringify(body),
      status
    ]
  )
}
/** 每个拒绝断言自行回滚，RED时未受保护写入不能污染后续用例。 */
async function expectGuard(sql: string) {
  await db.beginTransaction()
  try {
    await expect(db.query(sql)).rejects.toMatchObject({ sqlState: '45000', errno: 1644 })
  } finally {
    await db.rollback()
  }
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
  for (let i = 0; i < 100; i += 1) {
    try {
      db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await db.query('SELECT 1')
      ready = true
      break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(r => setTimeout(r, 250))
    }
  }
  if (!ready) {
    throw new Error('隔离MySQL未就绪')
  }
  await db.query('CREATE DATABASE qhz_pest_guard')
  await db.query('USE qhz_pest_guard')
  const ddl = readFileSync(join(root, 'docs/backend-v2/schema/007_configuration.sql'), 'utf8')
  for (const table of ['business_policy_releases', 'active_business_policy_releases']) {
    const start = ddl.indexOf('CREATE TABLE `' + table + '` (')
    if (start < 0) {
      throw new Error('策略表缺失')
    }
    await db.query(ddl.slice(start, ddl.indexOf(';', start) + 1))
  }
  await migration('020_fixed_question_release_immutability.sql')
  await seed('bpr_pest_active123')
  await seed('bpr_pest_verified123', 'verified')
  await seed('bpr_pest_draft123', 'draft')
  await seed('bpr_other_care123', 'verified', 'care', 'mvp_glass_transmission')
  await seed('bpr_fixed_guard123', 'verified', 'diagnosis', 'fixed_question_packages')
  await db.execute(
    "INSERT INTO active_business_policy_releases (domain_code,policy_code,release_internal_id,active_release_version,active_content_sha256,activated_at_ms,created_at_ms,updated_at_ms) SELECT domain_code,policy_code,id,release_version,content_sha256,1000,1000,1000 FROM business_policy_releases WHERE release_ref='bpr_pest_active123'"
  )
}, 40_000)
afterAll(async () => {
  await db?.end()
  spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
})
describe('动态虫害审核后发布的数据库保护', () => {
  test('新迁移只加两个触发器，既有行数和完整内容不变', async () => {
    const [before] = await db.query('SELECT * FROM business_policy_releases ORDER BY id')
    const [pointersBefore] = await db.query(
      'SELECT * FROM active_business_policy_releases ORDER BY id'
    )
    const path = join(root, 'docs/backend-v2/schema/021_dynamic_pest_release_immutability.sql')
    // RED探针只在测试中允许未保护表继续验证；运行迁移没有此回退分支。
    if (existsSync(path)) {
      await migration('021_dynamic_pest_release_immutability.sql')
    }
    expect((await db.query('SELECT * FROM business_policy_releases ORDER BY id'))[0]).toEqual(
      before
    )
    expect(
      (
        await db.query(
          "SELECT COUNT(*) AS n FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA=DATABASE() AND TRIGGER_NAME LIKE 'qhz_dynamic_pest_release_immutable_%'"
        )
      )[0]
    ).toEqual([{ n: 2 }])
    expect(
      (await db.query('SELECT * FROM active_business_policy_releases ORDER BY id'))[0]
    ).toEqual(pointersBefore)
    const [rows] = await db.query(
      "SELECT r.release_ref,r.domain_code,r.policy_code,r.schema_version,r.release_version,r.content_sha256,r.policy_json,r.status,r._openid AS release_openid,a._openid AS pointer_openid,CAST(r.effective_at_ms AS CHAR) AS effective_at_ms,CAST(r.expires_at_ms AS CHAR) AS expires_at_ms,CAST(r.verified_at_ms AS CHAR) AS verified_at_ms,a.active_release_version,a.active_content_sha256 FROM active_business_policy_releases a JOIN business_policy_releases r ON r.id=a.release_internal_id WHERE a.domain_code='diagnosis' AND a.policy_code='dynamic_pest_question_packages'"
    )
    expect(resolveDynamicPestQuestionRelease(rows as Record<string, unknown>[], 2500).status).toBe(
      'available'
    )
  })
  test.each([
    'id=id+10000',
    "_openid='platform-subject'",
    "release_ref='bpr_pest_changed123'",
    "release_ref='BPR_PEST_ACTIVE123'",
    "domain_code='care'",
    "policy_code='other'",
    "schema_version='changed/v2'",
    "release_version='changed'",
    "content_sha256=REPEAT('b',64)",
    "policy_json=JSON_SET(policy_json,'$.tierQuestionLimits.medium',3)",
    'effective_at_ms=2000',
    'expires_at_ms=9999',
    'verified_at_ms=999',
    'created_at_ms=9999'
  ])('真实SQL拒绝改写 %s', async change => {
    await expectGuard(
      `UPDATE business_policy_releases SET ${change} WHERE release_ref='bpr_pest_active123'`
    )
  })
  test('同时替换正文和摘要仍不能绕过已审核发布', async () => {
    await expectGuard(
      "UPDATE business_policy_releases SET policy_json=JSON_SET(policy_json,'$.tierQuestionLimits.medium',3),content_sha256=REPEAT('b',64) WHERE release_ref='bpr_pest_active123'"
    )
  })
  test('未被指针引用的verified行也不能删除或重写', async () => {
    await expectGuard(
      "DELETE FROM business_policy_releases WHERE release_ref='bpr_pest_verified123'"
    )
    await expectGuard(
      "UPDATE business_policy_releases SET policy_json=JSON_OBJECT() WHERE release_ref='bpr_pest_verified123'"
    )
  })
  test('退役/恢复正常，不能回草稿或降级成未激活审核', async () => {
    await db.query(
      "UPDATE business_policy_releases SET status='retired',updated_at_ms=3000 WHERE release_ref='bpr_pest_active123'"
    )
    await expectGuard(
      "UPDATE business_policy_releases SET status='draft' WHERE release_ref='bpr_pest_active123'"
    )
    await expectGuard(
      "UPDATE business_policy_releases SET status='verified' WHERE release_ref='bpr_pest_active123'"
    )
    await expectGuard("DELETE FROM business_policy_releases WHERE release_ref='bpr_pest_active123'")
    await db.query(
      "UPDATE business_policy_releases SET status='active',updated_at_ms=4000 WHERE release_ref='bpr_pest_active123'"
    )
  })
  test('草稿可编辑删除，其他域保持原规则，fixed保护仍有效', async () => {
    await db.query(
      "UPDATE business_policy_releases SET policy_json=JSON_OBJECT(),content_sha256=REPEAT('c',64) WHERE release_ref='bpr_pest_draft123'"
    )
    await db.query("DELETE FROM business_policy_releases WHERE release_ref='bpr_pest_draft123'")
    await db.query(
      "UPDATE business_policy_releases SET policy_json=JSON_OBJECT() WHERE release_ref='bpr_other_care123'"
    )
    await expectGuard(
      "UPDATE business_policy_releases SET domain_code='diagnosis',policy_code='dynamic_pest_question_packages' WHERE release_ref='bpr_other_care123'"
    )
    await expectGuard(
      "UPDATE business_policy_releases SET policy_json=JSON_OBJECT() WHERE release_ref='bpr_fixed_guard123'"
    )
  })
})
