#!/usr/bin/env node

import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(__dirname, '..', '..')
const HTTP_FUNCTIONS = [
  'diagnose-http',
  'plant-catalog-http',
  'plant-user-http',
  'identify-http',
  'diagnosis-history-http',
  'auth-user-http',
  'weather-http',
  'storage-http'
]

function parseArgs(argv = []) {
  const functions = []

  argv.forEach(arg => {
    const [key, ...rest] = String(arg || '').split('=')
    const value = rest.join('=').trim()
    if ((key === '--function' || key === '--functions') && value) {
      functions.push(...value.split(',').map(item => item.trim()).filter(Boolean))
    }
  })

  return functions.length ? functions : HTTP_FUNCTIONS
}

function runNpmInstall(functionName) {
  const cwd = path.join(projectRoot, 'cloudfunctions', functionName)
  const packageJsonPath = path.join(cwd, 'package.json')
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`缺少 package.json: ${packageJsonPath}`)
  }

  const command = fs.existsSync(path.join(cwd, 'package-lock.json')) ? 'npm ci' : 'npm install'
  process.stdout.write(`\n[${functionName}] ${command}\n`)

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      cwd,
      stdio: 'inherit',
      shell: true
    })

    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`[${functionName}] ${command} 失败，退出码 ${code}`))
    })
  })
}

async function main() {
  const selected = parseArgs(process.argv.slice(2))
  const unknown = selected.filter(name => !HTTP_FUNCTIONS.includes(name))
  if (unknown.length) {
    throw new Error(`未知 HTTP 云函数: ${unknown.join(', ')}`)
  }

  for (const functionName of selected) {
    await runNpmInstall(functionName)
  }
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
