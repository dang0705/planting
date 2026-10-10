import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { runPolicyReleaseCli, type PolicyReleaseCliIo } from '../../src/configuration/policy-release/policy-release-cli.js'
import { loadPolicyReleaseDocument } from '../../src/configuration/policy-release/release-document.js'
import { findProjectRoot } from '../support/project-root.js'

/**
 * L1 / unit_fake（替换数据库连接为脚本化记录替身，不连接 MySQL）。
 * Expected 来源：主代理 / 用户 2026-10-10 第 3 步要求——CLI 提供 validate（按策略类型 AJV 校验 + 规范 SHA-256）、publish（插入不可变版本、不切换）、
 * activate（条件更新指针 WHERE 当前版本 = 期望版本，写审计行）、list、rollback（指回上一版）；连接信息从 environment.ts 读取；
 * 默认 dry-run，真正写库需显式 --apply；输出不含凭证。真实 MySQL 上的条件切换与并发冲突见 test/e2e/policy-release-cli.mysql.spec.ts。
 */
const root = findProjectRoot()
const releasePath = 'cloudfunctions-v2/models/policy-releases/care.long_term_rules.v1.release.json'
const readRepoFile = (path: string) => readFileSync(join(root, path), 'utf8')
const environment = { V2_MYSQL_HOST: '127.0.0.1', V2_MYSQL_PORT: '3306', V2_MYSQL_DATABASE: 'qhz_cli_unit', V2_MYSQL_USER: 'cli', V2_MYSQL_PASSWORD: 'cli-secret-never-print' }

/** 脚本化连接：按 SQL 前缀返回预设结果，并记录全部语句。 */
function scriptedConnection(answers: Array<[RegExp, unknown]>) {
  const statements: string[] = []
  const connection = {
    query: async (sql: string) => {
      statements.push(sql.replace(/\s+/gu, ' ').trim())
      const answer = answers.find(([pattern]) => pattern.test(sql))
      return answer === undefined ? { affectedRows: 1, insertId: 1 } : answer[1]
    },
    beginTransaction: async () => { statements.push('BEGIN') },
    commit: async () => { statements.push('COMMIT') },
    rollback: async () => { statements.push('ROLLBACK') },
    end: async () => { statements.push('END') }
  }
  return { statements, connection }
}
function io(connection: unknown, connectCalls: unknown[] = []): PolicyReleaseCliIo & { output: string[] } {
  const output: string[] = []
  return {
    output, environment, readRepoFile, now: () => Date.parse('2026-10-11T00:00:00Z'),
    readFile: path => readFileSync(join(root, path), 'utf8'),
    connect: async config => { connectCalls.push(config); return connection as never },
    write: text => { output.push(text) }
  }
}
const writes = (statements: readonly string[]) => statements.filter(sql => /^(INSERT|UPDATE|DELETE)/u.test(sql))

