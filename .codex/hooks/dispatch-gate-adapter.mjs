#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const cliPath = path.join(
  repoRoot,
  '.codex',
  'skills',
  'dispatch-task',
  'scripts',
  'dispatch-gate',
  'cli.mjs'
)

const args = process.argv.slice(2)
const stdin = fs.readFileSync(0, 'utf8')
const child = spawnSync(process.execPath, [cliPath, 'hook-event', ...args], {
  cwd: repoRoot,
  input: stdin,
  encoding: 'utf8',
  env: process.env
})

if (child.stdout) {
  process.stdout.write(child.stdout)
}
if (child.stderr) {
  process.stderr.write(child.stderr)
}
process.exit(child.status ?? 1)
