import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import mysql from 'mysql2/promise'

import {
  runVisualFilterIndexCli,
  type ClosableVisualFilterIndexConnection
} from '../plant-knowledge/visual-filter-index/visual-filter-index-cli.js'

/**
 * 三轴筛选索引回填 CLI 进程入口（由 scripts/visual-filter-index.mjs 打包后执行）。
 * 只在这里接触真实进程：process.argv、process.env、文件系统与 mysql2；逻辑在 visual-filter-index-cli.ts。
 */

/** 自当前目录向上寻找仓库根（同时包含 cloudfunctions-v2 与 docs 目录）。 */
function findRepositoryRoot(start: string): string {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, 'cloudfunctions-v2')) && existsSync(join(current, 'docs'))) {
      return current
    }
    const parent = dirname(current)
    if (parent === current) {
      throw new Error('找不到仓库根目录')
    }
    current = parent
  }
}

const repositoryRoot = findRepositoryRoot(process.cwd())

/** 建立单条 mysql2 连接并适配为回填连接端口。 */
async function connect(config: {
  readonly host: string
  readonly port: number
  readonly database: string
  readonly user: string
  readonly password: string
}): Promise<ClosableVisualFilterIndexConnection> {
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    supportBigNumbers: true,
    bigNumberStrings: true,
    multipleStatements: false,
    charset: 'utf8mb4'
  })
  return {
    query: async (sql, parameters) =>
      (await connection.query(sql, parameters as unknown[]))[0] as never,
    execute: async (sql, parameters) => {
      await connection.query(sql, parameters as unknown[])
    },
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    end: () => connection.end()
  }
}

runVisualFilterIndexCli(process.argv.slice(2), {
  environment: process.env,
  readFile: path => readFileSync(resolve(process.cwd(), path), 'utf8'),
  readRepoFile: relativePath => readFileSync(join(repositoryRoot, relativePath), 'utf8'),
  connect,
  now: () => Date.now(),
  write: text => {
    process.stdout.write(text)
  }
}).then(
  code => {
    process.exitCode = code
  },
  () => {
    process.exitCode = 70
  }
)
