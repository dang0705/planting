import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createConnection, type Connection } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlEnvironmentSnapshotRepository, type EnvironmentSnapshotRecord } from '../../src/care/repository/mysql-environment-snapshot-repository.js'
import { deriveMeasuredPot } from '../../src/care/cultivation/derive-measured-pot.js'
import { findProjectRoot } from '../support/project-root.js'

/** 本测试只创建、删除自己具名的隔离容器，不接 CloudBase 凭证或生产环境。 */
const container = `qhz-care-snapshot-${process.pid}`
let db: Connection
let repository: ReturnType<typeof createMysqlEnvironmentSnapshotRepository>
let source: ReturnType<typeof createMysql2ConnectionSource>
let decisionProtection: string | undefined
const pot = { actualInnerPotConfirmed: true, drainageAvailable: false, potTopDiameterCm: 20, potBottomDiameterCm: 10, potHeightCm: 12 }
const snapshot = {
  snapshotRef: 'ces_test_original', userRef: 'usr_test_owner', userPlantRef: 'upl_test_owner',
  careContextVersion: 1, configurationSnapshotRef: 'cfg_test_only',
  inputManifest: { pot, environmentContractVersion: 'care-environment-foundation/v2' },
  evidenceWindowStartMs: 1000, evidenceWindowEndMs: 2000, generatedAtMs: 3000, validUntilMs: 4000,
} as const

