'use strict'

const mysql = require('mysql2/promise')

const DEV_SCHEMA = 'cloud1_dev'
const PROD_SCHEMA = 'cloud1-2grufevs395a9d5e'

let sharedPool = null

function quoteIdentifier(name) {
  const safe = String(name || '').replace(/`/g, '')
  return `\`${safe}\``
}

function tableName(schema, table) {
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`
}

function getPool() {
  if (sharedPool) return sharedPool

  sharedPool = mysql.createPool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || PROD_SCHEMA,
    waitForConnections: true,
    connectionLimit: Number(process.env.DB_POOL_SIZE || 5),
    queueLimit: 0,
    charset: 'utf8mb4'
  })

  return sharedPool
}

async function withTransaction(handler) {
  const pool = getPool()
  const connection = await pool.getConnection()
  try {
    await connection.beginTransaction()
    const result = await handler(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

async function listTableColumns(connectionOrPool, schema, table) {
  const [rows] = await connectionOrPool.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION ASC
    `,
    [schema, table]
  )

  return rows.map(item => item.COLUMN_NAME)
}

async function listTablePrimaryOrUniqueColumns(connectionOrPool, schema, table) {
  const [rows] = await connectionOrPool.query(
    `
      SELECT DISTINCT COLUMN_NAME
      FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
        AND CONSTRAINT_NAME IN (
          SELECT CONSTRAINT_NAME
          FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS
          WHERE TABLE_SCHEMA = ?
            AND TABLE_NAME = ?
            AND CONSTRAINT_TYPE IN ('PRIMARY KEY', 'UNIQUE')
        )
      ORDER BY ORDINAL_POSITION ASC
    `,
    [schema, table, schema, table]
  )

  return rows.map(item => item.COLUMN_NAME)
}

async function closePool() {
  if (!sharedPool) return
  await sharedPool.end()
  sharedPool = null
}

module.exports = {
  DEV_SCHEMA,
  PROD_SCHEMA,
  getPool,
  withTransaction,
  quoteIdentifier,
  tableName,
  listTableColumns,
  listTablePrimaryOrUniqueColumns,
  closePool
}

