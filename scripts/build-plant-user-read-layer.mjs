#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const sourceLayerRoot = path.join(repoRoot, 'cloudfunctions', 'layer')
const outputRoot = path.resolve(
  process.env.PLANT_USER_READ_LAYER_OUTPUT ||
    path.join(repoRoot, '.tmp', 'build', 'plant-user-read-layer')
)

// 首页列表只使用以下闭包：HTTP 身份解析、签名 SQL 回退、原生 MySQL 读取和
// 单页植物列表映射。写入、详情、存储图片和提醒计划不能进入这个冷启动层。
const utilityFiles = [
  'air-environment-evidence.js',
  'cloudbase.js',
  'http.js',
  'http-identity-ticket.js',
  'native-mysql.js',
  'plant-knowledge.js',
  'platform-phone-verifiers.js',
  'platform-session.js',
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

function directorySize(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    return stat.size
  }
  return fs.readdirSync(target).reduce(
    (total, entry) => total + directorySize(path.join(target, entry)),
    0
  )
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

const dependencyPackageJson = {
  name: 'plant-user-read-runtime-layer',
  private: true,
  dependencies: Object.fromEntries(
    runtimeDependencies.map(dependency => {
      const packageJsonPath = path.join(
        sourceLayerRoot,
        'node_modules',
        dependency,
        'package.json'
      )
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
      return [packageJson.name || dependency, packageJson.version || '*']
    })
  )
}
fs.writeFileSync(
  path.join(outputRoot, 'package.json'),
  `${JSON.stringify(dependencyPackageJson, null, 2)}\n`,
  'utf8'
)

const manifest = {
  function: 'plant-user-http',
  role: 'read-list-only',
  source: 'cloudfunctions/layer/utils',
  utilities: utilityFiles,
  runtimeDependencies,
  generatedAt: new Date().toISOString()
}
fs.writeFileSync(
  path.join(outputRoot, 'layer-manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
  'utf8'
)

// 在发布前检查每个工具文件的语法与层内依赖。plant-knowledge 通过 CloudBase
// 运行时绝对路径 `/opt/utils/*` 引用同层工具；宿主机不存在该挂载点，因此不在
// 构建机 require 它，避免伪造运行时目录或触发真实数据库预热。
for (const file of utilityFiles) {
  const target = path.join(outputRoot, 'utils', file)
  const syntax = spawnSync(process.execPath, ['--check', target], { encoding: 'utf8' })
  if (syntax.status !== 0) {
    throw new Error(`plant-user 读取层语法校验失败: ${file}\n${syntax.stderr || syntax.stdout}`)
  }
}
for (const dependency of runtimeDependencies) {
  const dependencyPath = path.join(outputRoot, 'node_modules', dependency)
  if (!fs.existsSync(dependencyPath)) {
    throw new Error(`plant-user 读取层缺少依赖文件: ${dependency}`)
  }
}

console.log(`plant-user read runtime layer ready: ${outputRoot}`)
console.log(`plant-user read runtime layer utilities: ${utilityFiles.length}`)
console.log(`plant-user read runtime layer dependencies: ${runtimeDependencies.length}`)
console.log(`plant-user read runtime layer size: ${directorySize(outputRoot)}`)
