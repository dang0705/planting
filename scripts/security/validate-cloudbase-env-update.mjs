#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const {
  assertSafeFunctionEnvUpdate
} = require('../../cloudfunctions/layer/utils/cloudbase-env-update-guard.js')

function readArg(name) {
  const prefix = `--${name}=`
  const argument = process.argv.slice(2).find(item => item.startsWith(prefix))
  return argument ? argument.slice(prefix.length).trim() : ''
}

function readJson(file) {
  const absolute = path.resolve(process.cwd(), file)
  const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'))
  return parsed?.envVariables || parsed?.EnvVariables || parsed
}

function readList(name) {
  return readArg(name)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
}

const currentFile = readArg('current')
const proposedFile = readArg('proposed')
if (!currentFile || !proposedFile) {
  console.error(
    '用法：node scripts/security/validate-cloudbase-env-update.mjs --current=当前配置.json --proposed=拟更新配置.json [--allow-remove=KEY] [--allow-replace=KEY]'
  )
  process.exit(2)
}

try {
  const result = assertSafeFunctionEnvUpdate(readJson(currentFile), readJson(proposedFile), {
    allowRemove: readList('allow-remove'),
    allowReplace: readList('allow-replace')
  })
  console.log(
    JSON.stringify({
      ok: result.ok,
      addedKeys: result.addedKeys,
      changedKeys: result.changedKeys,
      removedKeys: result.removedKeys
    })
  )
} catch (error) {
  console.error(String(error?.message || error))
  process.exit(1)
}
