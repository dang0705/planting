import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { readCurrentSessionProjectEvidence } from '../../../../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/devtools-session-log.mjs'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'planting-qa-session-log-'))
const logsDir = path.join(root, 'WeappLog', 'logs')
const startedAt = Date.now()
const sessionId = 'current-qa-session'
const projectPath = process.cwd()

function localLogTimestamp(timestamp) {
  return new Date(timestamp - new Date(timestamp).getTimezoneOffset() * 60 * 1000)
    .toISOString()
    .slice(0, 23)
    .replace('T', ' ')
}

function currentSessionEvidence(nowMs) {
  return readCurrentSessionProjectEvidence({
    mainProcess: {
      command: `Electron --user-data-dir=${root} --app-session-id=${sessionId}`,
      process_start_identity: new Date(startedAt).toString()
    },
    expectedProjectPath: projectPath,
    requireAutomatorPort: false,
    nowMs
  })
}

try {
  fs.mkdirSync(logsDir, { recursive: true })
  const beforeStart = `[${localLogTimestamp(startedAt - 60 * 1000)}][ERROR][unknown]`
  const afterStart = `[${localLogTimestamp(startedAt + 1000)}][INFO][unknown]`
  fs.writeFileSync(
    path.join(logsDir, `session-${sessionId}.log`),
    [
      `${beforeStart} [Devtools] devtools is not loaded properly`,
      `${afterStart} [Fileutils] new FileUtils instance dirpath = ${projectPath} {`,
      `${afterStart} [SimulatorService] simulator app compile`,
      `${afterStart} [appservice] appservice webview loadstop`
    ].join('\n')
  )

  const priorFailureEvidence = currentSessionEvidence(startedAt + 2000)
  assert.equal(priorFailureEvidence.status, 'bootstrap_verified')
  assert.deepEqual(
    priorFailureEvidence.runtime_lifecycle.failures,
    [],
    'a previous-process failure must not block a new isolated QA process'
  )

  fs.writeFileSync(
    path.join(logsDir, `current-${sessionId}.log`),
    `${afterStart} [Devtools] devtools is not loaded properly`
  )
  assert.equal(
    currentSessionEvidence(startedAt + 3000).runtime_lifecycle.failures.length,
    1,
    'a current-process AppService failure must remain a QA blocker'
  )
} finally {
  fs.rmSync(root, { recursive: true, force: true })
}

process.stdout.write('devtools session lifecycle boundary passed\n')
