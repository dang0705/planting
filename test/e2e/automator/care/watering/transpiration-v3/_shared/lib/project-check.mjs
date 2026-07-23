'use strict'

/**
 * 项目目录预检 —— 浇水算法 v3 蒸腾间隔修正端上验收。
 *
 * 职责：
 *   - 在连接 9420 前验证 MP_PROJECT_PATH 下 project.config.json 存在
 *   - 不存在时返回 BLOCKED_ENV，避免连接后才发现路径错误
 *
 * 不承载业务逻辑。
 */

import path from 'node:path'
import fs from 'node:fs'

/**
 * 检查 project.config.json 是否存在于项目目录。
 *
 * @param {string} projectPath - MP_PROJECT_PATH
 * @returns {{ok: boolean, reason?: string, configPath: string}}
 */
export function checkProjectConfig(projectPath) {
  const configPath = path.resolve(projectPath, 'project.config.json')
  if (!fs.existsSync(configPath)) {
    return {
      ok: false,
      reason: `project.config.json not found at ${configPath}. 请确认 MP_PROJECT_PATH 指向正确的微信小程序构建目录（默认 dist/dev/mp-weixin）。`,
      configPath
    }
  }
  return { ok: true, configPath }
}

/**
 * 检查项目目录本身存在。
 */
export function checkProjectDir(projectPath) {
  if (!fs.existsSync(projectPath)) {
    return {
      ok: false,
      reason: `project directory not found: ${projectPath}. 请先运行 npm run dev:mp-weixin:local-functions:lan 构建小程序。`
    }
  }
  return { ok: true }
}

/**
 * 综合预检：目录存在 + project.config.json 存在。
 *
 * @param {string} projectPath
 * @returns {{ok: boolean, reason?: string}}
 */
export function preflightProject(projectPath) {
  const dirCheck = checkProjectDir(projectPath)
  if (!dirCheck.ok) return dirCheck
  const configCheck = checkProjectConfig(projectPath)
  if (!configCheck.ok) {
    return { ok: false, reason: configCheck.reason }
  }
  return { ok: true }
}
