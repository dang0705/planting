import { spawnSync } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

import { createExpireCarePlansJob, type CarePlanExpiryLogEvent } from '../../src/care/application/expire-care-plans.js'
import { createLongTermCareCommands } from '../../src/care/application/long-term-care-commands.js'
import { expireDueCarePlans } from '../../src/care/repository/mysql-care-plan-expiry-repository.js'
import { createMysqlTransactionDriver, type MysqlTransactionContext } from '../../src/foundation/database/mysql-transaction-driver.js'
import { createMysql2ConnectionSource, toSqlParameters, withReadConnection, type Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'
import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository, createMysqlHttpIdempotencyRepository, type HttpIdempotencySqlRow } from '../../src/foundation/idempotency/mysql-http-idempotency-repository.js'
import { CARE_LONG_TERM_RULES_POLICY } from '../../src/configuration/business-policies/index.js'
import { createMysqlTypedPolicyReader } from '../../src/foundation/policy/mysql-typed-policy-reader.js'
import { careLongTermRulesV1 } from '../support/business-policy-fixtures.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4（tmpfs，本机 127.0.0.1）+ schema manifest 全量 DDL（含 028 扫描索引）。
 * 真实经过：expireDueCarePlans 条件更新 + Foundation MySQL 事务驱动 + 扫描用例；completePlan 用例 + 共享幂等 Repository + 计划/事实 Repository。
 * Expected：models/care/long-term-care-contract.md §12（用户 2026-10-09 裁决定时写入过期；主代理配置裁决 72h、每批 500）。
 * 替换边界：无 HTTP 层（路由透传已由 complete-expired-care-plan.spec.ts 覆盖）；时钟为真实 Date.now()，测试数据按相对时刻构造。
 * 未覆盖：CloudBase MySQL、定时触发器、函数上下文。不连接云端；本机无 Docker 时整组跳过。
 */
const dockerReady = spawnSync('docker', ['info'], { encoding: 'utf8' }).status === 0
const container = `qhz-plan-expiry-${process.pid}`
const database = 'qhz_plan_expiry'
const hour = 3_600_000
const day = 24 * hour
const root = findProjectRoot()
const calendar = { title: '检查小绿盆土', startAt: '2026-10-05T04:00:00.000Z', endAt: '2026-10-05T04:30:00.000Z', notes: '用手指插入土中 3～5 厘米检查干湿，再决定是否浇水。' }
const sha = (value: string) => createHash('sha256').update(value, 'utf8').digest('hex')

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
const rows = (text: string) => sql(text).split('\n').filter(Boolean).map(line => line.split('\t'))

let job: () => Promise<{ outcome: string; expiredCount: number; batchCount: number }>
let complete: (planRef: string, request: Record<string, unknown>) => Promise<{ status: number; body: Record<string, any> }>
let sequence = 0

/** 插入一条已确认建议 + 计划（id 相同，便于精确核对）。 */
function insertPlan(id: number, status: string, scheduledAtMs: number) {
  const created = Date.now() - 10 * day
  sql(`INSERT INTO care_proposals (id, proposal_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version, result_json, status, valid_until_ms, idempotency_key, created_at_ms, updated_at_ms)
      VALUES (${id}, 'cpr_mx_${String(id).padStart(8, '0')}', 1, 1, 'watering', 'care-capability/v1', 'watering-details/v1', CAST('{}' AS JSON), 'confirmed', NULL, '${sha(`k${id}`)}', ${created}, ${created});
    INSERT INTO care_plans (id, plan_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, plan_type, scheduled_at_ms, status, plan_payload_json, version, created_at_ms, updated_at_ms)
      VALUES (${id}, 'cpl_mx_${String(id).padStart(8, '0')}', 1, 1, ${id}, 'check_soil', ${scheduledAtMs}, '${status}', CAST('${JSON.stringify({ calendar, completedFactRef: null })}' AS JSON), 1, ${created}, ${created});`)
}
const planRow = (id: number) => rows(`SELECT status, version FROM care_plans WHERE id = ${id};`)[0]
const planRef = (id: number) => `cpl_mx_${String(id).padStart(8, '0')}`

