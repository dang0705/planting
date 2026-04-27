'use strict'

const fs = require('fs')
const path = require('path')

function parseArgs(argv = []) {
  const args = {}
  for (const item of argv) {
    if (!item.startsWith('--')) continue
    const [key, ...rest] = item.slice(2).split('=')
    args[key] = rest.length ? rest.join('=') : 'true'
  }
  return args
}

function resolveSqlFiles(dirPath) {
  return fs
    .readdirSync(dirPath)
    .filter(file => file.endsWith('.sql'))
    .sort((left, right) => left.localeCompare(right, 'en'))
    .map(file => path.join(dirPath, file))
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const importDir = path.resolve(process.cwd(), args.dir || path.join('tmp', 'import-sql'))
  const appEnv = args.appEnv || process.env.APP_ENV || 'development'

  process.env.APP_ENV = appEnv

  if (!process.env.CLOUDBASE_ENV_ID && !process.env.TCB_ENV) {
    throw new Error('缺少 CLOUDBASE_ENV_ID / TCB_ENV')
  }

  if (!process.env.CLOUDBASE_SECRET_ID || !process.env.CLOUDBASE_SECRET_KEY) {
    throw new Error('缺少 CLOUDBASE_SECRET_ID / CLOUDBASE_SECRET_KEY')
  }

  const { models } = require(path.resolve(
    process.cwd(),
    'cloudfunctions/layer/utils/cloudbase.js'
  ))

  const sqlFiles = resolveSqlFiles(importDir)
  if (!sqlFiles.length) {
    throw new Error(`目录下没有可执行的 SQL 文件: ${importDir}`)
  }

  const results = []

  for (const filePath of sqlFiles) {
    const sql = fs.readFileSync(filePath, 'utf8').trim()
    if (!sql) continue

    const response = await models.$runSQL(sql)
    const executeResultList = response?.data?.executeResultList || []
    const rowsAffected = executeResultList.reduce((sum, item) => {
      return sum + Number(item?.rowsAffected || 0)
    }, 0)

    results.push({
      file: path.basename(filePath),
      rowsAffected,
      resultCount: executeResultList.length
    })
  }

  process.stdout.write(JSON.stringify({
    ok: true,
    appEnv,
    importDir,
    fileCount: results.length,
    results
  }, null, 2))
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
