import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

import mysql from 'mysql2/promise'

import { runPolicyReleaseCli, type ClosablePolicyReleaseConnection } from '../configuration/policy-release/policy-release-cli.js'

/**
 * 策略发布 CLI 进程入口（由 scripts/policy-release.mjs 打包后执行）。
 * 只在这里接触真实进程：process.argv、process.env、文件系统与 mysql2；业务逻辑全部在 policy-release-cli.ts，便于替换边界测试。
 */

/** 自当前目录向上寻找仓库根（同时包含 cloudfunctions-v2 与 docs 目录）。 */
function findRepositoryRoot(start: string): string {
  let current = resolve(start)
  for (;;) {
    if (existsSync(join(current, 'cloudfunctions-v2')) && existsSync(join(current, 'docs'))) { return current }
    const parent = dirname(current)
    if (parent === current) { throw new Error('找不到仓库根目录') }
    current = parent
  }
}

const repositoryRoot = findRepositoryRoot(process.cwd())

/** 按连接参数建立单条 mysql2 连接，并适配为 CLI 连接端口（query 直接返回结果）。 */
async function connect(config: { readonly host: string; readonly port: number; readonly database: string; readonly user: string; readonly password: string }): Promise<ClosablePolicyReleaseConnection> {
  const connection = await mysql.createConnection({ host: config.host, port: config.port, database: config.database, user: config.user, password: config.password,
    supportBigNumbers: true, bigNumberStrings: true, multipleStatements: false, charset: 'utf8mb4' })
  return {
    query: async (sql, parameters) => (await connection.query(sql, parameters as unknown[] | undefined))[0],
    beginTransaction: () => connection.beginTransaction(),
    commit: () => connection.commit(),
    rollback: () => connection.rollback(),
    end: () => connection.end()
  }
}

runPolicyReleaseCli(process.argv.slice(2), {
  environment: process.env,
  readFile: path => readFileSync(resolve(process.cwd(), path), 'utf8'),
  readRepoFile: relativePath => readFileSync(join(repositoryRoot, relativePath), 'utf8'),
  connect,
  now: () => Date.now(),
  write: text => { process.stdout.write(text) }
}).then(code => { process.exitCode = code }, () => { process.exitCode = 70 })
