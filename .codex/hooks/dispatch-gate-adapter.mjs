#!/usr/bin/env node
import fs from 'node:fs'
import { handleHookEvent } from '../skills/dispatch-task/scripts/dispatch-gate/lib/hook-events.mjs'

const args = process.argv.slice(2)
const eventArg = args.find(arg => arg.startsWith('--event='))
const eventIndex = args.indexOf('--event')
const eventName = eventArg
  ? eventArg.slice('--event='.length)
  : eventIndex >= 0
    ? (args[eventIndex + 1] ?? '')
    : ''
const raw = fs.readFileSync(0, 'utf8').trim()
let payload = {}
try {
  payload = raw ? JSON.parse(raw) : {}
} catch {
  payload = { raw_stdin: raw }
}

const result = handleHookEvent({ payload, eventName })
const denied = result.hookSpecificOutput?.permissionDecision === 'deny'
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
process.exitCode = denied ? 2 : 0
