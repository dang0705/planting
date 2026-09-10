#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { acquireQaRunLease, qaRunLeaseArgs } from './qa-run-lease.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const runtimeScript = path.join(repoRoot, 'scripts', 'qa', 'automator-runtime.mjs')
const QA_COLD_START_EVIDENCE_DEFAULT_TIMEOUT_MS = 30_000
const QA_COLD_START_EXECUTION_BUFFER_MS = 60_000
const QA_REMOTE_READ_DEFAULT_COLD_SAMPLES = 5
const QA_REMOTE_READ_DEFAULT_COLD_INTERVAL_MS = 0
const dispatchGate = path.join(
  repoRoot,
  '.codex',
  'skills',
  'dispatch-task',
  'scripts',
  'dispatch-gate',
  'cli.mjs'
)

function argumentValue(name) {
  const prefix = `--${name}=`
  const inline = process.argv.slice(2).find(value => value.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length)
  }
  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] || '' : ''
}

function runLeaseArguments() {
  const dispatchRunId = argumentValue('dispatch-run-id')
  const runInstanceId = argumentValue('run-instance-id')
  const token = argumentValue('run-lease-token')
  if (!runInstanceId && !token) {
    return []
  }
  if (!dispatchRunId || !runInstanceId || !token) {
    throw new Error('dispatch-run-id、run-instance-id 和 run-lease-token 必须同时提供')
  }
  return [
    `--dispatch-run-id=${dispatchRunId}`,
    `--run-instance-id=${runInstanceId}`,
    `--run-lease-token=${token}`
  ]
}

function safePart(value, fallback) {
  const normalized = String(value || fallback).replace(/[^a-zA-Z0-9._-]/gu, '-')
  return normalized.slice(0, 120)
}

function positiveIntegerEnv(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function nonNegativeIntegerEnv(value, fallback) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback
}

function resolveColdEvidencePath(value) {
  const configuredPath = String(value || '').trim()
  return configuredPath ? path.resolve(repoRoot, configuredPath) : ''
}

function parseLastJson(output) {
  const text = String(output || '').trim()
  try {
    return JSON.parse(text)
  } catch {
    const starts = []
    for (let index = 0; index < text.length; index += 1) {
      if (text[index] === '{') {
        starts.push(index)
      }
    }
    for (let index = starts.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(text.slice(starts[index]))
      } catch {
        // Try the next JSON object start; leaf stdout may precede the terminal record.
      }
    }
  }
  return null
}

function run(command, args, env = process.env) {
  return spawnSync(process.execPath, [command, ...args], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024
  })
}

function blocked(code, message, details = {}) {
  return { status: 'blocked', code, message, details }
}

