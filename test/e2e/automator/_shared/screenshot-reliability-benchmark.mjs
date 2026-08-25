#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { captureFormalScreenshot } from './formal-leaf-screenshot.mjs'

// “拉起即用”压力门禁要求每次首拍成功；任何恢复或失败都不能记为稳定通过。
export const SCREENSHOT_RELIABILITY_TARGET = 1

function numberArg(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export async function runScreenshotReliabilityBenchmark({
  wsEndpoint = process.env.MINIPROGRAM_AUTOMATOR_WS || 'ws://127.0.0.1:9421',
  projectPath = process.env.MP_PROJECT_PATH,
  attempts = 25,
  timeoutMs = 12_000,
  outputDirectory = path.join(os.tmpdir(), `planting-screenshot-reliability-${Date.now()}`),
  capture = captureFormalScreenshot
} = {}) {
  fs.mkdirSync(outputDirectory, { recursive: true })
  const results = []
  for (let index = 1; index <= attempts; index += 1) {
    const outputPath = path.join(
      outputDirectory,
      `screenshot-${String(index).padStart(3, '0')}.png`
    )
    const result = await capture({
      wsEndpoint,
      outputPath,
      projectPath,
      timeoutMs,
      maxAttempts: 2
    })
    results.push({
      index,
      status: result.status,
      successful_attempt: result.successful_attempt || null,
      attempts: result.attempts || [],
      output_path: outputPath
    })
  }
  const passed = results.filter(item => item.status === 'passed').length
  const firstAttemptPassed = results.filter(item => item.attempts?.[0]?.status === 'passed').length
  const recovered = results.filter(item => item.successful_attempt > 1).length
  const successRate = attempts > 0 ? passed / attempts : 0
  return {
    status:
      successRate >= SCREENSHOT_RELIABILITY_TARGET &&
      firstAttemptPassed === attempts &&
      recovered === 0
        ? 'passed'
        : 'failed',
    target: SCREENSHOT_RELIABILITY_TARGET,
    attempts,
    passed,
    failed: attempts - passed,
    success_rate: successRate,
    first_attempt_passed: firstAttemptPassed,
    first_attempt_success_rate: attempts > 0 ? firstAttemptPassed / attempts : 0,
    recovered_attempts: recovered,
    output_directory: outputDirectory,
    results
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const report = await runScreenshotReliabilityBenchmark({
    attempts: numberArg(process.env.MP_SCREENSHOT_RELIABILITY_ATTEMPTS, 25),
    timeoutMs: numberArg(process.env.MP_SCREENSHOT_TIMEOUT_MS, 12_000)
  })
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.status !== 'passed') {
    process.exitCode = 1
  }
}
