import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr })
    })
  })
}

test('packed package runs from an empty consumer with only asset, suite, leaf, and adapter', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mp-e2e-consumer-'))
  const packed = path.join(root, 'packed')
  const consumer = path.join(root, 'consumer')
  await Promise.all([mkdir(packed), mkdir(consumer)])
  const pack = await run('npm', ['pack', '--json', '--pack-destination', packed], packageRoot)
  const tarball = path.join(packed, JSON.parse(pack.stdout)[0].filename)
  await run('npm', ['init', '-y'], consumer)
  await run('npm', ['install', '--ignore-scripts', '--no-package-lock', tarball], consumer)
  const artifact = path.join(consumer, 'artifact')
  await mkdir(artifact)
  await Promise.all([
    writeFile(path.join(artifact, 'project.config.json'), '{"appid":"wx0000000000000000"}'),
    writeFile(path.join(artifact, 'app.json'), '{"pages":["pages/index/index"]}'),
    writeFile(path.join(artifact, 'mp-e2e.contract.json'), JSON.stringify({
      contractVersion: 1,
      platform: 'wechat-miniprogram',
      projectConfigPath: 'project.config.json',
      appConfigPath: 'app.json',
      selectorPolicy: { kind: 'semantic-id', compiledIdMode: 'exact-or-scoped' },
      capabilities: ['navigate', 'interact', 'screenshot', 'runtime-request'],
      adapter: { id: 'consumer-adapter', apiVersion: 1 }
    })),
    writeFile(path.join(consumer, 'adapter.mjs'), `
      import { defineProjectAdapter } from 'miniprogram-e2e/contracts'
      export default defineProjectAdapter({
        id: 'consumer-adapter', apiVersion: 1, fixtures: {},
        applicationSessionProvider: { start: async () => ({ status: 'ready', evidence: [], stop: async () => ({ status: 'stopped' }) }) }
      })
    `),
    writeFile(path.join(consumer, 'leaf.mjs'), `
      import { defineLeaf } from 'miniprogram-e2e/contracts'
      export default defineLeaf({ id: 'consumer.smoke' }, async () => ({ status: 'passed' }))
    `),
    writeFile(path.join(consumer, 'suite.json'), JSON.stringify({
      suiteVersion: 1,
      id: 'consumer-suite',
      leaves: [{ id: 'consumer.smoke', module: 'leaf.mjs', fixtures: [] }]
    }))
  ])
  const cli = path.join(consumer, 'node_modules', 'miniprogram-e2e', 'src', 'cli', 'mp-e2e.mjs')
  const runResult = await run(process.execPath, [cli, 'run', '--artifact', artifact, '--suite', path.join(consumer, 'suite.json'), '--adapter', path.join(consumer, 'adapter.mjs'), '--evidence-dir', path.join(consumer, 'evidence')], consumer)
  const report = JSON.parse(runResult.stdout)
  const persisted = JSON.parse(await readFile(path.join(consumer, 'evidence', 'mp-e2e-report.json'), 'utf8'))
  assert.equal(report.outcome, 'passed')
  assert.equal(persisted.businessStatus, 'passed')
  assert.equal(persisted.artifact.snapshot.files, undefined)
})
