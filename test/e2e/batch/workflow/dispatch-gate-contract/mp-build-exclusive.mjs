import assert from 'node:assert/strict'
import fs from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

const projectRoot = process.cwd()
const wrapper = path.join(projectRoot, 'scripts/dev/run-mp-build-exclusive.mjs')
const lockPath = path.join(projectRoot, '.tmp', 'build-locks', 'mp-weixin-build.lock')
const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'))

const buildScripts = Object.entries(packageJson.scripts || {}).filter(([name]) =>
  name.startsWith('build:mp-weixin')
)
assert.ok(buildScripts.length > 0)
for (const [name, command] of buildScripts) {
  if (name === 'build:mp-weixin:local-functions') {
    assert.match(command, /run-mp-build-exclusive\.mjs/u)
    continue
  }
  assert.match(command, /run-mp-build-exclusive\.mjs/u, `${name} 未经过独占构建入口`)
}

const owner = spawn(
  process.execPath,
  [wrapper, '--', process.execPath, '-e', 'setTimeout(() => {}, 1200)'],
  { cwd: projectRoot, stdio: ['ignore', 'pipe', 'pipe'] }
)
let ownerOutput = ''
owner.stdout.on('data', chunk => {
  ownerOutput += chunk
})
owner.stderr.on('data', chunk => {
  ownerOutput += chunk
})

const deadline = Date.now() + 2000
while (!fs.existsSync(path.join(lockPath, 'owner.json')) && Date.now() < deadline) {
  await delay(20)
}
assert.equal(fs.existsSync(path.join(lockPath, 'owner.json')), true)

const contender = spawnSync(
  process.execPath,
  [wrapper, '--', process.execPath, '-e', 'setTimeout(() => {}, 10)'],
  { cwd: projectRoot, encoding: 'utf8' }
)
assert.equal(contender.status, 1)
assert.match(`${contender.stdout || ''}${contender.stderr || ''}`, /mp_build_in_progress/u)

const ownerExit = await new Promise((resolve, reject) => {
  owner.once('error', reject)
  owner.once('exit', (code, signal) => resolve({ code, signal }))
})
assert.deepEqual(ownerExit, { code: 0, signal: null }, ownerOutput)
assert.equal(fs.existsSync(lockPath), false)

console.log('mp-build-exclusive contract passed')
