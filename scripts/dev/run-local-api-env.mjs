#!/usr/bin/env node

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runLocalApiEnvironment } from './local-api-env-launcher.mjs'

export { runLocalApiEnvironment }

async function main() {
  await runLocalApiEnvironment()
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    if (String(error?.code || '').startsWith('LOCAL_')) {
      process.stderr.write(`${error.message}\n`)
      process.exit(1)
    }
    process.stderr.write(`${String(error?.stack || error)}\n`)
    process.exit(1)
  })
}
