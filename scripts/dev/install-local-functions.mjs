#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')

function runRootInstall() {
  const args = ['install', '--legacy-peer-deps']
  process.stdout.write(`\n[root] npm ${args.join(' ')}\n`)
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, {
      cwd: projectRoot,
      stdio: 'inherit',
      shell: false
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`[root] npm ${args.join(' ')} 失败，退出码 ${code}`))
    })
  })
}

async function main() {
  process.stdout.write(
    '本地云函数依赖统一安装在项目根目录 node_modules。\n' +
    '各 cloudfunctions/*/package.json 仍保留线上部署依赖声明，不再为本地调试逐个安装函数目录 node_modules。\n'
  )
  await runRootInstall()
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
