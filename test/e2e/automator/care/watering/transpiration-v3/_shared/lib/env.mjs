'use strict'

/**
 * E2E 环境变量解析 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 解析 MP_PROJECT_PATH / E2E_ARTIFACT_DIR / WATERING_TRANSPIRATION_MODE / MINIPROGRAM_AUTOMATOR_WS
 *   - 获取精确 git HEAD
 *   - 确保 artifact 目录存在
 *
 * 不复制业务常量或公式；仅做运行参数解析。
 */

import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'

const DEFAULT_WS = 'ws://127.0.0.1:9420'
const DEFAULT_MODE = 'shadow'

/**
 * 解析运行参数。支持环境变量与等价 CLI 参数（--key=value）。
 */
export function resolveEnv(argv = process.argv.slice(2)) {
  const cliArgs = parseCliArgs(argv)
  const projectPath = resolveProjectPath(cliArgs)
  const artifactDir = resolveArtifactDir(cliArgs)
  const mode = resolveMode(cliArgs)
  const wsEndpoint = resolveWs(cliArgs)
  return { projectPath, artifactDir, mode, wsEndpoint }
}

function parseCliArgs(argv) {
  const args = {}
  for (const token of argv) {
    if (!token.startsWith('--')) continue
    const eq = token.indexOf('=')
    if (eq < 0) continue
    const key = token.slice(2, eq)
    const value = token.slice(eq + 1)
    args[key] = value
  }
  return args
}

function resolveProjectPath(cliArgs) {
  const raw = cliArgs['mp-project-path'] || process.env.MP_PROJECT_PATH
  if (raw) return path.resolve(raw)
  return path.resolve(process.cwd(), 'dist/dev/mp-weixin')
}

function resolveArtifactDir(cliArgs) {
  const raw = cliArgs['e2e-artifact-dir'] || process.env.E2E_ARTIFACT_DIR
  if (raw) {
    const resolved = path.resolve(raw)
    ensureDir(resolved)
    return resolved
  }
  const dir = path.resolve(process.cwd(), '.e2e-artifacts/watering-transpiration-v3')
  ensureDir(dir)
  return dir
}

function resolveMode(cliArgs) {
  const raw = String(
    cliArgs['watering-transpiration-mode'] ||
      process.env.WATERING_TRANSPIRATION_MODE ||
      DEFAULT_MODE
  ).toLowerCase()
  if (raw !== 'shadow' && raw !== 'active') {
    throw new Error(`invalid WATERING_TRANSPIRATION_MODE: ${raw}, expected shadow|active`)
  }
  return raw
}

function resolveWs(cliArgs) {
  return String(
    cliArgs['miniprogram-automator-ws'] || process.env.MINIPROGRAM_AUTOMATOR_WS || DEFAULT_WS
  )
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

/**
 * 获取精确 git HEAD（40 位 SHA）。
 */
export function resolveGitHead(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim()
  } catch (error) {
    return null
  }
}

/**
 * 获取当前分支名。
 */
export function resolveGitBranch(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim()
  } catch (error) {
    return null
  }
}

/**
 * 获取 PR base HEAD（origin/sprint-ai-workflow）。
 */
export function resolvePrBaseHead(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse origin/sprint-ai-workflow', { cwd, encoding: 'utf8' }).trim()
  } catch (error) {
    return null
  }
}

/**
 * 生成 ISO 时间戳（文件名安全）。
 */
export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}
