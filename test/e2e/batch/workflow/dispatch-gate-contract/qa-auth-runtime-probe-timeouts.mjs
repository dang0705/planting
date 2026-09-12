import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const sourcePath = path.resolve(process.cwd(), 'scripts/qa/automator-auth-runtime-probe.mjs')
const source = fs.readFileSync(sourcePath, 'utf8')

test('auth runtime probe has a finite Automator connection deadline', () => {
  assert.match(source, /AUTH_RUNTIME_PROBE_CONNECT_TIMEOUT_MS = 45_000/u)
  assert.match(source, /qa_auth_runtime_probe_qa_connect_timeout/u)
  assert.match(source, /qa_auth_runtime_probe_daily_connect_timeout/u)
  assert.match(source, /Promise\.race\(\[pending, timeout\]\)/u)
})

test('timed-out late clients are disconnected instead of being left attached', () => {
  assert.match(
    source,
    /pending\s*\.then\(clientInstance => clientInstance\?\.disconnect\?\.\(\)\)/u
  )
})

test('auth runtime wx.request RPCs have an independent deadline', () => {
  assert.match(source, /AUTH_RUNTIME_PROBE_RPC_TIMEOUT_MS = 8_000/u)
  assert.match(source, /qa_auth_runtime_probe_\$\{step\}_timeout/u)
  assert.match(source, /evaluateStep: \(step, callback, args\)/u)
})
