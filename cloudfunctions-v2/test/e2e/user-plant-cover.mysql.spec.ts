import { createHash } from 'node:crypto'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { StorageProviderUnavailableError, type PrivateObjectStorage } from '../../src/foundation/storage/cloudbase-storage-http-adapter.js'
import { harnessUsers, plantInsertSql, startUserPlantMysqlHarness, type UserPlantMysqlHarness } from './support/user-plant-mysql-harness.js'

/**
 * unit_real_data：本机 Docker MySQL 8.4 全量 DDL + 真实 user-plant HTTP（会话、登记事务、user_plant_assets 唯一约束、单株与列表读回）；
 * 云存储为假 Provider（内存文件表，可切换为不可用）——用户裁决：真实 API Key 由用户稍后配置，测试不使用真实凭证。
 * Expected：docs/backend-v2/contracts/user-plant-cover-asset.md §1～§5（2026-10-10 用户审定与裁决）。
 * 不覆盖：真实 CloudBase 云存储 HTTP API、真实 COS 下载、存储安全规则下发效果。
 */
const now = Date.UTC(2026, 9, 10, 16)
const day = 86_400_000
const owner = harnessUsers.ownerRef
const plants = { main: 'upl_cover_main_00001', archived: 'upl_cover_archived01', deleting: 'upl_cover_deleting01', foreign: 'upl_cover_foreign001' } as const
const jpeg = (seed: number) => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, seed, seed + 1, seed + 2])
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
const fileIdOf = (user: string, name: string) => `cloud://env-test-001.bucket/user-plant/${user}/covers/${name}`
const files = new Map<string, Uint8Array>()
let storageDown = false
const storage: PrivateObjectStorage = {
  getDownloadUrl: async fileId => {
    if (storageDown) { throw new StorageProviderUnavailableError() }
    return files.has(fileId) ? `https://cos.example/${encodeURIComponent(fileId)}?sign=fixture` : null
  },
  download: async (url, maxBytes) => {
    if (storageDown) { throw new StorageProviderUnavailableError() }
    const bytes = files.get(decodeURIComponent(new URL(url).pathname.slice(1)))!
    return bytes.length > maxBytes ? 'too_large' : bytes
  }
}
let h: UserPlantMysqlHarness

const bind = (ref: string, name: string, bytes: Uint8Array, key: string, user: string = owner, bearer?: string) => {
  files.set(fileIdOf(user, name), bytes)
  return h.call('POST', `/api/v2/user-plants/${ref}/assets`, { bearer, key, body: JSON.stringify({ purpose: 'profile', fileId: fileIdOf(user, name), contentSha256: sha(bytes) }) })
}
const assets = (ref: string) => h.sql(`SELECT CONCAT(a.status, '|', IFNULL(CAST(a.cleanup_after_ms AS CHAR), '-'), '|', SUBSTRING_INDEX(a.storage_file_id, '/', -1)) FROM user_plant_assets a
  JOIN user_plants p ON p.id = a.user_plant_internal_id WHERE p.public_user_plant_id = '${ref}' ORDER BY a.id;`)

beforeAll(async () => {
  h = await startUserPlantMysqlHarness({ name: 'cover', now, serverOverrides: { storage } })
  h.sql(plantInsertSql(plants.main, 1, 'active', 1000) + plantInsertSql(plants.archived, 1, 'archived', 2000) + plantInsertSql(plants.deleting, 1, 'deleting', 3000) + plantInsertSql(plants.foreign, 2, 'active', 4000))
}, 180_000)
afterAll(async () => { await h.stop() })

