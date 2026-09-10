#!/usr/bin/env node

import { inspectInstalledDevToolsCompatibility } from './patch-wechat-devtools-launcher.mjs'

const report = inspectInstalledDevToolsCompatibility()
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exitCode = report.status === 'compatible' ? 0 : 1
