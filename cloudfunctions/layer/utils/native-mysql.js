'use strict'

const mysql = require('mysql2/promise')

const REQUIRED_CONFIG_KEYS = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']
let sharedPool = null

function createConfigurationError(missingKeys) {
  const error = new Error('删除服务数据库配置未完成，请稍后重试')
  error.code = 'NATIVE_MYSQL_CONFIG_MISSING'
  error.statusCode = 503
  error.missingKeys = missingKeys
  return error
}

function resolveNativeMysqlConfig(env = process.env) {
  const missingKeys = REQUIRED_CONFIG_KEYS.filter(key => !String(env[key] || '').trim())
  if (missingKeys.length) {
    throw createConfigurationError(missingKeys)
  }

  const port = Number(env.DB_PORT || 3306)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('删除服务数据库配置无效，请稍后重试')
    error.code = 'NATIVE_MYSQL_CONFIG_INVALID'
    error.statusCode = 503
    throw error
  }

  return {
    host: String(env.DB_HOST).trim(),
    port,
    user: String(env.DB_USER).trim(),
    password: String(env.DB_PASSWORD),
    database: String(env.DB_NAME).trim(),
    waitForConnections: true,
    connectionLimit: Math.max(1, Math.min(10, Number(env.DB_POOL_SIZE) || 3)),
    queueLimit: 0,
    connectTimeout: 8000,
    charset: 'utf8mb4'
  }
}

function getNativeMysqlPool() {
  if (!sharedPool) {
    sharedPool = mysql.createPool(resolveNativeMysqlConfig())
  }
  return sharedPool
}

function quoteIdentifier(value) {
  const normalized = String(value || '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(normalized)) {
    throw new Error('不安全的数据库标识符')
  }
  return `\`${normalized}\``
}

async function withNativeTransaction(handler, { pool = getNativeMysqlPool() } = {}) {
  const connection = await pool.getConnection()
  let started = false
  try {
    await connection.beginTransaction()
    started = true
    const result = await handler(connection)
    await connection.commit()
    return result
  } catch (error) {
    if (started) {
      await connection.rollback().catch(() => {})
    }
    throw error
  } finally {
    connection.release()
  }
}

async function closeNativeMysqlPool() {
  if (!sharedPool) {
    return
  }
  await sharedPool.end()
  sharedPool = null
}

module.exports = {
  REQUIRED_CONFIG_KEYS,
  resolveNativeMysqlConfig,
  getNativeMysqlPool,
  quoteIdentifier,
  withNativeTransaction,
  closeNativeMysqlPool
}
