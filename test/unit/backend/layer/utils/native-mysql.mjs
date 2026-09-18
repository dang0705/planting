import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const nativeMysql = require('../../../../../cloudfunctions/layer/utils/native-mysql.js')

assert.throws(
  () => nativeMysql.resolveNativeMysqlConfig({ DB_HOST: 'db', DB_USER: 'user', DB_NAME: 'schema' }),
  error => error.code === 'NATIVE_MYSQL_CONFIG_MISSING' && error.statusCode === 503
)

const config = nativeMysql.resolveNativeMysqlConfig({
  DB_HOST: 'db.internal',
  DB_PORT: '3307',
  DB_USER: 'app_user',
  DB_PASSWORD: 'secret-only-in-test-memory',
  DB_NAME: 'cloud1_dev',
  DB_POOL_SIZE: '99'
})
assert.equal(config.host, 'db.internal')
assert.equal(config.port, 3307)
assert.equal(config.connectionLimit, 10)
assert.equal(config.database, 'cloud1_dev')
assert.equal(config.queueLimit, 0)
assert.equal(config.connectTimeout, 8000)
assert.throws(() => nativeMysql.quoteIdentifier('plant_images; DROP TABLE users'), /不安全/)
assert.equal(nativeMysql.quoteIdentifier('user_plant_instances'), '`user_plant_instances`')

const calls = []
const connection = {
  async beginTransaction() {
    calls.push('begin')
  },
  async commit() {
    calls.push('commit')
  },
  async rollback() {
    calls.push('rollback')
  },
  release() {
    calls.push('release')
  }
}
const pool = { getConnection: async () => connection }
const result = await nativeMysql.withNativeTransaction(
  async current => {
    assert.equal(current, connection)
    return 'committed'
  },
  { pool }
)
assert.equal(result, 'committed')
assert.deepEqual(calls, ['begin', 'commit', 'release'])

calls.length = 0
await assert.rejects(
  nativeMysql.withNativeTransaction(
    async () => {
      throw new Error('write failed')
    },
    { pool }
  ),
  /write failed/
)
assert.deepEqual(calls, ['begin', 'rollback', 'release'])

console.log('native mysql transaction tests passed')
