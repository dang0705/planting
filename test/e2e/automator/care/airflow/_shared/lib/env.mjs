'use strict'

/**
 * E2E 环境变量解析 -- 空气环境评估独立路由端上验收。
 *
 * 职责：
 *   - 解析 MP_PROJECT_PATH / E2E_ARTIFACT_DIR / MINIPROGRAM_AUTOMATOR_WS
 *   - 获取精确 git HEAD / 分支
 *   - 确保 artifact 目录存在
 *
 * 不承载业务逻辑；仅做运行参数解析。
 */

import path from 'node:path'
import fs from 'node:fs'
import { execSync } from 'node:child_process'
import { formalAutomatorEndpoint } from '../../../../_shared/formal-leaf-harness.mjs'
export function resolveEnv(argv = process.argv.slice(2)) {
  const cliArgs = parseCliArgs(argv)
  return {
    projectPath: resolveProjectPath(cliArgs),
    artifactDir: resolveArtifactDir(cliArgs),
    wsEndpoint: resolveWs(cliArgs)
  }
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
  const dir = path.resolve(process.cwd(), '.e2e-artifacts/airflow-air-exchange-v1')
  ensureDir(dir)
  return dir
}

function resolveWs(cliArgs) {
  return formalAutomatorEndpoint({
    ...process.env,
    MINIPROGRAM_AUTOMATOR_WS:
      cliArgs['miniprogram-automator-ws'] || process.env.MINIPROGRAM_AUTOMATOR_WS
  })
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
}

export function resolveGitHead(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse HEAD', { cwd, encoding: 'utf8' }).trim()
  } catch (error) {
    return null
  }
}

export function resolveGitBranch(cwd = process.cwd()) {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, encoding: 'utf8' }).trim()
  } catch (error) {
    return null
  }
}

export function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-')
}
