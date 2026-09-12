#!/usr/bin/env node

import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { validateMpPlatformOutput } from './validate-mp-platform-output.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

function parseArgs(argv) {
  const separatorIndex = argv.indexOf('--')
  const optionArgs = separatorIndex >= 0 ? argv.slice(0, separatorIndex) : argv
  const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : []
  const options = { platform: '', outputDir: '' }
  for (const arg of optionArgs) {
    const [key, ...parts] = String(arg || '').split('=')
    const value = parts.join('=').trim()
    if (key === '--platform') options.platform = value
    if (key === '--output-dir') options.outputDir = value
  }
  return { options, command }
}

function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0], command.slice(1), {
      cwd: projectRoot,
      env: process.env,
      stdio: 'inherit',
      shell: process.platform === 'win32'
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
}

async function main() {
  const { options, command } = parseArgs(process.argv.slice(2))
  if (!options.platform || !command.length) {
    throw new Error(
      '用法：node scripts/dev/run-mp-platform-build.mjs --platform=mp-toutiao -- uni build -p mp-toutiao'
    )
  }
  const result = await run(command)
  if (result.code !== 0) {
    throw new Error(
      `小程序构建失败：code=${result.code ?? 'null'} signal=${result.signal || 'none'}`
    )
  }
  const output = validateMpPlatformOutput({
    platform: options.platform,
    outputDir: options.outputDir || path.join('dist', 'build', options.platform)
  })
  process.stdout.write(`mp platform build ready: ${JSON.stringify(output)}\n`)
}

main().catch(error => {
  process.stderr.write(`${error.message}\n`)
  process.exit(1)
})
