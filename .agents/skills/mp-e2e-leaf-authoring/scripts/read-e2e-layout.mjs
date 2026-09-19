#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises'
import path from 'node:path'

const CONFIG_NAME = '.mp-e2e.json'

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

export async function findE2eLayout(start = process.cwd()) {
  let current = path.resolve(start)
  while (true) {
    const file = path.join(current, CONFIG_NAME)
    if (await exists(file)) {
      const layout = JSON.parse(await readFile(file, 'utf8'))
      return { configPath: file, initDir: current, layout }
    }
    const parent = path.dirname(current)
    if (parent === current) {break}
    current = parent
  }
  return null
}

const found = await findE2eLayout()
if (!found) {
  process.stdout.write(`${JSON.stringify({ status: 'missing', hint: 'run 目录初始化' }, null, 2)}\n`)
  process.exitCode = 1
} else {
  process.stdout.write(`${JSON.stringify({ status: 'ready', ...found }, null, 2)}\n`)
}
