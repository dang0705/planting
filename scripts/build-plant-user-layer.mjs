#!/usr/bin/env node
'use strict'

import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(scriptDir, '..')
const sourceLayerRoot = path.join(repoRoot, 'cloudfunctions', 'layer')
const sourceUtilsRoot = path.join(sourceLayerRoot, 'utils')
const sourceNodeModulesRoot = path.join(sourceLayerRoot, 'node_modules')
const outputRoot = path.resolve(
  process.env.PLANT_USER_LAYER_OUTPUT || path.join(repoRoot, '.tmp', 'build', 'plant-user-layer')
)

const excludedRuntimePackages = new Set(['core-js-pure', '@types'])
const utilityFiles = fs
  .readdirSync(sourceUtilsRoot)
  .filter(file => file.endsWith('.js'))
  .sort()

function copyPath(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.cpSync(source, target, { recursive: true, force: true })
}

function packageNameFromPath(entry) {
  return path.basename(entry)
}

fs.rmSync(outputRoot, { recursive: true, force: true })
fs.mkdirSync(path.join(outputRoot, 'utils'), { recursive: true })
fs.mkdirSync(path.join(outputRoot, 'node_modules'), { recursive: true })

for (const file of utilityFiles) {
  copyPath(path.join(sourceUtilsRoot, file), path.join(outputRoot, 'utils', file))
}

const runtimeDependencies = fs
  .readdirSync(sourceNodeModulesRoot)
  .filter(name => !excludedRuntimePackages.has(name) && name !== '.package-lock.json')
  .sort()

for (const dependency of runtimeDependencies) {
  copyPath(
    path.join(sourceNodeModulesRoot, dependency),
    path.join(outputRoot, 'node_modules', dependency)
  )
}

// 该层服务 plant-user-http 的所有现有路由，因此保留共享工具和已安装的
// 运行依赖；core-js-pure 只属于 wx-cloud-client-sdk 的可选兼容依赖，当前
// Node 18 路径没有运行时引用，去掉它可避免把 15MB 无关代码带入冷启动。
const dependencyPackageJson = {
  name: 'plant-user-http-runtime-layer',
  private: true,
  dependencies: Object.fromEntries(
    runtimeDependencies
      .map(name => {
        const packageJsonPath = path.join(sourceNodeModulesRoot, name, 'package.json')
        if (!fs.existsSync(packageJsonPath)) {
          return null
        }
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
        return [packageJson.name || packageNameFromPath(name), packageJson.version || '*']
      })
      .filter(Boolean)
  )
}
fs.writeFileSync(
  path.join(outputRoot, 'package.json'),
  `${JSON.stringify(dependencyPackageJson, null, 2)}\n`,
  'utf8'
)

const manifest = {
  function: 'plant-user-http',
  source: 'cloudfunctions/layer',
  utilities: utilityFiles,
  runtimeDependencies,
  excludedRuntimePackages: [...excludedRuntimePackages],
  generatedAt: new Date().toISOString()
}
fs.writeFileSync(path.join(outputRoot, 'layer-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

// 在部署前检查复制出的共享工具和运行依赖仍能被 Node 解析；绝对 /opt
// 路径由 CloudBase 层挂载点提供，不能在宿主机上伪造为端上验收。
const layerRequire = createRequire(path.join(outputRoot, 'utils', 'cloudbase.js'))
for (const file of ['cloudbase.js', 'http.js', 'platform-session.js', 'platform-phone-verifiers.js', 'runtime-env.js', 'air-environment-evidence.js']) {
  layerRequire(`./${file.replace(/\.js$/u, '')}`)
}

console.log(`plant-user runtime layer ready: ${outputRoot}`)
console.log(`plant-user runtime layer utilities: ${utilityFiles.length}`)
console.log(`plant-user runtime layer dependencies: ${runtimeDependencies.length}`)
console.log(`plant-user runtime layer size: ${Math.round(duSize(outputRoot) / 1024 / 1024)}MB`)

function duSize(target) {
  const stat = fs.statSync(target)
  if (stat.isFile()) {
    return stat.size
  }
  return fs.readdirSync(target).reduce((total, name) => total + duSize(path.join(target, name)), 0)
}
