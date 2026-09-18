import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { defineLeaf, defineProjectAdapter } from '../src/contracts/index.mjs'
import { runSuite } from '../src/core/runner.mjs'

async function tempSuite() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'mp-e2e-suite-'))
  const artifact = path.join(root, 'artifact')
  await mkdir(artifact)
  await Promise.all([
    writeFile(path.join(artifact, 'project.config.json'), '{"appid":"wx0000000000000000"}'),
    writeFile(path.join(artifact, 'app.json'), '{"pages":["pages/index/index"]}'),
    writeFile(
      path.join(artifact, 'mp-e2e.contract.json'),
      JSON.stringify({
        contractVersion: 1,
        platform: 'wechat-miniprogram',
        projectConfigPath: 'project.config.json',
        appConfigPath: 'app.json',
        selectorPolicy: { kind: 'semantic-id', compiledIdMode: 'exact-or-scoped' },
        capabilities: ['navigate', 'interact', 'screenshot', 'runtime-request'],
        adapter: { id: 'fixture-adapter', apiVersion: 1 }
      })
    ),
    writeFile(
      path.join(root, 'leaf.mjs'),
      "import { defineLeaf } from 'file:///unused'; export default null;"
    )
  ])
  return { root, artifact }
}

test('runner keeps fixture failure separate from business execution', async () => {
  const { root, artifact } = await tempSuite()
  const leafPath = path.join(root, 'leaf.mjs')
  await writeFile(
    leafPath,
    "export default { kind: 'mp-e2e-leaf', metadata: { id: 'fixture.blocked', dataMode: 'live_real' }, run: async () => ({ status: 'passed' }) }"
  )
  await writeFile(
    path.join(root, 'suite.json'),
    JSON.stringify({ suiteVersion: 1, id: 'fixture-suite', leaves: [{ id: 'fixture.blocked', module: 'leaf.mjs', fixtures: ['blocked'] }] })
  )
  const adapter = defineProjectAdapter({
    id: 'fixture-adapter',
    apiVersion: 1,
    applicationSessionProvider: { start: async () => ({ status: 'ready', evidence: [] }) },
    fixtures: {
      blocked: {
        kind: 'mp-e2e-fixture',
        id: 'blocked',
        prepare: async () => ({ id: 'x' }),
        verify: async () => ({ verified: false }),
        cleanup: async () => ({ readback: { verified: true } })
      }
    }
  })
  const report = await runSuite({
    artifactPath: artifact,
    suitePath: path.join(root, 'suite.json'),
    adapter,
    evidenceDir: path.join(root, 'evidence')
  })
  assert.equal(report.infrastructureStatus, 'passed')
  assert.equal(report.fixtureStatus, 'blocked')
  assert.equal(report.businessStatus, 'not_run')
  assert.equal(report.failureKind, 'fixture')
})

test('defineLeaf exposes an immutable public registration', () => {
  const leaf = defineLeaf({ id: 'example.leaf' }, async () => ({ status: 'passed' }))
  assert.equal(leaf.kind, 'mp-e2e-leaf')
  assert.equal(leaf.metadata.dataMode, 'live_real')
})

test('runner preserves contract failures as not_run infrastructure', async () => {
  const { root, artifact } = await tempSuite()
  await writeFile(
    path.join(root, 'suite.json'),
    JSON.stringify({ suiteVersion: 1, id: 'contract-suite', leaves: [{ id: 'missing.leaf', module: 'missing.mjs' }] })
  )
  const adapter = defineProjectAdapter({
    id: 'fixture-adapter',
    apiVersion: 1,
    applicationSessionProvider: { start: async () => ({ status: 'ready', evidence: [] }) }
  })
  const report = await runSuite({
    artifactPath: artifact,
    suitePath: path.join(root, 'suite.json'),
    adapter,
    evidenceDir: path.join(root, 'evidence')
  })
  assert.equal(report.outcome, 'failed')
  assert.equal(report.failureKind, 'contract')
  assert.equal(report.infrastructureStatus, 'not_run')
  assert.equal(report.businessStatus, 'not_run')
})

test('runner injects and releases a profile lease without knowing its implementation', async () => {
  const { root, artifact } = await tempSuite()
  await writeFile(
    path.join(root, 'leaf.mjs'),
    "export default { kind: 'mp-e2e-leaf', metadata: { id: 'profile.lease', dataMode: 'live_real' }, run: async () => ({ status: 'passed' }) }"
  )
  await writeFile(
    path.join(root, 'suite.json'),
    JSON.stringify({ suiteVersion: 1, id: 'profile-suite', leaves: [{ id: 'profile.lease', module: 'leaf.mjs' }] })
  )
  const observations = []
  const adapter = defineProjectAdapter({
    id: 'fixture-adapter',
    apiVersion: 1,
    devToolsProfileProvider: {
      acquire: async () => ({
        status: 'ready',
        kind: 'test-profile',
        evidence: [{ type: 'profile_acquired', value: true }],
        release: async () => { observations.push('released'); return { status: 'released' } }
      })
    },
    applicationSessionProvider: {
      start: async ({ profileLease }) => {
        observations.push(profileLease.kind)
        return { status: 'ready', evidence: [], stop: async () => ({ status: 'stopped' }) }
      }
    }
  })
  const report = await runSuite({
    artifactPath: artifact,
    suitePath: path.join(root, 'suite.json'),
    adapter,
    evidenceDir: path.join(root, 'evidence')
  })
  assert.equal(report.outcome, 'passed')
  assert.deepEqual(observations, ['test-profile', 'released'])
  assert.equal(report.evidence.some(item => item.type === 'profile_release'), true)
})