function main() {
  let leaseArgs
  try {
    leaseArgs = runLeaseArguments()
  } catch (error) {
    process.stdout.write(
      `${JSON.stringify(blocked('qa_run_lease_arguments_incomplete', error.message), null, 2)}\n`
    )
    process.exitCode = 1
    return
  }
  const catalogId = argumentValue('catalog-id')
  if (!catalogId) {
    process.stdout.write(
      `${JSON.stringify(blocked('qa_catalog_id_required', '必须提供 --catalog-id=<catalog id>'), null, 2)}\n`
    )
    process.exitCode = 1
    return
  }
  if (process.argv.includes('--project') || process.argv.includes('--project-path')) {
    process.stdout.write(
      `${JSON.stringify(blocked('qa_runtime_override_forbidden', '单命令 QA 不接受 project 覆盖参数'), null, 2)}\n`
    )
    process.exitCode = 1
    return
  }
  const dispatchRunId = safePart(
    argumentValue('dispatch-run-id'),
    `manual-automator-v3-${Date.now()}`
  )
  const executionId = safePart(
    argumentValue('execution-id'),
    `automator-${Date.now()}-${process.pid}`
  )
  const coldPerformanceLane = catalogId === 'user.remote_read.performance'
  const ownedLease = leaseArgs.length
    ? null
    : acquireQaRunLease({ dispatchRunId, kind: 'single-run' })
  const effectiveLeaseArgs = ownedLease ? qaRunLeaseArgs(ownedLease) : leaseArgs
  const runtimeEnv = {
    ...process.env,
    // The leaf may change its working directory while a screenshot worker is
    // active. Resolve the two cross-process handoff files once at the runner
    // boundary so a valid CloudBase correlation cannot be lost to cwd drift.
    ...(coldPerformanceLane && process.env.QA_COLD_START_CANDIDATE_FILE
      ? {
          QA_COLD_START_CANDIDATE_FILE: resolveColdEvidencePath(
            process.env.QA_COLD_START_CANDIDATE_FILE
          )
        }
      : {}),
    ...(coldPerformanceLane && process.env.QA_COLD_START_EVIDENCE_FILE
      ? {
          QA_COLD_START_EVIDENCE_FILE: resolveColdEvidencePath(
            process.env.QA_COLD_START_EVIDENCE_FILE
          )
        }
      : {}),
    QA_PERFORMANCE_COLD_LANE: coldPerformanceLane ? '1' : '0',
    // 远端性能叶子必须从启动阶段就固定到 CloudBase online 目标；如果
    // 依赖默认值，automator-runtime 会把未设置的模式解释成 LAN，预检会
    // 在真正进入 wx.request 前误报 lan_flow_not_running。
    ...(coldPerformanceLane ? { QA_BACKEND_MODE: 'online' } : {}),
    // The supervisor already builds the isolated QA runtime with this flag,
    // but the catalog leaf is a separate child process. Propagate the same
    // live-real-api contract to that child so it cannot stop before issuing
    // the actual remote wx.request samples.
    VITE_QA_LIVE_REAL_API: '1'
  }
  const requestedExecutionTimeout = argumentValue('execution-timeout-ms')
  const configuredEvidenceTimeout = Number(
    runtimeEnv.QA_COLD_START_EVIDENCE_TIMEOUT_MS || QA_COLD_START_EVIDENCE_DEFAULT_TIMEOUT_MS
  )
  const evidenceTimeout =
    Number.isFinite(configuredEvidenceTimeout) && configuredEvidenceTimeout > 0
      ? configuredEvidenceTimeout
      : QA_COLD_START_EVIDENCE_DEFAULT_TIMEOUT_MS
  const coldSampleCount = positiveIntegerEnv(
    runtimeEnv.QA_REMOTE_READ_COLD_SAMPLES,
    QA_REMOTE_READ_DEFAULT_COLD_SAMPLES
  )
  const coldRoundInterval = nonNegativeIntegerEnv(
    runtimeEnv.QA_REMOTE_READ_COLD_INTERVAL_MS,
    QA_REMOTE_READ_DEFAULT_COLD_INTERVAL_MS
  )
  const coldRoundWaitBudget = coldPerformanceLane ? coldSampleCount * coldRoundInterval : 0
  const executionTimeoutArgs = requestedExecutionTimeout
    ? [`--execution-timeout-ms=${requestedExecutionTimeout}`]
    : coldPerformanceLane
      ? [
          `--execution-timeout-ms=${
            coldRoundWaitBudget + evidenceTimeout + QA_COLD_START_EXECUTION_BUFFER_MS
          }`
        ]
      : []
  let bootstrap
  let qa
  try {
    bootstrap = run(
      runtimeScript,
      ['bootstrap', '--json', ...(coldPerformanceLane ? ['--refresh'] : []), ...effectiveLeaseArgs],
      runtimeEnv
    )
    const bootstrapReport = parseLastJson(bootstrap.stdout)
    if (bootstrap.error || bootstrap.status !== 0 || bootstrapReport?.status !== 'ready') {
      process.stdout.write(
        `${JSON.stringify(
          blocked('qa_runtime_bootstrap_blocked', 'QA runtime 未达到 ready，未执行业务叶子', {
            bootstrap: bootstrapReport,
            exit_code: bootstrap.status,
            error: bootstrap.error?.message || null,
            stderr: String(bootstrap.stderr || '').slice(-4000)
          }),
          null,
          2
        )}\n`
      )
      process.exitCode = 1
      return
    }
    qa = run(
      dispatchGate,
      [
        'qa-run',
        `--catalog-id=${catalogId}`,
        `--execution-id=${executionId}`,
        `--dispatch-run-id=${dispatchRunId}`,
        ...effectiveLeaseArgs,
        ...executionTimeoutArgs,
        '--allow-live'
      ],
      runtimeEnv
    )
    const qaReport = parseLastJson(qa.stdout)
    const result = {
      ...(qaReport || blocked('qa_terminal_result_unreadable', 'qa-run 未返回可解析终态')),
      command: 'qa:automator:run',
      bootstrap: {
        status: bootstrapReport.status,
        code: bootstrapReport.code,
        generation:
          bootstrapReport.generation ||
          bootstrapReport.supervisor?.generation ||
          bootstrapReport.supervisor_state?.generation ||
          null
      },
      dispatch_run_id: dispatchRunId,
      execution_id: executionId,
      stdout_tail: String(qa.stdout || '').slice(-2000),
      stderr_tail: String(qa.stderr || '').slice(-2000)
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
    process.exitCode = qa.status === 0 && result.status === 'passed' ? 0 : 1
  } finally {
    if (ownedLease) {
      // A standalone runner owns the supervisor generation it bootstrapped.
      // Release the QA-owned runtime before releasing the dispatch lease so a
      // later session never sees a live supervisor carrying a dead dispatch
      // identity. Shared v3 suites keep lifecycle ownership themselves.
      run(runtimeScript, ['stop', '--json', ...effectiveLeaseArgs])
    }
    ownedLease?.release()
  }
}

main()
