#!/usr/bin/env node

/* oxlint-disable no-console, no-magic-numbers */
/**
 * 单函数部署兼容入口。
 * 该入口严禁直接执行 code update；所有部署统一进入可审计发布门禁。
 */

const { spawnSync } = require('child_process')
const path = require('path')

const functionName = String(process.argv[2] || '').trim()
if (!functionName) {
  console.error('错误: 请提供要部署的云函数名称')
  console.log('用法: node scripts/deploy-function.js <function-name>')
  process.exit(1)
}

console.log('单函数部署将进入统一发布门禁: ' + functionName)
const result = spawnSync(
  process.execPath,
  [
    path.join(process.cwd(), 'scripts', 'deploy-cloudbase-functions.mjs'),
    '--function=' + functionName
  ],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit'
  }
)
if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
