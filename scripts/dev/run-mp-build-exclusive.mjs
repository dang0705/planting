#!/usr/bin/env node

import { spawn } from 'node:child_process'
import { lstat, mkdir, readFile, rm, stat, writeFile, rename } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { assertMpWeixinScopedStyleConsistency } from './mp-weixin-output-validation.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const lockRoot = path.join(projectRoot, '.tmp', 'build-locks')
const lockPath = path.join(lockRoot, 'mp-weixin-build.lock')
const lockMetadataPath = path.join(lockPath, 'owner.json')
const staleLockGraceMs = 60_000

function fail(code, message) {
  const error = new Error(message)
  error.code = code
  throw error
}

function parseCommand(argv) {
  const separatorIndex = argv.indexOf('--')
  const command = separatorIndex >= 0 ? argv.slice(separatorIndex + 1) : argv
  if (!command.length) {
    fail(
      'mp_build_command_missing',
      '缺少构建命令，示例：node scripts/dev/run-mp-build-exclusive.mjs -- uni build -p mp-weixin'
    )
  }
  return command
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (error?.code === 'EPERM') {
      return true
    }
    return false
  }
}

async function readLockMetadata() {
  try {
    return JSON.parse(await readFile(lockMetadataPath, 'utf8'))
  } catch {
    return null
  }
}

async function lockAgeMs() {
  try {
    const lockStat = await stat(lockPath)
    return Math.max(0, Date.now() - lockStat.birthtimeMs)
  } catch {
    return 0
  }
}

async function recoverDeadLock() {
  const lockStat = await lstat(lockPath).catch(error => {
    if (error?.code === 'ENOENT') {
      return null
    }
    throw error
  })
  if (!lockStat) {
    return false
  }
  if (!lockStat.isDirectory()) {
    fail('mp_build_lock_corrupt', `构建锁不是目录，已拒绝覆盖：${lockPath}`)
  }

  const metadata = await readLockMetadata()
  const ownerPid = Number(metadata?.pid)
  if (isProcessAlive(ownerPid)) {
    fail(
      'mp_build_in_progress',
      `mp-weixin 构建已在运行（pid=${ownerPid}，started_at=${metadata?.startedAt || 'unknown'}），本次构建立即停止以保护共享产物`
    )
  }

  const age = await lockAgeMs()
  if (metadata && !Number.isInteger(ownerPid)) {
    fail('mp_build_lock_corrupt', `构建锁 owner.json 无有效 pid，已拒绝接管：${lockPath}`)
  }
  if (!metadata && age < staleLockGraceMs) {
    fail(
      'mp_build_lock_unreadable',
      `构建锁暂时没有可验证 owner（age_ms=${Math.round(age)}），已拒绝并发接管：${lockPath}`
    )
  }

  await rm(lockPath, { recursive: true, force: false })
  return true
}

async function acquireLock(command) {
  await mkdir(lockRoot, { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await mkdir(lockPath)
      const metadata = {
        schemaVersion: 1,
        pid: process.pid,
        startedAt: new Date().toISOString(),
        cwd: projectRoot,
        command
      }
      await writeFile(`${lockMetadataPath}.tmp-${process.pid}`, JSON.stringify(metadata), 'utf8')
      await rename(`${lockMetadataPath}.tmp-${process.pid}`, lockMetadataPath)
      return metadata
    } catch (error) {
      if (error?.code !== 'EEXIST' || attempt > 0) {
        throw error
      }
      await recoverDeadLock()
    }
  }
  fail('mp_build_lock_unavailable', `无法取得 mp-weixin 构建锁：${lockPath}`)
}

async function releaseLock() {
  const metadata = await readLockMetadata()
  if (Number(metadata?.pid) !== process.pid) {
    return
  }
  await rm(lockPath, { recursive: true, force: false })
}

async function validateBuildOutput() {
  const outputDir = path.resolve(
    projectRoot,
    process.env.UNI_OUTPUT_DIR || path.join('dist', 'build', 'mp-weixin')
  )
  const appJsonPath = path.join(outputDir, 'app.json')
  const vendorPath = path.join(outputDir, 'common', 'vendor.js')
  const contractPath = path.join(outputDir, 'mp-e2e.contract.json')
  const [appJson, vendorSource, contractSource] = await Promise.all([
    readFile(appJsonPath, 'utf8'),
    readFile(vendorPath, 'utf8'),
    readFile(contractPath, 'utf8')
  ])
  JSON.parse(appJson)
  const contract = JSON.parse(contractSource)
  if (contract?.contractVersion !== 1 || contract?.platform !== 'wechat-miniprogram') {
    fail('mp_build_contract_invalid', `编译产物缺少有效 mp-e2e.contract.json：${contractPath}`)
  }
  const esbuild = await import('esbuild')
  await esbuild.transform(vendorSource, {
    loader: 'js',
    target: 'es2020',
    logLevel: 'silent'
  })
  const vendorStat = await stat(vendorPath)
  if (vendorStat.size === 0) {
    fail('mp_build_vendor_empty', `构建产物 vendor.js 为空：${vendorPath}`)
  }
  try {
    assertMpWeixinScopedStyleConsistency(outputDir)
  } catch (error) {
    fail(error.code || 'mp_build_output_invalid', error.message)
  }
  return {
    outputDir,
    appJsonBytes: Buffer.byteLength(appJson),
    vendorBytes: vendorStat.size
  }
}

async function runChild(command) {
  const child = spawn(command[0], command.slice(1), {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })
  let forwardedSignal = false
  const forwardSignal = signal => {
    if (forwardedSignal) {
      return
    }
    forwardedSignal = true
    child.kill(signal)
  }
  const onSigint = () => forwardSignal('SIGINT')
  const onSigterm = () => forwardSignal('SIGTERM')
  process.once('SIGINT', onSigint)
  process.once('SIGTERM', onSigterm)

  const result = await new Promise((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code, signal) => resolve({ code, signal }))
  })
  process.removeListener('SIGINT', onSigint)
  process.removeListener('SIGTERM', onSigterm)
  if (result.code !== 0) {
    fail(
      'mp_build_failed',
      `mp-weixin 构建失败：code=${result.code ?? 'null'} signal=${result.signal || 'none'}`
    )
  }
}

async function main() {
  const command = parseCommand(process.argv.slice(2))
  await acquireLock(command)
  try {
    await runChild(command)
    const output = await validateBuildOutput()
    process.stdout.write(
      `mp-weixin build ready: ${JSON.stringify({ ...output, lock: lockPath })}\n`
    )
  } finally {
    await releaseLock()
  }
}

main().catch(error => {
  process.stderr.write(`${error.code || 'mp_build_error'}: ${String(error.message || error)}\n`)
  process.exit(1)
})