/** 执行隔离容器命令，仅允许本测试容器。 */
function docker(args: string[]): string {
  const result = spawnSync('docker', args, { encoding: 'utf8' })
  if (result.status !== 0) {
    throw new Error(result.stderr || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 用真实事务调用 Repository；失败回滚且不把原错误隐藏为成功。 */
async function append(value: EnvironmentSnapshotRecord): Promise<void> {
  const connection = await source.getConnection()
  await connection.beginTransaction()
  try {
    await repository.append({ transactionContext: true, connection }, value)
    await connection.commit()
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

/**
 * unit_real_data：Repository → mysql2 → 隔离 MySQL 8.0.43，无替身数据库。
 * Expected 来自批准计划、care-environment-foundation/v2 和 004 指定快照 DDL。
 * 只抽取该表与对应触发器，父表为最小归属夹具；不运行全量迁移、不证明正式 HTTP 或策略发布。
 */
beforeAll(async () => {
  docker(['run', '-d', '--name', container, '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', '-p', '127.0.0.1::3306', 'mysql:8.0.43'])
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  let connected = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      db = await createConnection({ host: '127.0.0.1', port, user: 'root', password: '' })
      await db.query('SELECT 1')
      connected = true
      break
    } catch {
      await db?.end().catch(() => undefined)
      await new Promise(resolve => setTimeout(resolve, 200))
    }
  }
  if (!connected) {
    throw new Error('隔离 MySQL 未就绪')
  }
  await db.query('CREATE DATABASE care_snapshot_fixture CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci')
  await db.query('USE care_snapshot_fixture')
  await db.query('CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY, public_user_id VARCHAR(64) UNIQUE)')
  await db.query('CREATE TABLE user_plants (id BIGINT UNSIGNED PRIMARY KEY, user_internal_id BIGINT UNSIGNED NOT NULL, public_user_plant_id VARCHAR(64) UNIQUE, UNIQUE(user_internal_id,id), FOREIGN KEY(user_internal_id) REFERENCES users(id))')
  await db.query("INSERT INTO users VALUES (1,'usr_test_owner'),(2,'usr_test_other')")
  await db.query("INSERT INTO user_plants VALUES (1,1,'upl_test_owner'),(2,2,'upl_test_other')")
  const ddl = readFileSync(join(findProjectRoot(), 'docs/backend-v2/schema/004_care_diagnosis.sql'), 'utf8')
  const table = ddl.match(/CREATE TABLE `care_environment_snapshots` \([\s\S]*?ENGINE=InnoDB[^;]+;/u)?.[0]
  const trigger = ddl.match(/CREATE TRIGGER `trg_environment_snapshots_reject_update`[\s\S]*?END\$\$/u)?.[0]
  if (!table || !trigger) {
    throw new Error('指定快照表或不可变触发器缺失')
  }
  await db.query(table)
  await db.query(trigger.replace(/\$\$$/u, ''))
  // 只取决策派生表；017 的临时案例 ALTER 不属于此隔离持久化验证。
  const decisionDdl = readFileSync(join(findProjectRoot(), 'docs/backend-v2/schema/017_care_v2_ephemeral_and_derivations.sql'), 'utf8')
    .match(/CREATE TABLE `care_decision_derivations` \([\s\S]*?ENGINE=InnoDB[^;]+;/u)?.[0]
  if (!decisionDdl) {
    throw new Error('决策派生表定义缺失')
  }
  await db.query(decisionDdl)
  const protectionPath = join(findProjectRoot(), 'docs/backend-v2/schema/018_care_decision_derivation_immutability.sql')
  if (existsSync(protectionPath)) {
    const protection = readFileSync(protectionPath, 'utf8')
      .match(/CREATE TRIGGER `trg_care_decision_derivations_reject_update`[\s\S]*?END\$\$/u)?.[0]
    if (!protection) {
      throw new Error('决策派生不可变保护迁移内容缺失')
    }
    decisionProtection = protection.replace(/\$\$$/u, '')
  }
  source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database: 'care_snapshot_fixture', user: 'root', password: '' })
  repository = createMysqlEnvironmentSnapshotRepository(source)
}, 30_000)

afterAll(async () => {
  await db?.end()
  docker(['rm', '-f', container])
})

describe('unit_real_data 长期养护输入快照不可变持久化', () => {
  it('写入、归属读回与原输入盆器回放一致', async () => {
    await append(snapshot)
    const read = await repository.read(snapshot.userRef, snapshot.userPlantRef, snapshot.snapshotRef)
    expect(read).toMatchObject(snapshot)
    expect(read?.inputManifestSha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(deriveMeasuredPot(read?.inputManifest.pot as typeof pot)).toMatchObject({ safety: 'drainage_risk', geometry: { containerVolumeMl: 700 * Math.PI } })
  })

  it('跨用户、跨植物与不存在引用均不能读到记录', async () => {
    expect(await repository.read('usr_test_other', snapshot.userPlantRef, snapshot.snapshotRef)).toBeNull()
    expect(await repository.read(snapshot.userRef, 'upl_test_other', snapshot.snapshotRef)).toBeNull()
    expect(await repository.read(snapshot.userRef, snapshot.userPlantRef, 'ces_test_absent')).toBeNull()
  })

  it('重复引用或同归属同清单拒绝，不更新原记录', async () => {
    await expect(append(snapshot)).rejects.toThrow()
    await expect(append({ ...snapshot, snapshotRef: 'ces_test_duplicate_manifest' })).rejects.toThrow()
    expect(await repository.read(snapshot.userRef, snapshot.userPlantRef, snapshot.snapshotRef)).toMatchObject(snapshot)
  })

  it('跨用户写入植物拒绝，数据库没有新增记录', async () => {
    await expect(append({ ...snapshot, snapshotRef: 'ces_test_wrong_owner', userRef: 'usr_test_other' })).rejects.toThrow()
    const [rows] = await db.query('SELECT COUNT(*) AS count FROM care_environment_snapshots')
    expect((rows as Array<{ count: number }>)[0]?.count).toBe(1)
  })

  it('新的事实清单追加新快照，原记录保持不变', async () => {
    const changed = { ...snapshot, snapshotRef: 'ces_test_new_fact', inputManifest: { ...snapshot.inputManifest, pot: { ...pot, potHeightCm: 20 } } }
    await append(changed)
    expect(await repository.read(snapshot.userRef, snapshot.userPlantRef, snapshot.snapshotRef)).toMatchObject(snapshot)
    expect(await repository.read(snapshot.userRef, snapshot.userPlantRef, changed.snapshotRef)).toMatchObject(changed)
  })

  it('数据库触发器拒绝修改时间或清单，读回原值', async () => {
    await expect(db.query('UPDATE care_environment_snapshots SET updated_at_ms = created_at_ms WHERE snapshot_ref = ?', [snapshot.snapshotRef])).rejects.toThrow('不可修改')
    await expect(db.query('UPDATE care_environment_snapshots SET input_manifest_json = JSON_OBJECT() WHERE snapshot_ref = ?', [snapshot.snapshotRef])).rejects.toThrow('不可修改')
    expect(await repository.read(snapshot.userRef, snapshot.userPlantRef, snapshot.snapshotRef)).toMatchObject(snapshot)
  })

  it('非法时间、缺失 JSON 或非有限值在写入前拒绝', async () => {
    for (const override of [{ validUntilMs: 3000 }, { evidenceWindowStartMs: -1 }, { careContextVersion: 0 }, { inputManifest: null }, { inputManifest: { bad: NaN } }, { inputManifest: { bad: new Date('2026-10-04T00:00:00Z') } }]) {
      await expect(append({ ...snapshot, ...override } as never)).rejects.toThrow()
    }
  })

  it('数据库清单摘要不符时拒绝回放，不相信合法外形的 SHA', async () => {
    await db.query("INSERT INTO care_environment_snapshots (snapshot_ref,user_internal_id,user_plant_internal_id,care_context_version,configuration_snapshot_ref,input_manifest_json,input_manifest_sha256,evidence_window_start_ms,evidence_window_end_ms,generated_at_ms,valid_until_ms,created_at_ms,updated_at_ms) VALUES ('ces_test_bad_sha',1,1,1,'cfg_test_only',JSON_OBJECT('bad',true),?,1000,2000,3000,4000,3000,3000)", ['f'.repeat(64)])
    await expect(repository.read(snapshot.userRef, snapshot.userPlantRef, 'ces_test_bad_sha')).rejects.toThrow('摘要')
  })

  it('决策派生也拒绝 UPDATE，不能只保护环境派生', async () => {
    // 仅为存储约束夹具，不代表算法已发布或已产生正式个体校准。
    const sha = 'a'.repeat(64)
    await db.query("INSERT INTO care_decision_derivations (derivation_ref,user_internal_id,user_plant_internal_id,environment_snapshot_internal_id,derivation_type,algorithm_release_ref,algorithm_release_sha256,input_manifest_sha256,result_schema_version,result_json,result_sha256,confidence_band,generated_at_ms,valid_until_ms,created_at_ms,updated_at_ms) SELECT 'cdd_test_immutable',user_internal_id,user_plant_internal_id,id,'dry_progress','fixture_storage_only',?,input_manifest_sha256,'fixture/v1',JSON_OBJECT('fixture',true),?,'low',3000,4000,3000,3000 FROM care_environment_snapshots WHERE snapshot_ref=?", [sha, sha, snapshot.snapshotRef])
    const [before] = await db.query('SELECT * FROM care_decision_derivations')
    if (decisionProtection) {
      await db.query(decisionProtection)
    }
    const [after] = await db.query('SELECT * FROM care_decision_derivations')
    expect(after).toEqual(before)
    expect((after as unknown[]).length).toBe(1)
    await expect(db.query('UPDATE care_decision_derivations SET updated_at_ms=created_at_ms WHERE derivation_ref=?', ['cdd_test_immutable'])).rejects.toThrow('不可修改')
    await expect(db.query('UPDATE care_decision_derivations SET result_json=JSON_OBJECT() WHERE derivation_ref=?', ['cdd_test_immutable'])).rejects.toThrow('不可修改')
    const [rows] = await db.query('SELECT result_json FROM care_decision_derivations WHERE derivation_ref=?', ['cdd_test_immutable'])
    expect((rows as Array<{ result_json: unknown }>)[0]?.result_json).toEqual({ fixture: true })
  })
})
