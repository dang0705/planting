#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const eventArgument = args.find(argument => argument.startsWith('--event='))
const outputArgument = args.find(argument => argument.startsWith('--output='))
const eventName = eventArgument ? eventArgument.slice('--event='.length) : ''
const outputFile = outputArgument ? outputArgument.slice('--output='.length) : ''
const rawPayload = fs.readFileSync(0, 'utf8').trim()

if (outputFile && ['SubagentStart', 'SubagentStop'].includes(eventName)) {
  let payload
  try {
    payload = rawPayload ? JSON.parse(rawPayload) : {}
  } catch {
    payload = { raw_payload: rawPayload }
  }
  const record = {
    event_name: eventName,
    observed_at: new Date().toISOString(),
    payload
  }
  const absoluteFile = path.resolve(process.cwd(), outputFile)
  fs.mkdirSync(path.dirname(absoluteFile), { recursive: true })
  fs.appendFileSync(absoluteFile, `${JSON.stringify(record)}\n`)
}

process.stdout.write('{}\n')
