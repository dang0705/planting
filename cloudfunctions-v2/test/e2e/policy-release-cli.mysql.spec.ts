import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { CARE_LONG_TERM_RULES_POLICY } from '../../src/configuration/business-policies/index.js'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlTypedPolicyReader } from '../../src/foundation/policy/mysql-typed-policy-reader.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * unit_real_data：隔离 docker MySQL 8.4（tmpfs，本机 127.0.0.1）+ schema manifest 全量 DDL；
 * 真实经过：`node scripts/policy-release.mjs`（真实 CLI 启动器，连接信息经 environment.ts 从 V2_MYSQL_* 读取）→ mysql2 → 真实表与约束；
 * 再用真实类型化读取器读回 active 快照。
 * Expected 来源：第 3 步要求（publish 不切换、activate 条件更新 + 审计、并发覆盖被拒、rollback 指回上一版、默认 dry-run）与
 * configuration-and-providers.md §5「发布、回滚和审计」。不连接云端；本机无 Docker 时整组跳过。
 */
const dockerReady = spawnSync('docker', ['info'], { encoding: 'utf8' }).status === 0
const container = `qhz-policy-cli-${process.pid}`
const database = 'qhz_policy_cli'
const root = findProjectRoot()
const backend = path.join(root, 'cloudfunctions-v2')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'qhz-policy-cli-'))
let port = 0

function docker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], { encoding: 'utf8', input, maxBuffer: 10_485_760 })
  if (result.status !== 0) { throw new Error(result.stderr || result.stdout || '隔离 MySQL 命令失败') }
  return result.stdout.trim()
}
const sql = (text: string, db: string | null = database) => docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '-punused-root-password', '--batch', '--skip-column-names', ...(db ? [db] : [])], text)
const rows = (text: string) => sql(text).split('\n').filter(Boolean).map(line => line.split('\t'))
/** 运行真实 CLI；返回退出码与 stdout/stderr。 */
function cli(args: readonly string[]) {
  const result = spawnSync(process.execPath, ['scripts/policy-release.mjs', ...args], {
    cwd: backend, encoding: 'utf8',
    env: { PATH: process.env.PATH, V2_MYSQL_HOST: '127.0.0.1', V2_MYSQL_PORT: String(port), V2_MYSQL_DATABASE: database, V2_MYSQL_USER: 'root', V2_MYSQL_PASSWORD: 'unused-root-password' }
  })
  return { code: result.status, stdout: result.stdout, stderr: result.stderr }
}
/** 基于 v1 发布文档生成新版本文件（只改版本号与分页上限）。 */
function variant(releaseVersion: string, pageMax: number): string {
  const document = JSON.parse(fs.readFileSync(path.join(backend, 'models/policy-releases/care.long_term_rules.v1.release.json'), 'utf8')) as Record<string, any>
  document.releaseVersion = releaseVersion
  document.policy.planPageSize = { default: 20, max: pageMax }
  const file = path.join(scratch, `${releaseVersion.replaceAll('/', '_')}.json`)
  fs.writeFileSync(file, JSON.stringify(document))
  return file
}
const actor = ['--actor', 'ops-local', '--reason', 'local_test', '--evidence', 'E00-policy-cli']
const pointer = () => rows(`SELECT active_release_version, version FROM active_business_policy_releases WHERE domain_code='care' AND policy_code='long_term_rules';`)
const readActive = async () => {
  const source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: 'unused-root-password' })
  return createMysqlTypedPolicyReader(source, CARE_LONG_TERM_RULES_POLICY).read(Date.now())
}

