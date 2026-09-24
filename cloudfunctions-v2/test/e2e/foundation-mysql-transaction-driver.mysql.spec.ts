import { spawnSync } from 'node:child_process'

import { createPool, type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { runDatabaseTransaction } from '../../src/foundation/database/transaction-runner.js'
import { createMysqlTransactionDriver } from '../../src/foundation/database/mysql-transaction-driver.js'
const mysqlImage = 'mysql:8.4'
const databaseName = 'qinghuazhi_v2_foundation_transaction_driver'
const containerName = `qhz-v2-foundation-tx-${String(process.pid)}`
const readinessAttempts = Number('60')
const readinessIntervalMs = Number('250')
const setupTimeoutMs = 30_000

let writerPool: Pool | undefined
let readerPool: Pool | undefined

type TransactionProbeRow = RowDataPacket & {
  /** 独立读连接返回的测试事务业务引用。 */
  readonly probe_ref: string
}

/** 执行隔离 MySQL 的 Docker CLI 命令；错误输出只用于本地测试失败诊断。 */
function runDocker(args: readonly string[], input?: string): string {
  const result = spawnSync('docker', [...args], {
    encoding: 'utf8',
    input: input,
    maxBuffer: Number('10485760')
  })
  if (result.status !== Number('0')) {
    throw new Error(`隔离 MySQL Docker 命令失败：${result.stderr || result.stdout}`)
  }
  return result.stdout.trim()
}

/** 在有界时间内等待容器内 MySQL 接受真实查询。 */
async function waitForMysql(): Promise<void> {
  for (let attempt = Number('0'); attempt < readinessAttempts; attempt += Number('1')) {
    const result = spawnSync(
      'docker',
      [
        'exec',
        containerName,
        'mysql',
        '--no-defaults',
        '-uroot',
        '--batch',
        '--skip-column-names',
        '-e',
        'SELECT @@port;'
      ],
      { encoding: 'utf8' }
    )
    if (result.status === Number('0') && result.stdout.trim() === '3306') {
      return
    }
    await new Promise(resolve => setTimeout(resolve, readinessIntervalMs))
  }
  throw new Error('隔离 MySQL 未能在有界等待时间内就绪')
}

/** 创建仅供本测试使用的数据库和事务探针表，不应用业务迁移。 */
function createProbeTable(): void {
  runDocker(
    ['exec', '-i', containerName, 'mysql', '--no-defaults', '-uroot'],
    [
      `CREATE DATABASE \`${databaseName}\`;`,
      `USE \`${databaseName}\`;`,
      'CREATE TABLE transaction_probe (',
      '  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,',
      '  probe_ref VARCHAR(80) NOT NULL,',
      '  UNIQUE KEY uq_transaction_probe_ref (probe_ref)',
      ') ENGINE=InnoDB;',
      "INSERT INTO transaction_probe (probe_ref) VALUES ('already_exists');"
    ].join('\n')
  )
}

/** 解析 Docker 随机分配的本机端口，避免并行测试争抢固定端口。 */
function resolvePublishedPort(): number {
  const output = runDocker(['port', containerName, '3306/tcp'])
  const port = Number(output.split(':').at(Number('-1')))
  if (!Number.isSafeInteger(port) || port <= Number('0')) {
    throw new Error('无法解析隔离 MySQL 的本机映射端口')
  }
  return port
}

/**
 * 测试层次：L3 / `unit_real_data`；经过真实事务运行器、真实 MySQL 8.4 和 InnoDB，读回使用独立连接池。
 * 替换边界：仅以本地一次性 MySQL 替代 CloudBase MySQL；不连接 HTTP、CloudBase 或业务 Repository。
 */
describe('Foundation MySQL 事务驱动真实读回', () => {
  beforeAll(async () => {
    runDocker([
      'run',
      '--detach',
      '--rm',
      '--name',
      containerName,
      '--tmpfs',
      '/var/lib/mysql',
      '--publish',
      '127.0.0.1::3306',
      '--env',
      'MYSQL_ALLOW_EMPTY_PASSWORD=yes',
      mysqlImage
    ])
    await waitForMysql()
    createProbeTable()
    const port = resolvePublishedPort()
    writerPool = createPool({
      host: '127.0.0.1',
      port: port,
      user: 'root',
      database: databaseName,
      connectionLimit: Number('1')
    })
    readerPool = createPool({
      host: '127.0.0.1',
      port: port,
      user: 'root',
      database: databaseName,
      connectionLimit: Number('1')
    })
  }, setupTimeoutMs)

  afterAll(async () => {
    await writerPool?.end()
    await readerPool?.end()
    spawnSync('docker', ['rm', '--force', containerName], { encoding: 'utf8' })
  })

  test('成功提交后由独立 MySQL 连接读回唯一结果', async () => {
    if (writerPool === undefined || readerPool === undefined) {
      throw new Error('真实 MySQL 连接池未初始化')
    }
    const driver = createMysqlTransactionDriver<PoolConnection>(writerPool, () => undefined)

    await runDatabaseTransaction(driver, async transaction => {
      await transaction.connection.execute('INSERT INTO transaction_probe (probe_ref) VALUES (?)', [
        'commit_visible'
      ])
    })

    const [rows] = await readerPool.execute<TransactionProbeRow[]>(
      'SELECT probe_ref FROM transaction_probe WHERE probe_ref = ?',
      ['commit_visible']
    )
    expect(rows).toEqual([{ probe_ref: 'commit_visible' }])
  })

  test('真实 SQL 唯一约束失败后回滚，独立连接读回没有半写记录', async () => {
    if (writerPool === undefined || readerPool === undefined) {
      throw new Error('真实 MySQL 连接池未初始化')
    }
    const driver = createMysqlTransactionDriver<PoolConnection>(writerPool, () => undefined)

    await expect(
      runDatabaseTransaction(driver, async transaction => {
        await transaction.connection.execute(
          'INSERT INTO transaction_probe (probe_ref) VALUES (?)',
          ['must_rollback']
        )
        await transaction.connection.execute(
          'INSERT INTO transaction_probe (probe_ref) VALUES (?)',
          ['already_exists']
        )
      })
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' })

    const [rows] = await readerPool.execute<TransactionProbeRow[]>(
      'SELECT probe_ref FROM transaction_probe WHERE probe_ref = ?',
      ['must_rollback']
    )
    expect(rows).toEqual([])
  })
})
