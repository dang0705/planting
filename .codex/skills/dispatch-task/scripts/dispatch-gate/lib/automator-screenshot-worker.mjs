#!/usr/bin/env node

import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs'

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function emit(result) {
  process.stdout.write(`${JSON.stringify(result)}\n`)
}

function isNonEmptyPng(filePath) {
  if (!existsSync(filePath) || statSync(filePath).size <= 8) {
    return false
  }
  const descriptor = openSync(filePath, 'r')
  try {
    const bytes = Buffer.alloc(8)
    readSync(descriptor, bytes, 0, 8, 0)
    return bytes.equals(PNG_MAGIC)
  } finally {
    closeSync(descriptor)
  }
}

async function capture({ wsEndpoint, outputPath, timeoutMs }) {
  const imported = await import('miniprogram-automator')
  const automator = imported.default ?? imported['module.exports'] ?? imported
  let miniProgram = null
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    try {
      miniProgram?.disconnect?.()
    } catch {
      // Parent has the hard deadline and owns forced worker termination.
    }
  }, timeoutMs)
  try {
    miniProgram = await automator.connect({ wsEndpoint })
    await miniProgram.screenshot({ path: outputPath })
    if (timedOut) {
      return { status: 'timeout', error: `worker timeout after ${timeoutMs}ms` }
    }
    if (!isNonEmptyPng(outputPath)) {
      return { status: 'failed', error: 'screenshot_file_missing_empty_or_not_png' }
    }
    return { status: 'passed', path: outputPath, bytes: statSync(outputPath).size }
  } catch (error) {
    return { status: timedOut ? 'timeout' : 'failed', error: String(error?.message ?? error) }
  } finally {
    clearTimeout(timer)
    try {
      await miniProgram?.disconnect?.()
    } catch {
      // Best-effort disposal in the disposable worker only.
    }
  }
}

const [, , wsEndpoint, outputPath, timeoutArg] = process.argv
if (!wsEndpoint || !outputPath) {
  emit({ status: 'failed', error: 'usage: automator-screenshot-worker <wsEndpoint> <outputPath> [timeoutMs]' })
} else {
  capture({ wsEndpoint, outputPath, timeoutMs: Number(timeoutArg) || 20000 })
    .then(emit)
    .catch(error => emit({ status: 'failed', error: String(error?.message ?? error) }))
}