describe('封面登记与读取（真实 MySQL + 假云存储）', () => {
  test('首次登记：200 返回 assetRef 与临时链接、到期时间 null；库内只存私有 fileID 与内容摘要', async () => {
    const response = await bind(plants.main, 'first.jpg', jpeg(1), 'cover-key-000001')
    expect(response.status).toBe(200)
    expect(response.json.data).toMatchObject({ assetRef: expect.stringMatching(/^ast_/u), purpose: 'profile', urlExpiresAt: null, createdAt: new Date(now).toISOString() })
    expect(response.text).not.toContain('cloud://')
    expect(assets(plants.main)).toBe('active|-|first.jpg')
    expect(h.sql("SELECT CONCAT(asset_purpose, '|', content_hash) FROM user_plant_assets;")).toBe(`profile|${sha(jpeg(1))}`)
  })

  test('单株读取带 cover（现场换链接）；列表项 hasCover=true；无封面植物 hasCover=false 且无 cover', async () => {
    const single = await h.call('GET', `/api/v2/user-plants/${plants.main}`)
    expect(single.json.data?.cover).toEqual({ assetRef: expect.stringMatching(/^ast_/u), url: expect.stringContaining('https://cos.example/'), urlExpiresAt: null })
    const listed = (await h.call('GET', '/api/v2/user-plants')).json.data as { items: Array<Record<string, unknown>> }
    expect(listed.items.find(item => item.user_plant_id === plants.main)).toMatchObject({ hasCover: true })
    expect(listed.items.find(item => item.user_plant_id === plants.main)).not.toHaveProperty('cover')
    expect(listed.items.find(item => item.user_plant_id === plants.archived)).toMatchObject({ hasCover: false })
    expect((await h.call('GET', `/api/v2/user-plants/${plants.archived}`)).json.data).not.toHaveProperty('cover')
  })

  test('换封面：旧封面转 pending_cleanup（7 天后可清理），新封面 active；只有一张有效封面', async () => {
    expect((await bind(plants.main, 'second.jpg', jpeg(2), 'cover-key-000002')).status).toBe(200)
    expect(assets(plants.main).split('\n')).toEqual([`pending_cleanup|${now + 7 * day}|first.jpg`, 'active|-|second.jpg'])
    expect(h.sql(`SELECT COUNT(*) FROM user_plant_assets a JOIN user_plants p ON p.id = a.user_plant_internal_id WHERE p.public_user_plant_id = '${plants.main}' AND a.status = 'active';`)).toBe('1')
  })

  test('同一文件已是当前封面：200 返回当前封面，不重复登记；同键同参重放原结果；同键异参 409', async () => {
    const again = await bind(plants.main, 'second.jpg', jpeg(2), 'cover-key-000003')
    expect(again.status).toBe(200)
    expect(assets(plants.main).split('\n')).toHaveLength(2)
    const replay = await bind(plants.main, 'second.jpg', jpeg(2), 'cover-key-000002')
    expect(replay.status).toBe(200)
    expect((await bind(plants.main, 'third.jpg', jpeg(3), 'cover-key-000002')).json.error?.type).toBe('IDEMPOTENCY_CONFLICT')
    expect(assets(plants.main).split('\n')).toHaveLength(2)
  })

  test('他人目录的文件、别处已登记的文件、哈希不符、非图片 → 400，零写入', async () => {
    const before = h.sql('SELECT COUNT(*) FROM user_plant_assets;')
    expect((await bind(plants.main, 'x.jpg', jpeg(4), 'cover-key-000010', harnessUsers.strangerRef)).status).toBe(400)
    expect((await bind(plants.archived, 'second.jpg', jpeg(2), 'cover-key-000011')).status).toBe(400)
    files.set(fileIdOf(owner, 'bad.jpg'), jpeg(5))
    expect((await h.call('POST', `/api/v2/user-plants/${plants.main}/assets`, { key: 'cover-key-000012', body: JSON.stringify({ purpose: 'profile', fileId: fileIdOf(owner, 'bad.jpg'), contentSha256: sha(jpeg(6)) }) })).status).toBe(400)
    expect((await bind(plants.main, 'fake.jpg', new Uint8Array([...Buffer.from('GIF89a')]), 'cover-key-000013')).status).toBe(400)
    expect(h.sql('SELECT COUNT(*) FROM user_plant_assets;')).toBe(before)
  })

  test('归档植物可换封面；删除中/他人植物 → 404', async () => {
    expect((await bind(plants.archived, 'arch.jpg', jpeg(7), 'cover-key-000020')).status).toBe(200)
    expect((await bind(plants.deleting, 'del.jpg', jpeg(8), 'cover-key-000021')).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
    expect((await bind(plants.foreign, 'own.jpg', jpeg(9), 'cover-key-000022')).json.error?.type).toBe('USER_PLANT_NOT_FOUND')
  })

  test('云存储不可用：登记 503 且零写入；单株读取仍成功，cover.url 为 null', async () => {
    storageDown = true
    try {
      const before = h.sql('SELECT COUNT(*) FROM user_plant_assets;')
      expect((await bind(plants.main, 'down.jpg', jpeg(10), 'cover-key-000030')).status).toBe(503)
      expect(h.sql('SELECT COUNT(*) FROM user_plant_assets;')).toBe(before)
      const single = await h.call('GET', `/api/v2/user-plants/${plants.main}`)
      expect(single.status).toBe(200)
      expect(single.json.data?.cover).toEqual({ assetRef: expect.stringMatching(/^ast_/u), url: null, urlExpiresAt: null })
    } finally {
      storageDown = false
    }
  })

  test('脱敏：响应与审计不含 fileID、云存储路径、user_id 或内部字段名', async () => {
    const response = await h.call('GET', `/api/v2/user-plants/${plants.main}`)
    // 合同 §1 唯一例外：平台签发的临时链接 URL 本身含对象路径，只返回给植物主人；其余字段与审计不得出现。
    const { url: _url, ...coverWithoutUrl } = response.json.data!.cover as Record<string, unknown>
    const observed = JSON.stringify({ ...response.json.data, cover: coverWithoutUrl }) + JSON.stringify(h.audits)
    for (const secret of ['cloud://', 'user-plant/usr_', 'storage_file_id', 'content_hash', owner]) { expect(observed).not.toContain(secret) }
  })
})
