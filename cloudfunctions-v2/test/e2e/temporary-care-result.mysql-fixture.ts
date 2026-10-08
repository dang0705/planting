import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createPool, type Pool } from 'mysql2/promise'

/** 临时结果SQL测试独占容器；只装载已准入两表、两条ALTER和一个不可变触发器。 */
const container = `qhz-temporary-care-${process.pid}`
/** 容器隔离测试库，不连接CloudBase或读取项目凭证。 */
const database = 'temporary_care_result_fixture'

/** 执行本测试独占Docker命令，不安装依赖或修改现有服务。 */
function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', input, maxBuffer: 2_000_000 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离Docker命令失败') }
  return result.stdout.trim()
}

/** 机械抽取指定迁移对象；不读取或输出其他架构正文。 */
function admittedDdl(): string {
  const base = resolve(__dirname, '../../../docs/backend-v2/schema')
  const original = readFileSync(resolve(base, '004_care_diagnosis.sql'), 'utf8')
  const increment = readFileSync(resolve(base, '017_care_v2_ephemeral_and_derivations.sql'), 'utf8')
  const tables = ['temporary_care_sessions', 'temporary_care_results'].map(name => {
    const match = original.match(new RegExp('CREATE TABLE `'+name+'` \\(.*?;', 's'))
    if (!match) { throw new Error('准入表slice缺失') }
    return match[0]
  })
  const alterations = [...increment.matchAll(/ALTER TABLE `(temporary_care_sessions|temporary_care_results)`[\s\S]*?;/g)].map(match => match[0])
  const trigger = original.match(/CREATE TRIGGER `trg_temporary_care_results_reject_update`[\s\S]*?END\$\$/)?.[0]
  if (!trigger || alterations.length !== 2) { throw new Error('准入增量或不可变触发器slice缺失') }
  return [...tables, ...alterations, 'DELIMITER $$', trigger, 'DELIMITER ;'].join('\n')
}

/** 父表仅证明FK与内部归属，明确不是完整身份、游客或案例业务实现。 */
const parents = `
CREATE TABLE users (id BIGINT UNSIGNED PRIMARY KEY, public_user_id VARCHAR(64) NOT NULL, status VARCHAR(24) NOT NULL, _openid VARCHAR(64) NOT NULL DEFAULT '');
CREATE TABLE authenticated_ephemeral_plant_cases (id BIGINT UNSIGNED PRIMARY KEY, ephemeral_plant_case_ref VARCHAR(64) NOT NULL, user_internal_id BIGINT UNSIGNED NOT NULL, expires_at_ms BIGINT UNSIGNED NOT NULL, _openid VARCHAR(64) NOT NULL DEFAULT '', FOREIGN KEY (user_internal_id) REFERENCES users(id));
CREATE TABLE guest_sessions (id BIGINT UNSIGNED PRIMARY KEY, guest_session_ref VARCHAR(64) NOT NULL, expires_at_ms BIGINT UNSIGNED NOT NULL, _openid VARCHAR(64) NOT NULL DEFAULT '');
CREATE TABLE guest_plant_cases (id BIGINT UNSIGNED PRIMARY KEY, guest_plant_case_ref VARCHAR(64) NOT NULL, guest_session_internal_id BIGINT UNSIGNED NOT NULL, expires_at_ms BIGINT UNSIGNED NOT NULL, _openid VARCHAR(64) NOT NULL DEFAULT '', FOREIGN KEY (guest_session_internal_id) REFERENCES guest_sessions(id));
`

/** 启动已有锁定MySQL镜像，随机端口避免并行争抢。 */
export async function startTemporaryCareFixture(): Promise<{ pool: Pool; port: number; database: string }> {
  docker(['image', 'inspect', 'mysql:8.0.43'])
  docker(['run', '--detach', '--rm', '--name', container, '--tmpfs', '/var/lib/mysql', '--publish', '127.0.0.1::3306', '--env', 'MYSQL_ALLOW_EMPTY_PASSWORD=yes', 'mysql:8.0.43'])
  let ready = false
  for (let attempt = 0; attempt < 120; attempt++) {
    const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '-uroot', '--batch', '--skip-column-names', '-e', 'SELECT @@port'], { encoding: 'utf8' })
    if (probe.status === 0 && probe.stdout.trim() === '3306') { ready = true; break }
    await new Promise(resolve => setTimeout(resolve, 250))
  }
  if (!ready) { throw new Error('隔离MySQL就绪超时') }
  docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot'], `CREATE DATABASE ${database}; USE ${database};\n${parents}\n${admittedDdl()}`)
  const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  return { pool: createPool({ host: '127.0.0.1', port, user: 'root', database, connectionLimit: 4 }), port, database }
}

/** 各用例重置隔离数据，真实触发器保持安装，不改Expected或生产DDL。 */
export async function seedTemporaryCareFixture(pool: Pool): Promise<void> {
  for (const table of ['temporary_care_results', 'temporary_care_sessions', 'guest_plant_cases', 'authenticated_ephemeral_plant_cases', 'guest_sessions', 'users']) { await pool.query(`DELETE FROM ${table}`) }
  await pool.query("INSERT INTO users VALUES (1,'usr_owner','active',''),(2,'usr_other','active','')")
  await pool.query("INSERT INTO authenticated_ephemeral_plant_cases VALUES (1,'case_owner',1,10000,''),(2,'case_other',2,10000,''),(3,'case_second',1,10000,'')")
  await pool.query("INSERT INTO guest_sessions VALUES (1,'guest_owner',10000,''),(2,'guest_other',10000,'')")
  await pool.query("INSERT INTO guest_plant_cases VALUES (1,'gcase_owner',1,10000,''),(2,'gcase_other',2,10000,'')")
  await pool.query("INSERT INTO temporary_care_sessions (id,session_ref,guest_plant_case_internal_id,authenticated_ephemeral_case_internal_id,capability_type,status,expires_at_ms,created_at_ms,updated_at_ms) VALUES (1,'session_auth',NULL,1,'watering','active',9000,500,500),(2,'session_guest',1,NULL,'watering','active',9000,500,500),(3,'session_second',NULL,3,'watering','active',9000,500,500)")
}

/** 释放测试连接并移除本测试独占容器，无其他资源清理。 */
export async function stopTemporaryCareFixture(pool: Pool | undefined): Promise<void> {
  await pool?.end()
  spawnSync('docker', ['rm', '--force', container], { encoding: 'utf8' })
}
