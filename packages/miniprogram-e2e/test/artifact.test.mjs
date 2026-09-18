import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { validateArtifact, snapshotArtifact } from '../src/core/artifact.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'fixtures')

for (const name of ['compiled-uniapp', 'compiled-taro']) {
  test(`${name} is a framework-neutral compiled artifact`, async () => {
    const artifact = await validateArtifact(path.join(root, name))
    const snapshot = await snapshotArtifact(path.join(root, name))
    assert.equal(artifact.contract.platform, 'wechat-miniprogram')
    assert.ok(snapshot.fileCount >= 3)
    assert.match(snapshot.sha256, /^[a-f0-9]{64}$/u)
  })
}
