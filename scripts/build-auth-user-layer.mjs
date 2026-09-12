#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const sourceLayerRoot = path.join(repoRoot, 'cloudfunctions', 'layer')
const outputRoot = path.resolve(
  process.env.AUTH_USER_LAYER_OUTPUT || path.join(repoRoot, '.tmp', 'build', 'auth-user-layer')
)

const utilityFiles = [
  'cloudbase.js',
  'http.js',
  'http-identity-ticket.js',
  'native-mysql.js',
  'platform-session.js',
  'platform-phone-verifiers.js',
  'runtime-env.js'
]
const runtimeDependencies = [
  '@cloudbase/signature-nodejs',
  'aws-ssl-profiles',
  'clone',
  'generate-function',
  'iconv-lite',
  'is-stream',
  'is-property',
  'lru.min',
  'named-placeholders',
  'punycode',
  'qs',
  'safer-buffer',
  'sql-escaper',
  'url',
  'mysql2'
]

function copyPath(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true, force: true })
}

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(outputRoot, 'utils'), { recursive: true })
fs.mkdirSync(path.join(outputRoot, 'node_modules'), { recursive: true })

for (const file of utilityFiles) {
  copyPath(
    path.join(sourceLayerRoot, 'utils', file),
    path.join(outputRoot, 'utils', file)
  )
}

for (const dependency of runtimeDependencies) {
  copyPath(
    path.join(sourceLayerRoot, 'node_modules', dependency),
    path.join(outputRoot, 'node_modules', dependency)
  )
}

// 仅校验并记录运行时依赖，不在构建目录执行 npm install，避免把开发依赖和
// 完整 Node SDK 重新带入认证函数的冷启动包。
const dependencyPackageJson = {
  name: 'auth-user-http-runtime-layer',
  private: true,
  dependencies: {
    '@cloudbase/signature-nodejs': '2.2.0',
    'aws-ssl-profiles': '1.1.2',
    clone: '2.1.2',
    'generate-function': '2.3.1',
    'iconv-lite': '0.7.3',
    'is-stream': '2.0.1',
    'is-property': '1.0.2',
    'lru.min': '1.1.4',
    'named-placeholders': '1.1.6',
    punycode: '1.4.1',
    qs: '6.12.3',
    'safer-buffer': '2.1.2',
    'sql-escaper': '1.5.1',
    url: '0.11.4',
    mysql2: '3.24.2'
  }
}
fs.writeFileSync(
  path.join(outputRoot, 'package.json'),
  `${JSON.stringify(dependencyPackageJson, null, 2)}\n`,
  'utf8'
)

const manifest = {
  function: 'auth-user-http',
  source: 'cloudfunctions/layer/utils',
  utilities: utilityFiles,
  runtimeDependencies,
  generatedAt: new Date().toISOString()
}
fs.writeFileSync(path.join(outputRoot, 'layer-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

// 让脚本在部署前就失败，而不是把不完整的层部署到 QA。
const layerRequire = createRequire(path.join(outputRoot, 'utils', 'cloudbase.js'))
for (const file of utilityFiles) {
  layerRequire(`./${file.replace(/\.js$/u, '')}`)
}
for (const dependency of runtimeDependencies) {
  const dependencyPath = path.join(outputRoot, 'node_modules', dependency)
  if (!fs.existsSync(dependencyPath)) {
    throw new Error(`auth-user runtime layer 缺少依赖文件: ${dependency}`)
  }
}
console.log(`auth-user runtime layer ready: ${outputRoot}`)
console.log(`auth-user runtime layer utilities: ${utilityFiles.length}`)
console.log(`auth-user runtime layer dependencies: ${runtimeDependencies.length}`)
