import { expect, test, vi } from 'vitest'
import { createMysqlAuthenticatedEphemeralCaseOwnershipReader } from '../../src/user-plant/repository/mysql-authenticated-ephemeral-case-ownership-reader.js'
import type { Mysql2QueryConnection } from '../../src/foundation/database/mysql2-connection-source.js'

/** L1/unit_fake；独立Expected为归属读取合同。真实Reader与连接生命周期，替换SQL执行，不证明MySQL或身份验真。 */
const input = { userRef: 'usr_owner_fixture001', ephemeralCaseRef: 'epc_owned_fixture001' }
function fixture(rows: readonly Record<string, unknown>[] = [{ owned: 1 }]) {
  const connection = { query: vi.fn(async () => rows), execute: vi.fn(), beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), destroy: vi.fn() } as unknown as Mysql2QueryConnection
  const source = { getConnection: vi.fn(async () => connection) }
  return { connection, source, reader: createMysqlAuthenticatedEphemeralCaseOwnershipReader(source) }
}
test('归属存在只返回类别，单SELECT零写且释放连接', async () => {
  const f = fixture(); expect(await f.reader.readOwned(input)).toEqual({ status: 'owned' })
  expect(f.connection.query).toHaveBeenCalledOnce()
  expect(f.connection.query).toHaveBeenCalledWith(expect.not.stringMatching(/FOR UPDATE|INSERT|UPDATE|DELETE/iu), [input.userRef, input.ephemeralCaseRef])
  expect(f.connection.execute).not.toHaveBeenCalled(); expect(f.connection.beginTransaction).not.toHaveBeenCalled(); expect(f.connection.release).toHaveBeenCalledOnce()
})
test('不可见或不存在使用统一not_found', async () => {
  expect(await fixture([]).reader.readOwned(input)).toEqual({ status: 'not_found' })
})
test.each([[{ owned: 1 }, { owned: 1 }], [{ owned: '1' }], [{ owned: 0 }], [{ owned: 1, internalId: 17 }]].map(rows => ({ rows })))('损坏或额外字段不透传且不授权：%j', async ({ rows }) => {
  expect(await fixture(rows).reader.readOwned(input)).toEqual({ status: 'unavailable' })
})
test.each([null, {}, { ...input, userRef: '' }, { ...input, ephemeralCaseRef: 'x'.repeat(65) }, { ...input, userRef: '用户' }, { ...input, userRef: 'a b' }, { ...input, nowMs: 0 }])('非法输入不建连：%j', async value => {
  const f = fixture(); await expect(f.reader.readOwned(value as never)).rejects.toThrow(); expect(f.source.getConnection).not.toHaveBeenCalled()
})
test('等待连接时修改原输入不改变已锁定归属', async () => {
  const f = fixture(); let release!: () => void
  f.source.getConnection.mockImplementationOnce(async () => { await new Promise<void>(r => { release = r }); return f.connection })
  const mutable = { ...input }, work = f.reader.readOwned(mutable); mutable.userRef = 'usr_other_fixture001'; release()
  expect(await work).toEqual({ status: 'owned' }); expect(f.connection.query).toHaveBeenCalledWith(expect.any(String), [input.userRef, input.ephemeralCaseRef])
})
test('查询错误销毁连接，稳定不可用且不重试或透传原文', async () => {
  const f = fixture(); vi.mocked(f.connection.query).mockRejectedValue(new Error('restricted database detail'))
  expect(await f.reader.readOwned(input)).toEqual({ status: 'unavailable' }); expect(f.connection.destroy).toHaveBeenCalledOnce(); expect(f.connection.release).not.toHaveBeenCalled(); expect(f.source.getConnection).toHaveBeenCalledOnce()
})
test('建连失败稳定不可用且不重试', async () => {
  const f = fixture(); f.source.getConnection.mockRejectedValue(new Error('credential detail'))
  expect(await f.reader.readOwned(input)).toEqual({ status: 'unavailable' }); expect(f.source.getConnection).toHaveBeenCalledOnce()
})