describe.skipIf(!dockerReady)('策略发布 CLI × 真实 MySQL', () => {
  beforeAll(async () => {
    docker(['run', '-d', '--name', container, '--tmpfs', '/var/lib/mysql', '-p', '127.0.0.1::3306', '-e', 'MYSQL_ROOT_PASSWORD=unused-root-password', 'mysql:8.4'])
    let ready = false
    for (let attempt = 0; attempt < 200; attempt += 1) {
      const probe = spawnSync('docker', ['exec', container, 'mysql', '--no-defaults', '--protocol=TCP', '--host=127.0.0.1', '-uroot', '-punused-root-password', '-N', '-e', 'SELECT 1'], { encoding: 'utf8' })
      if (probe.status === 0 && probe.stdout.trim() === '1') { ready = true; break }
      await new Promise(resolve => setTimeout(resolve, 250))
    }
    if (!ready) { throw new Error('隔离 MySQL 未就绪') }
    const schemaDirectory = path.join(root, 'docs/backend-v2/schema')
    const manifest = JSON.parse(fs.readFileSync(path.join(schemaDirectory, 'manifest.json'), 'utf8')) as { files: Array<{ file: string }> }
    docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot', '-punused-root-password', '-e', `CREATE DATABASE ${database} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`])
    for (const entry of manifest.files) {
      docker(['exec', '-i', container, 'mysql', '--no-defaults', '--default-character-set=utf8mb4', '-uroot', '-punused-root-password', database], fs.readFileSync(path.join(schemaDirectory, entry.file), 'utf8'))
    }
    port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
  }, 120_000)
  afterAll(() => { if (dockerReady) { spawnSync('docker', ['rm', '-f', container]) } ; fs.rmSync(scratch, { recursive: true, force: true }) })

  test('publish 默认 dry-run 不写库；--apply 插入 verified 版本但不切换指针', () => {
    const v1 = 'models/policy-releases/care.long_term_rules.v1.release.json'
    expect(cli(['publish', v1]).code).toBe(0)
    expect(rows(`SELECT COUNT(*) FROM business_policy_releases WHERE domain_code='care';`)).toEqual([['0']])
    const applied = cli(['publish', v1, '--apply'])
    expect(applied.code).toBe(0)
    expect(applied.stdout + applied.stderr).not.toContain('unused-root-password')
    expect(rows(`SELECT release_version, status FROM business_policy_releases WHERE domain_code='care' AND policy_code='long_term_rules';`)).toEqual([['care-long-term-rules/v1.0.0', 'verified']])
    expect(pointer()).toEqual([])
    expect(cli(['publish', v1, '--apply']).code).toBe(0)
    expect(rows(`SELECT COUNT(*) FROM business_policy_releases WHERE domain_code='care';`)).toEqual([['1']])
  })

  test('首次 activate（期望 none）→ 指针 + active 状态 + 审计；真实读取器读回 v1 快照', async () => {
    expect(await readActive()).toBeNull()
    expect(cli(['activate', '--domain', 'care', '--policy', 'long_term_rules', '--version', 'care-long-term-rules/v1.0.0', '--expect-current', 'none', ...actor, '--apply']).code).toBe(0)
    expect(pointer()).toEqual([['care-long-term-rules/v1.0.0', '1']])
    expect(rows(`SELECT action, IFNULL(from_release_version,'-'), to_release_version FROM configuration_release_audit_records ORDER BY id;`))
      .toEqual([['activate', '-', 'care-long-term-rules/v1.0.0']])
    expect((await readActive())?.rules.planPageSize).toEqual({ default: 20, max: 50 })
  })

  test('条件切换防并发覆盖：两个操作者都以 v1.0.0 为期望，先到者成功、后到者冲突（退出码 2），指针不被覆盖', async () => {
    expect(cli(['publish', variant('care-long-term-rules/v1.1.0', 40), '--apply']).code).toBe(0)
    expect(cli(['publish', variant('care-long-term-rules/v1.2.0', 30), '--apply']).code).toBe(0)
    const first = cli(['activate', '--domain', 'care', '--policy', 'long_term_rules', '--version', 'care-long-term-rules/v1.1.0', '--expect-current', 'care-long-term-rules/v1.0.0', ...actor, '--apply'])
    const second = cli(['activate', '--domain', 'care', '--policy', 'long_term_rules', '--version', 'care-long-term-rules/v1.2.0', '--expect-current', 'care-long-term-rules/v1.0.0', ...actor, '--apply'])
    expect([first.code, second.code]).toEqual([0, 2])
    expect(pointer()).toEqual([['care-long-term-rules/v1.1.0', '2']])
    expect(rows(`SELECT release_version, status FROM business_policy_releases WHERE domain_code='care' ORDER BY id;`)).toEqual([
      ['care-long-term-rules/v1.0.0', 'retired'], ['care-long-term-rules/v1.1.0', 'active'], ['care-long-term-rules/v1.2.0', 'verified']])
    expect((await readActive())?.rules.planPageSize).toEqual({ default: 20, max: 40 })
  })

  test('list 列出历史版本与当前指针；rollback 指回上一版并写审计', async () => {
    const listed = cli(['list', '--domain', 'care', '--policy', 'long_term_rules'])
    expect(listed.code).toBe(0)
    expect(JSON.parse(listed.stdout)).toMatchObject({ command: 'list', activeReleaseVersion: 'care-long-term-rules/v1.1.0',
      releases: [{ releaseVersion: 'care-long-term-rules/v1.0.0' }, { releaseVersion: 'care-long-term-rules/v1.1.0' }, { releaseVersion: 'care-long-term-rules/v1.2.0' }] })
    expect(cli(['rollback', '--domain', 'care', '--policy', 'long_term_rules', '--expect-current', 'care-long-term-rules/v1.0.0', ...actor, '--apply']).code).toBe(2)
    expect(cli(['rollback', '--domain', 'care', '--policy', 'long_term_rules', '--expect-current', 'care-long-term-rules/v1.1.0', ...actor]).code).toBe(0)
    expect(pointer()).toEqual([['care-long-term-rules/v1.1.0', '2']])
    expect(cli(['rollback', '--domain', 'care', '--policy', 'long_term_rules', '--expect-current', 'care-long-term-rules/v1.1.0', ...actor, '--apply']).code).toBe(0)
    expect(pointer()).toEqual([['care-long-term-rules/v1.0.0', '3']])
    expect(rows(`SELECT action, IFNULL(from_release_version,'-'), to_release_version FROM configuration_release_audit_records ORDER BY id;`)).toEqual([
      ['activate', '-', 'care-long-term-rules/v1.0.0'], ['activate', 'care-long-term-rules/v1.0.0', 'care-long-term-rules/v1.1.0'],
      ['rollback', 'care-long-term-rules/v1.1.0', 'care-long-term-rules/v1.0.0']])
    expect((await readActive())?.rules.planPageSize).toEqual({ default: 20, max: 50 })
  })

  test('v1 种子 SQL 在空库上可执行，全部 7 个策略都能被真实读取器读到', async () => {
    sql(`DELETE FROM configuration_release_audit_records; DELETE FROM active_business_policy_releases; DELETE FROM business_policy_releases;`)
    sql(fs.readFileSync(path.join(root, 'docs/backend-v2/schema/seeds/business_policy_releases.2026-10-10.sql'), 'utf8'))
    expect(rows(`SELECT CONCAT(domain_code,'/',policy_code), active_release_version FROM active_business_policy_releases ORDER BY domain_code, policy_code;`)).toEqual([
      ['care/long_term_rules', 'care-long-term-rules/v1.0.0'], ['care/mvp_watering', 'care-watering-mvp/v4.0.0'], ['http/request_write', 'http-request-write-policy/v2.0.0'],
      // 空库种子直接激活 public_search v2（plant-visual-axis-filter/v1，用户 2026-10-10 审定；v1 原四字段取值不变）。
      ['plant-knowledge/public_search', 'plant-knowledge-public-search/v2.0.0'], ['user-plant/asset_rules', 'user-plant-asset-rules/v1.0.0'],
      ['user-plant/list_rules', 'user-plant-list-rules/v1.0.0'], ['weather/public_read', 'weather-public-read/v1.0.0']])
    expect((await readActive())?.rules.planExpiryGraceHours).toBe(72)
  })
})
