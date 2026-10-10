import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import {
  createMysql2ConnectionSource,
  type Mysql2QueryConnection
} from '../../../src/foundation/database/mysql2-connection-source.js'
import {
  createMysqlTransactionDriver,
  type MysqlConnectionPoolPort,
  type MysqlTransactionContext
} from '../../../src/foundation/database/mysql-transaction-driver.js'
import type { DatabaseTransactionDriver } from '../../../src/foundation/database/transaction-runner.js'
import { findProjectRoot } from '../../support/project-root.js'

/**
 * 视觉诊断真实库夹具（unit_real_data）：本机 Docker MySQL 8.4 + schema manifest 全量 DDL（含 032）。
 * 只连本机隔离容器，不连接 CloudBase、不写云端库。预置两个用户、各自的用户植物（一株 active、一株 archived）、
 * 一个有效登录临时案例与一个已过期临时案例，以及 owner 的 AI 额度批次。
 */
export interface VisualDiagnosisMysqlHarness {
  /** 在测试库执行 SQL 并返回 batch 文本输出（制表符分隔）。 */
  readonly sql: (text: string) => string
  /** 测试库连接来源。 */
  readonly source: MysqlConnectionPoolPort<Mysql2QueryConnection>
  /** 共享事务驱动。 */
  readonly driver: DatabaseTransactionDriver<MysqlTransactionContext<Mysql2QueryConnection>>
  /** 停止并删除容器。 */
  readonly stop: () => void
}

/** 夹具常量：用户、植物与临时案例的公开引用。 */
export const visualHarnessRefs = {
  ownerRef: 'usr_visual_owner_0001',
  strangerRef: 'usr_visual_stranger_01',
  activePlantRef: 'upl_visual_active_0001',
  archivedPlantRef: 'upl_visual_archived_01',
  strangerPlantRef: 'upl_visual_stranger_01',
  activeCaseRef: 'epc_visual_active_0001',
  expiredCaseRef: 'epc_visual_expired_001'
} as const

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败')
  }
  return result.stdout.trim()
}

/** 启动容器、按 manifest 建库并写入夹具。 */
export async function startVisualDiagnosisMysqlHarness(options: {
  /** 容器名唯一后缀。 */
  readonly name: string
  /** 夹具“当前时间”UTC 毫秒。 */
  readonly now: number
  /** owner 的 AI 额度批次可用点数。 */
  readonly ownerQuota: number
}): Promise<VisualDiagnosisMysqlHarness> {
  const container = `qhz-vd-${options.name}-${process.pid}`
  const database = 'qhz_visual_diagnosis'
  const sql = (text: string, db: string | null = database) =>
    docker(
      ['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '--batch', '--skip-column-names', ...(db ? [db] : [])],
      text
    )
  docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.4'])
  let ready = false
  for (let attempt = 0; attempt < 160; attempt += 1) {
    const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '1') {
      ready = true
      break
    }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) {
    throw new Error('隔离 MySQL 未就绪')
  }
  const schemaDirectory = path.join(findProjectRoot(), 'docs/backend-v2/schema')
  const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as {
    files: Array<{ file: string }>
  }
  sql(`CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`, null)
  for (const entry of manifest.files) {
    sql(fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8'))
  }
  const t = options.now - 3_600_000
  const r = visualHarnessRefs
  sql(`INSERT INTO users (id, public_user_id, status, session_version, created_at_ms, updated_at_ms) VALUES
      (1, '${r.ownerRef}', 'active', 1, ${t}, ${t}), (2, '${r.strangerRef}', 'active', 1, ${t}, ${t});
    INSERT INTO user_plants (_openid, id, public_user_plant_id, user_internal_id, lifecycle_status, current_identity_status, confirmed_identity_internal_id, version, created_at_ms, updated_at_ms) VALUES
      ('', 11, '${r.activePlantRef}', 1, 'active', 'unidentified', NULL, 1, ${t}, ${t}),
      ('', 12, '${r.archivedPlantRef}', 1, 'archived', 'unidentified', NULL, 1, ${t}, ${t}),
      ('', 21, '${r.strangerPlantRef}', 2, 'active', 'unidentified', NULL, 1, ${t}, ${t});
    INSERT INTO authenticated_ephemeral_plant_cases (_openid, id, ephemeral_plant_case_ref, user_internal_id, status, completed_at_ms, expires_at_ms, bound_user_plant_internal_id, version, created_at_ms, updated_at_ms) VALUES
      ('', 31, '${r.activeCaseRef}', 1, 'active', NULL, ${options.now + 3_600_000}, NULL, 1, ${t}, ${t}),
      ('', 32, '${r.expiredCaseRef}', 1, 'active', NULL, ${options.now - 1}, NULL, 1, ${t - 10}, ${t - 10});
    INSERT INTO ai_quota_accounts (_openid, user_internal_id, available_amount, reserved_amount, consumed_amount, version, created_at_ms, updated_at_ms) VALUES
      ('', 1, ${options.ownerQuota}, 0, 0, 1, ${t}, ${t}), ('', 2, 0, 0, 0, 1, ${t}, ${t});
    INSERT INTO ai_quota_grants (_openid, grant_ref, user_internal_id, source_type, source_ref, granted_amount, available_amount, reserved_amount, consumed_amount, capability_scope_json, policy_version, status, granted_at_ms, expires_at_ms, version, created_at_ms, updated_at_ms) VALUES
      ('', 'aqg_visual_owner_trial01', 1, 'TRIAL', 'trial-visual-owner', ${options.ownerQuota}, ${options.ownerQuota}, 0, 0, '["USER_DIAGNOSIS_VISUAL"]', 'trial-test/v1', 'active', ${t}, ${options.now + 86_400_000}, 1, ${t}, ${t});`)
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  const source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  return {
    sql: text => sql(text),
    source,
    driver: createMysqlTransactionDriver(source, () => undefined),
    stop: () => {
      spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' })
    }
  }
}
