#!/usr/bin/env node
/**
 * 微信小程序主包逻辑字节统计门禁（只读 CLI 入口）
 *
 * 用法：
 *   node scripts/check-main-package-size.mjs <built-root> --mode=development|production --limit=<bytes>
 *
 * 可复用业务逻辑位于 src/utils/main-package-size.js，本文件仅做命令行参数解析与退出码映射。
 */

import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { parseArgs, computePackageStats } from '../src/utils/main-package-size.js'

function main() {
  let args
  try {
    args = parseArgs(process.argv)
  } catch (error) {
    process.stderr.write(`[check-main-package-size] ${error.message}\n`)
    process.exit(2)
  }

  let stats
  try {
    stats = computePackageStats(args.builtRoot, args.mode, args.limitBytes)
  } catch (error) {
    process.stderr.write(`[check-main-package-size] ${error.message}\n`)
    process.exit(3)
  }

  process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`)

  if (!stats.passed) {
    process.exit(1)
  }
  process.exit(0)
}

// 直接执行时运行 main；用 realpath 兼容 macOS /tmp -> /private/tmp 等符号链接
const isDirectRun = (() => {
  if (!process.argv[1]) {
    return false
  }
  try {
    return fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))
  } catch {
    return false
  }
})()
if (isDirectRun) {
  main()
}