describe.skipIf(!dockerReady)('计划过期：真实 MySQL 事务（§12）', () => {
  beforeAll(async () => {
    docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
    for (let attempt = 0; attempt < 160; attempt += 1) {
      const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') { break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    const schemaDirectory = path.join(root, 'docs/backend-v2/schema')
    const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
    sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
    for (const entry of manifest.files) { sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8')) }
    const created = Date.now() - 30 * day
    sql(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES (1, 'usr_mx_owner_000001', 'active', 1, ${created}, ${created});
      INSERT INTO user_plants (id, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, version, created_at_ms, updated_at_ms)
      VALUES (1, 'upl_mx_active_00001', 1, 'active', 'unidentified', 1, ${created}, ${created});`)

    const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
    const source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
    const driver = createMysqlTransactionDriver(source, () => undefined)
    const logs: CarePlanExpiryLogEvent[] = []
    // 用户 2026-10-10 第三轮裁定：72 小时来自策略发布；本机库执行 v1 种子 SQL 后经真实类型化读取器读取。
    sql(fs.readFileSync(path.join(root, 'docs/backend-v2/schema/seeds/business_policy_releases.2026-10-10.sql'), 'utf8'))
    const longTermRulesReader = createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY)
    const run = createExpireCarePlansJob({ now: () => Date.now(), log: event => { logs.push(event) }, runBudgetFraction: 0.5,
      readLongTermRules: async () => (await longTermRulesReader.read(Date.now()))?.rules ?? null,
      runBatch: input => runDatabaseTransaction(driver, transaction => expireDueCarePlans(transaction, input)) })
    job = () => run({ functionTimeoutMs: 60_000 })
    const idempotencyRepository = createMysqlHttpIdempotencyRepository<MysqlTransactionContext<Mysql2QueryConnection>>({
      executeQuery: async (transaction, text, parameters) => (await transaction.connection.query(text, toSqlParameters(parameters))) as unknown as readonly HttpIdempotencySqlRow[],
      executeWrite: (transaction, text, parameters) => transaction.connection.execute(text, toSqlParameters(parameters))
    })
    const commitUnknownReadOnlyRepository = createMysqlHttpIdempotencyCommitUnknownReadOnlyRepository({
      executeQuery: (text, parameters) => withReadConnection(source, async connection => (await connection.query(text, toSqlParameters(parameters))) as unknown as readonly HttpIdempotencySqlRow[])
    })
    const prefix = { fact: 'cft_', plan: 'cpl_', command: 'ccm_', observation: 'ceo_' } as const
    const commands = createLongTermCareCommands({ driver, idempotencyRepository, commitUnknownReadOnlyRepository,
      createRef: kind => `${prefix[kind]}${randomBytes(18).toString('base64url')}` })
    complete = async (ref, request) => {
      const nowMs = Date.now()
      const key = `mx-key-${++sequence}`
      const result = await commands.completePlan({ rules: careLongTermRulesV1(), userRef: 'usr_mx_owner_000001', userPlantRef: 'upl_mx_active_00001', nowMs, planRef: ref, request: request as never,
        idempotency: { principalType: 'user', principalScopeHash: sha('usr_mx_owner_000001'), httpMethod: 'POST',
          normalizedPath: '/api/v2/care/user-plants/{userPlantRef}/plans/{planRef}/completions', operationId: 'completeCarePlan',
          idempotencyKeyHash: sha(key), requestHash: sha(JSON.stringify({ ref, request })), createdAtMs: nowMs, expiresAtMs: nowMs + 168 * hour } })
      return result as { status: number; body: Record<string, any> }
    }
  }, 180_000)

  afterAll(() => { spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' }) })

  beforeEach(() => {
    sql(`SET FOREIGN_KEY_CHECKS=0; DELETE FROM care_environment_observations; DELETE FROM care_facts; DELETE FROM care_plans; DELETE FROM care_proposals;
      DELETE FROM http_idempotency_records; SET FOREIGN_KEY_CHECKS=1;`)
  })

  test('028 索引存在且扫描语句命中', () => {
    expect(rows(`SELECT COLUMN_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${database}' AND INDEX_NAME='idx_care_plan_expiry_scan' ORDER BY SEQ_IN_INDEX;`).flat())
      .toEqual(['status', 'scheduled_at_ms', 'id'])
    // 传统 EXPLAIN 第 7 列为实际选用的索引（key）。
    const explain = rows(`EXPLAIN UPDATE care_plans SET status = 'expired' WHERE status = 'planned' AND scheduled_at_ms < 1 ORDER BY scheduled_at_ms ASC, id ASC LIMIT 500;`)
    expect(explain[0]?.[6]).toBe('idx_care_plan_expiry_scan')
  })

  test('到期 planned → expired 且版本+1；未到期、completed、cancelled、已 expired 不动', async () => {
    const now = Date.now()
    insertPlan(1, 'planned', now - 73 * hour)
    insertPlan(2, 'planned', now - 71 * hour)
    insertPlan(3, 'completed', now - 100 * hour)
    insertPlan(4, 'cancelled', now - 100 * hour)
    insertPlan(5, 'expired', now - 100 * hour)
    expect(await job()).toMatchObject({ outcome: 'drained', expiredCount: 1, batchCount: 1 })
    expect([1, 2, 3, 4, 5].map(planRow)).toEqual([['expired', '2'], ['planned', '1'], ['completed', '1'], ['cancelled', '1'], ['expired', '1']])
  })

  test('重复运行幂等：第二次 expiredCount=0，版本不再变化', async () => {
    insertPlan(1, 'planned', Date.now() - 80 * hour)
    expect(await job()).toMatchObject({ expiredCount: 1 })
    expect(await job()).toMatchObject({ outcome: 'drained', expiredCount: 0, batchCount: 1 })
    expect(planRow(1)).toEqual(['expired', '2'])
  })

  test('批量分页：1201 条到期计划 → 3 批（500/500/201）全部过期', async () => {
    const created = Date.now() - 10 * day
    const scheduled = Date.now() - 80 * hour
    sql(`SET SESSION cte_max_recursion_depth = 5000;
      INSERT INTO care_proposals (id, proposal_ref, user_internal_id, user_plant_internal_id, capability_type, contract_version, details_schema_version, result_json, status, valid_until_ms, idempotency_key, created_at_ms, updated_at_ms)
        WITH RECURSIVE seq (n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM seq WHERE n < 1201)
        SELECT 1000 + n, CONCAT('cpr_bulk_', LPAD(n, 8, '0')), 1, 1, 'watering', 'care-capability/v1', 'watering-details/v1', CAST('{}' AS JSON), 'confirmed', NULL, SHA2(CONCAT('bulk', n), 256), ${created}, ${created} FROM seq;
      INSERT INTO care_plans (id, plan_ref, user_internal_id, user_plant_internal_id, proposal_internal_id, plan_type, scheduled_at_ms, status, plan_payload_json, version, created_at_ms, updated_at_ms)
        SELECT id, CONCAT('cpl_bulk_', LPAD(id - 1000, 8, '0')), 1, 1, id, 'check_soil', ${scheduled} - (id - 1000), 'planned', CAST('${JSON.stringify({ calendar, completedFactRef: null })}' AS JSON), 1, ${created}, ${created} FROM care_proposals WHERE id > 1000;`)
    expect(await job()).toMatchObject({ outcome: 'drained', expiredCount: 1201, batchCount: 3 })
    expect(rows(`SELECT status, version, COUNT(*) FROM care_plans GROUP BY status, version;`)).toEqual([['expired', '2', '1201']])
  })

  test('已过期再完成 → 409 CARE_PLAN_EXPIRED，零写入；未过期计划完成 → 200', async () => {
    const now = Date.now()
    insertPlan(1, 'planned', now - 80 * hour)
    insertPlan(2, 'planned', now - hour)
    await job()
    const watering = { occurredAt: new Date(now - 10 * 60_000).toISOString(), amountMl: 150 }
    expect(await complete(planRef(1), { version: 2, outcome: 'done', watering, soil: { state: 'dry', scope: 'surface' } }))
      .toEqual({ status: 409, body: { error: { type: 'CARE_PLAN_EXPIRED', message: '计划已过期，请重新获取浇水建议' } } })
    expect(planRow(1)).toEqual(['expired', '2'])
    expect(sql('SELECT COUNT(*) FROM care_facts;')).toBe('0')
    expect(sql('SELECT COUNT(*) FROM care_environment_observations;')).toBe('0')
    expect(await complete(planRef(2), { version: 1, outcome: 'done', watering })).toMatchObject({ status: 200, body: { data: { status: 'completed', version: 2 } } })
    expect(planRow(2)).toEqual(['completed', '2'])
    expect(sql('SELECT COUNT(*) FROM care_facts;')).toBe('1')
  })

  test('并发：完成 与 扫描 同时发起 24 轮，二者互斥、无双写', async () => {
    const outcomes = { completed: 0, expired: 0 }
    for (let round = 0; round < 24; round += 1) {
      const id = 100 + round
      insertPlan(id, 'planned', Date.now() - 73 * hour)
      const watering = { occurredAt: new Date(Date.now() - 60_000).toISOString(), amountMl: 100 }
      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
      // 起跑错位 −30～+25 ms（负数让完成晚出发、正数让扫描晚出发）：扫描自 2026-10-10 起每次运行先读一次策略快照，
      // 双向错位保证「完成先锁行」与「扫描先改写」两种先后顺序都真实出现，并覆盖贴身竞争。
      const offset = (round % 12) * 5 - 30
      const [completion, scan] = await Promise.all([
        delay(Math.max(0, -offset)).then(() => complete(planRef(id), { version: 1, outcome: 'done', watering })),
        delay(Math.max(0, offset)).then(() => job())
      ])
      const [status, version] = planRow(id)!
      const facts = Number(sql(`SELECT COUNT(*) FROM care_facts WHERE occurred_at_ms = ${Date.parse(watering.occurredAt)};`))
      expect(version).toBe('2')
      if (status === 'completed') {
        outcomes.completed += 1
        expect(completion).toMatchObject({ status: 200, body: { data: { status: 'completed', version: 2 } } })
        expect(scan.expiredCount).toBe(0)
        expect(facts).toBe(1)
      } else {
        outcomes.expired += 1
        expect(status).toBe('expired')
        expect(completion.body).toMatchObject({ error: { type: 'CARE_PLAN_EXPIRED' } })
        expect(scan.expiredCount).toBe(1)
        expect(facts).toBe(0)
      }
    }
    expect(outcomes.completed + outcomes.expired).toBe(24)
    // 两种先后顺序都必须真实出现，否则本用例没有证明竞争互斥。
    expect(outcomes.completed).toBeGreaterThan(0)
    expect(outcomes.expired).toBeGreaterThan(0)
    console.info(`[care-plan-expiry 并发分布] completed=${outcomes.completed} expired=${outcomes.expired}`)
  }, 120_000)
})
