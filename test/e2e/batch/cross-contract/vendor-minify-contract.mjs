#!/usr/bin/env node
'use strict'

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const viteConfig = fs.readFileSync(path.join(repoRoot, 'vite.config.js'), 'utf8')
const packageJson = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))

assert.match(
  viteConfig,
  /const vendorMinifyQaEnabled\s*=\s*process\.env\.MP_VENDOR_MINIFY_QA\s*===\s*'1'/,
  'vendor minification must be opt-in through MP_VENDOR_MINIFY_QA=1'
)
assert.match(
  viteConfig,
  /vendorMinifyQaEnabled\s*&&\s*process\.env\.MP_VENDOR_MINIFY_IDENTIFIERS\s*===\s*'1'/,
  'identifier minification must require a second explicit opt-in'
)
for (const option of [
  'minifySyntax: vendorMinifyQaEnabled',
  'minifyWhitespace: vendorMinifyQaEnabled'
]) {
  assert.match(viteConfig, new RegExp(option.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
}
assert.match(viteConfig, /minifyIdentifiers:\s*vendorIdentifierMinifyEnabled/)
assert.match(viteConfig, /keepNames:\s*true/)
assert.match(viteConfig, /sourcefile:\s*vendorPath/)
assert.match(
  viteConfig,
  /await rename\(temporaryVendorPath, vendorPath\)/,
  'vendor output must be atomically replaced after a complete transform'
)
assert.match(
  viteConfig,
  /await unlink\(temporaryVendorPath\)\.catch\(\(\) => \{\}\)/,
  'temporary vendor output must be cleaned without touching the final artifact'
)
assert.equal(
  packageJson.scripts['build:mp-weixin:vendor-minify-qa'],
  'node scripts/dev/run-env.mjs VITE_APP_ENV=production VITE_CLOUDBASE_ENV_ID=cloud1-2grufevs395a9d5e MP_VENDOR_MINIFY_QA=1 MP_VENDOR_MINIFY_IDENTIFIERS=1 -- node scripts/dev/run-mp-build-exclusive.mjs -- uni build -p mp-weixin'
)
assert.match(
  packageJson.scripts['build:mp-weixin'],
  /MP_VENDOR_MINIFY_QA=1 MP_VENDOR_MINIFY_IDENTIFIERS=1/,
  'the production WeChat build must use the reviewed size-gated vendor profile'
)

console.log('vendor minify opt-in contract passed')
