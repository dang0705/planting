import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { createMysql2ConnectionSource } from '../../src/foundation/database/mysql2-connection-source.js'
import { createMysqlGuestSessionRepository } from '../../src/identity/repository/mysql-guest-session-repository.js'
import { findProjectRoot } from '../support/project-root.js'

const container = `qhz-guest-session-${process.pid}`
const database = 'qhz_guest_session'
const now = Date.UTC(2026, 9, 9, 2)
const hour = 3_600_000
let source: ReturnType<typeof createMysql2ConnectionSource>

/** 只操作本测试创建的隔离容器。 */
function docker(args: string[], input?: string): string {
  const result = spawnSync('docker', args, { encoding: 'utf8', input })
  if (result.status !== 0) { throw new Error(result.stderr || '隔离MySQL操作失败') }
  return result.stdout.trim()
}
/** 在测试库执行 SQL。 */
function mysql(sql: string, db?: string): string {
  return docker(['exec', '-i', container, 'mysql', '--no-defaults', '-uroot', ...(db ? [db] : [])], sql)
}
const record = (overrides: Record<string, unknown> = {}) => ({
  guestSessionRef: 'gst_AAAAAAAAAAAAAAAAAAAAAA', identitySource: 'server_issued_guest_token' as const,
  possessionProofHash: 'c'.repeat(64), possessionProofVersion: 1 as const, anonymousSubjectHash: null,
  issuanceSourceHash: 'a'.repeat(64), status: 'active' as const, issuedAtMs: now, expiresAtMs: now + 168 * hour, ...overrides,
})

/** unit_real_data：真实 MySQL 8.4，003 建表＋023 迁移；不是 HTTP 或云端验收。 */
describe('unit_real_data 游客会话存储', () => {
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
    const root = findProjectRoot()
    const ddl = readFileSync(join(root, 'docs/backend-v2/schema/003_user_plant.sql'), 'utf8')
    const table = ddl.match(/CREATE TABLE `guest_sessions`[^;]*;/s)?.[0]
    if (!table) { throw new Error('缺少 guest_sessions 建表语句') }
    mysql(table, database)
    mysql(readFileSync(join(root, 'docs/backend-v2/schema/023_guest_token_sessions.sql'), 'utf8'), database)
    const port = Number(docker(['port', container, '3306/tcp']).split(':').at(-1))
    source = createMysql2ConnectionSource({ host: '127.0.0.1', port, database, user: 'root', password: '' })
  }, 40_000)
  afterAll(() => { spawnSync('docker', ['rm', '-f', container], { encoding: 'utf8' }) })
  beforeEach(() => { mysql('DELETE FROM guest_sessions;', database) })

  it('Happy：写入后计数为 1，按令牌摘要找到有效会话', async () => {
    const repository = createMysqlGuestSessionRepository(source)
    await repository.insert(record())
    expect(await repository.countIssuedSince('a'.repeat(64), now - hour)).toBe(1)
    expect(await repository.findActiveByProofHash('c'.repeat(64), now + hour)).toEqual({
      guestSessionRef: 'gst_AAAAAAAAAAAAAAAAAAAAAA', issuedAtMs: now, expiresAtMs: now + 168 * hour })
  })
  it('U2：窗口起点晚于签发、其他限流键 → 0', async () => {
    const repository = createMysqlGuestSessionRepository(source)
    await repository.insert(record())
    expect(await repository.countIssuedSince('a'.repeat(64), now + 1)).toBe(0)
    expect(await repository.countIssuedSince('b'.repeat(64), now - hour)).toBe(0)
  })
  it('Reverse：过期、非 active、未知摘要 → null', async () => {
    const repository = createMysqlGuestSessionRepository(source)
    await repository.insert(record())
    expect(await repository.findActiveByProofHash('c'.repeat(64), now + 168 * hour)).toBeNull()
    expect(await repository.findActiveByProofHash('d'.repeat(64), now + hour)).toBeNull()
    mysql("UPDATE guest_sessions SET status='completed';", database)
    expect(await repository.findActiveByProofHash('c'.repeat(64), now + hour)).toBeNull()
  })
  it('I3：重复引用被唯一键拒绝；非法来源被 CHECK 拒绝', async () => {
    const repository = createMysqlGuestSessionRepository(source)
    await repository.insert(record())
    await expect(repository.insert(record({ possessionProofHash: 'e'.repeat(64) }))).rejects.toThrow()
    await expect(repository.insert(record({ guestSessionRef: 'gst_BBBBBBBBBBBBBBBBBBBBBB', identitySource: 'device_id' }))).rejects.toThrow()
  })
})
