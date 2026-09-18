import assert from 'node:assert/strict'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const forbiddenImports = ['@dcloudio', 'uni-app', 'taro', 'cloudbase', 'plant-user-http', 'dist/dev/mp-weixin']
const forbiddenLiterals = ['plant-user-http', 'dist/dev/mp-weixin']

async function files(directory) {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name)
    if (entry.isDirectory()) {output.push(...(await files(target)))}
    if (entry.isFile() && target.endsWith('.mjs')) {output.push(target)}
  }
  return output
}

test('core, platform, host, and CLI have no Planting or framework imports', async () => {
  const roots = ['src/contracts', 'src/core', 'src/platforms', 'src/hosts', 'src/cli']
  for (const root of roots) {
    for (const file of await files(path.join(packageRoot, root))) {
      const source = await readFile(file, 'utf8')
      for (const forbiddenText of forbiddenImports) {
        const importLeak = new RegExp(`(?:from|import\\()\\s*['"]${forbiddenText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'u')
        assert.equal(importLeak.test(source), false, `${path.relative(packageRoot, file)} imports ${forbiddenText}`)
      }
      for (const forbiddenText of forbiddenLiterals) {
        assert.equal(source.includes(forbiddenText), false, `${path.relative(packageRoot, file)} contains ${forbiddenText}`)
      }
    }
  }
})
