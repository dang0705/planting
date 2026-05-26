#!/usr/bin/env node

import { spawn } from 'node:child_process'

function parseArgs(argv = []) {
  const separatorIndex = argv.indexOf('--')
  const envArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : []
  const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv
  const env = {}

  envArgs.forEach(arg => {
    const separator = String(arg || '').indexOf('=')
    if (separator <= 0) {
      return
    }
    const key = arg.slice(0, separator).trim()
    const value = arg.slice(separator + 1)
    if (key) {
      env[key] = value
    }
  })

  return { env, command }
}

async function main() {
  const { env, command } = parseArgs(process.argv.slice(2))
  if (!command.length) {
    throw new Error('缺少待执行命令，示例：node scripts/dev/run-env.mjs VITE_APP_ENV=development -- uni -p mp-weixin')
  }

  const child = spawn(command[0], command.slice(1), {
    env: {
      ...process.env,
      ...env
    },
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`子进程退出码 ${code}`))
    })
  })
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