describe('策略发布 CLI', () => {
  it('validate：不连接数据库，输出规范 SHA-256 与版本信息', async () => {
    const connectCalls: unknown[] = []
    const cli = io(null, connectCalls)
    expect(await runPolicyReleaseCli(['validate', releasePath], cli)).toBe(0)
    const loaded = loadPolicyReleaseDocument(JSON.parse(readRepoFile(releasePath)), readRepoFile)
    expect(loaded.ok).toBe(true)
    const printed = JSON.parse(cli.output.join(''))
    expect(printed).toMatchObject({ command: 'validate', domainCode: 'care', policyCode: 'long_term_rules', schemaVersion: 'care-long-term-rules/v1',
      contentSha256: loaded.ok ? loaded.contentSha256 : '' })
    expect(connectCalls).toEqual([])
  })

  it('validate：越界正文失败退出码 1，不输出正文', async () => {
    const document = JSON.parse(readRepoFile(releasePath)) as { policy: Record<string, unknown> }
    document.policy.planPageSize = { default: 20, max: 99 }
    const cli = { ...io(null), readFile: () => JSON.stringify(document) }
    expect(await runPolicyReleaseCli(['validate', 'tampered.json'], cli)).toBe(1)
    expect(cli.output.join('')).not.toContain('"planPageSize"')
  })

  it('publish 默认 dry-run：只读查询，不执行任何写语句；连接参数来自 environment.ts，输出不含密码', async () => {
    const { statements, connection } = scriptedConnection([[/^\s*SELECT/iu, []]])
    const connectCalls: Array<Record<string, unknown>> = []
    const cli = io(connection, connectCalls)
    expect(await runPolicyReleaseCli(['publish', releasePath], cli)).toBe(0)
    expect(writes(statements)).toEqual([])
    expect(connectCalls[0]).toMatchObject({ host: '127.0.0.1', port: 3306, database: 'qhz_cli_unit', user: 'cli' })
    expect(cli.output.join('')).toContain('"dryRun":true')
    expect(cli.output.join('')).not.toContain('cli-secret-never-print')
  })

  it('publish --apply：插入一条 verified 不可变版本，不触碰活动指针', async () => {
    const { statements, connection } = scriptedConnection([[/^\s*SELECT/iu, []]])
    expect(await runPolicyReleaseCli(['publish', releasePath, '--apply'], io(connection))).toBe(0)
    const written = writes(statements)
    expect(written).toHaveLength(1)
    expect(written[0]).toMatch(/^INSERT INTO business_policy_releases /u)
    expect(written[0]).toContain("'verified'")
    expect(statements.some(sql => sql.includes('active_business_policy_releases') && /^(INSERT|UPDATE)/u.test(sql))).toBe(false)
  })

  it('activate --apply：期望当前版本与实际不符 → 冲突退出码 2，事务回滚、无审计行', async () => {
    const { statements, connection } = scriptedConnection([
      [/FROM business_policy_releases\s+WHERE domain_code = \? AND policy_code = \? AND release_version = \?/iu, [{ id: 9, release_version: 'care-long-term-rules/v1.1.0', content_sha256: 'b'.repeat(64), status: 'verified' }]],
      [/FROM active_business_policy_releases/iu, [{ id: 1, active_release_version: 'care-long-term-rules/v1.0.5', release_internal_id: 3, version: 4 }]],
    ])
    const code = await runPolicyReleaseCli(['activate', '--domain', 'care', '--policy', 'long_term_rules', '--version', 'care-long-term-rules/v1.1.0',
      '--expect-current', 'care-long-term-rules/v1.0.0', '--actor', 'ops-a', '--reason', 'raise_page_size', '--evidence', 'ticket-1', '--apply'], io(connection))
    expect(code).toBe(2)
    expect(statements).toContain('ROLLBACK')
    expect(statements.some(sql => sql.startsWith('INSERT INTO configuration_release_audit_records'))).toBe(false)
  })

  it('activate --apply：期望匹配 → 同一事务内条件更新指针（WHERE version 与当前版本）+ 新旧发布状态 + 审计行', async () => {
    const { statements, connection } = scriptedConnection([
      [/FROM business_policy_releases\s+WHERE domain_code = \? AND policy_code = \? AND release_version = \?/iu, [{ id: 9, release_version: 'care-long-term-rules/v1.1.0', content_sha256: 'b'.repeat(64), status: 'verified' }]],
      [/FROM active_business_policy_releases/iu, [{ id: 1, active_release_version: 'care-long-term-rules/v1.0.0', release_internal_id: 3, version: 4 }]],
    ])
    const code = await runPolicyReleaseCli(['activate', '--domain', 'care', '--policy', 'long_term_rules', '--version', 'care-long-term-rules/v1.1.0',
      '--expect-current', 'care-long-term-rules/v1.0.0', '--actor', 'ops-a', '--reason', 'raise_page_size', '--evidence', 'ticket-1', '--apply'], io(connection))
    expect(code).toBe(0)
    const begin = statements.indexOf('BEGIN'), commit = statements.indexOf('COMMIT')
    const pointer = statements.findIndex(sql => sql.startsWith('UPDATE active_business_policy_releases'))
    const audit = statements.findIndex(sql => sql.startsWith('INSERT INTO configuration_release_audit_records'))
    expect(begin).toBeGreaterThanOrEqual(0)
    expect(pointer).toBeGreaterThan(begin)
    expect(audit).toBeGreaterThan(pointer)
    expect(commit).toBeGreaterThan(audit)
    expect(statements[pointer]).toMatch(/WHERE domain_code = \? AND policy_code = \? AND version = \? AND active_release_version = \?/u)
  })

  it('activate 不带 --apply：只读校验，不开启写事务', async () => {
    const { statements, connection } = scriptedConnection([
      [/FROM business_policy_releases\s+WHERE domain_code = \? AND policy_code = \? AND release_version = \?/iu, [{ id: 9, release_version: 'care-long-term-rules/v1.1.0', content_sha256: 'b'.repeat(64), status: 'verified' }]],
      [/FROM active_business_policy_releases/iu, []],
    ])
    expect(await runPolicyReleaseCli(['activate', '--domain', 'care', '--policy', 'long_term_rules', '--version', 'care-long-term-rules/v1.1.0',
      '--expect-current', 'none', '--actor', 'ops-a', '--reason', 'initial', '--evidence', 'ticket-1'], io(connection))).toBe(0)
    expect(writes(statements)).toEqual([])
    expect(statements).not.toContain('BEGIN')
  })

  it('缺少必填参数或未知命令 → 退出码 64，不连接数据库', async () => {
    const connectCalls: unknown[] = []
    expect(await runPolicyReleaseCli(['activate', '--domain', 'care'], io(null, connectCalls))).toBe(64)
    expect(await runPolicyReleaseCli(['drop-everything'], io(null, connectCalls))).toBe(64)
    expect(connectCalls).toEqual([])
  })
})
