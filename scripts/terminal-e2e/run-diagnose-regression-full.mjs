#!/usr/bin/env node

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    result[String(rawKey || '').trim()] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function normalizeBooleanArg(value, fallback = false) {
  if (value === undefined || value === null || value === '') {
    return fallback
  }

  const normalized = String(value || '').trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) {return true}
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) {return false}
  return fallback
}

function buildCleanChildEnv() {
  const env = { ...process.env }
  Object.keys(env).forEach(key => {
    if (String(key || '').toLowerCase().startsWith('npm_')) {
      delete env[key]
    }
  })
  delete env.NODE_OPTIONS
  return env
}

function collectPassThroughArgs(args = {}, keys = []) {
  return keys.flatMap(key => {
    if (args[key] === undefined || args[key] === null || args[key] === '') {
      return []
    }
    return [`--${key}=${args[key]}`]
  })
}

async function runNodeScript(scriptPath, scriptArgs = []) {
  return execFileAsync('node', [scriptPath, ...scriptArgs], {
    cwd: process.cwd(),
    env: buildCleanChildEnv(),
    maxBuffer: 1024 * 1024 * 20
  })
}

async function readJsonFile(filePath = '') {
  const text = await fs.readFile(path.resolve(filePath), 'utf8')
  return JSON.parse(text)
}

function isReportSuccessful(report = null) {
  if (!report || typeof report !== 'object') {
    return false
  }

  if (typeof report.ok === 'boolean') {
    return report.ok
  }

  const total = Number(report?.summary?.total || 0)
  const failed = Number(report?.summary?.failed || 0)
  return total > 0 && failed === 0
}

function buildFailureMessage(error, scriptPath) {
  const stderr = String(error?.stderr || '').trim()
  const stdout = String(error?.stdout || '').trim()
  const detail = stderr || stdout || String(error?.message || error || '')
  return `${path.basename(scriptPath)} 执行失败: ${detail}`
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const env = String(args.env || '').trim()
  if (!env) {
    throw new Error('缺少 --env')
  }

  const visualScriptPath = path.join(__dirname, 'run-visual-symptom-batch.mjs')
  const outcomeScriptPath = path.join(__dirname, 'run-diagnose-outcome-batch.mjs')
  const fastConvergenceScriptPath = path.join(
    __dirname,
    'run-high-specificity-fast-convergence-batch.mjs'
  )
  const visualManifestPath = path.resolve(
    process.cwd(),
    args['visual-manifest'] || 'scripts/terminal-e2e/manifests/diagnose-visual-regression.manifest.json'
  )
  const outcomeManifestPath = path.resolve(
    process.cwd(),
    args['outcome-manifest'] || 'scripts/terminal-e2e/manifests/diagnose-outcome-regression.manifest.json'
  )
  const fastConvergenceManifestPath = path.resolve(
    process.cwd(),
    args['fast-convergence-manifest'] ||
      'scripts/terminal-e2e/manifests/high-specificity-fast-convergence.manifest.json'
  )
  const visualReportPath = path.resolve(
    process.cwd(),
    args['visual-report-file'] || 'scripts/terminal-e2e/manifests/diagnose-visual-regression.report.json'
  )
  const outcomeReportPath = path.resolve(
    process.cwd(),
    args['outcome-report-file'] || 'scripts/terminal-e2e/manifests/diagnose-outcome-regression.report.json'
  )
  const fastConvergenceReportPath = path.resolve(
    process.cwd(),
    args['fast-convergence-report-file'] ||
      'scripts/terminal-e2e/manifests/high-specificity-fast-convergence.report.json'
  )
  const summaryReportPath = String(args['report-file'] || '').trim()
    ? path.resolve(process.cwd(), args['report-file'])
    : ''

  const sharedArgs = collectPassThroughArgs(args, [
    'app-env',
    'skip-auth',
    'max-followup-loops',
    'retry-delay-ms',
    'start-retries',
    'answer-retries',
    'case-retries',
    'openid-prefix'
  ])

  const visualArgs = [
    `--env=${env}`,
    `--case-groups-file=${visualManifestPath}`,
    `--report-file=${visualReportPath}`,
    `--start-mode=${args['start-mode'] || 'sync'}`,
    `--keep-uploaded-image=${normalizeBooleanArg(args['keep-uploaded-image'], false) ? 'true' : 'false'}`,
    ...sharedArgs
  ]
  const outcomeArgs = [
    `--env=${env}`,
    `--case-groups-file=${outcomeManifestPath}`,
    `--report-file=${outcomeReportPath}`,
    ...sharedArgs
  ]
  const fastConvergenceArgs = [
    `--case-groups-file=${fastConvergenceManifestPath}`,
    `--report-file=${fastConvergenceReportPath}`
  ]

  try {
    await runNodeScript(visualScriptPath, visualArgs)
  } catch (error) {
    throw new Error(buildFailureMessage(error, visualScriptPath))
  }

  try {
    await runNodeScript(outcomeScriptPath, outcomeArgs)
  } catch (error) {
    throw new Error(buildFailureMessage(error, outcomeScriptPath))
  }

  try {
    await runNodeScript(fastConvergenceScriptPath, fastConvergenceArgs)
  } catch (error) {
    throw new Error(buildFailureMessage(error, fastConvergenceScriptPath))
  }

  const [visualReport, outcomeReport, fastConvergenceReport] = await Promise.all([
    readJsonFile(visualReportPath),
    readJsonFile(outcomeReportPath),
    readJsonFile(fastConvergenceReportPath)
  ])

  const summary = {
    ok:
      isReportSuccessful(visualReport) &&
      isReportSuccessful(outcomeReport) &&
      isReportSuccessful(fastConvergenceReport),
    env,
    visual: {
      reportFile: visualReportPath,
      summary: visualReport?.summary || null
    },
    outcome: {
      reportFile: outcomeReportPath,
      summary: outcomeReport?.summary || null
    },
    fastConvergence: {
      reportFile: fastConvergenceReportPath,
      summary: fastConvergenceReport?.summary || null
    }
  }

  if (summaryReportPath) {
    await fs.writeFile(summaryReportPath, JSON.stringify(summary, null, 2))
  }

  await writeJsonAndExit(summary, summary.ok ? 0 : 1)
}

function writeJsonAndExit(payload, exitCode = 0) {
  return new Promise(resolve => {
    const text = `${JSON.stringify(payload, null, 2)}\n`
    process.stdout.write(text, () => {
      process.exit(exitCode)
      resolve()
    })
  })
}

main().catch(error => {
  process.stderr.write(`${String(error?.stack || error)}\n`)
  process.exit(1)
})
