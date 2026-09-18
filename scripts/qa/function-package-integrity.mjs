#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = path.resolve(scriptDir, '../..')

function normalizedPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/')
}

function reportPath(filePath, directory) {
  return directory.startsWith(PROJECT_ROOT + path.sep)
    ? normalizedPath(filePath)
    : path.basename(filePath)
}

function readPackageJson(packagePath, functionName) {
  try {
    return JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  } catch (error) {
    throw new Error(`HTTP 云函数 ${functionName} 的 package.json 无法读取：${error.message}`)
  }
}

export function inspectHttpFunctionPackage(functionName, functionDirectory) {
  const directory = path.resolve(functionDirectory)
  const bootstrapPath = path.join(directory, 'scf_bootstrap')
  const packagePath = path.join(directory, 'package.json')
  const packageLockPath = path.join(directory, 'package-lock.json')

  if (!fs.existsSync(bootstrapPath)) {
    return {
      function_name: functionName,
      directory: normalizedPath(directory),
      kind: 'not_http_function',
      dependency_count: 0,
      dependencies: [],
      package_lock: null,
      violations: []
    }
  }

  if (!fs.existsSync(packagePath)) {
    return {
      function_name: functionName,
      directory: normalizedPath(directory),
      kind: 'http_function',
      dependency_count: 0,
      dependencies: [],
      package_lock: null,
      violations: [
        {
          code: 'http_package_manifest_missing',
          message: 'HTTP 云函数缺少 package.json，无法验证运行时依赖。'
        }
      ]
    }
  }

  const packageJson = readPackageJson(packagePath, functionName)
  const dependencies = Object.keys(packageJson.dependencies || {}).sort()
  const hasProductionDependencies = dependencies.length > 0
  return {
    function_name: functionName,
    directory: normalizedPath(directory),
    kind: 'http_function',
    dependency_count: dependencies.length,
    dependencies,
    package_lock: fs.existsSync(packageLockPath) ? reportPath(packageLockPath, directory) : null,
    violations:
      hasProductionDependencies && !fs.existsSync(packageLockPath)
        ? [
            {
              code: 'http_production_dependency_lock_missing',
              message: 'HTTP 云函数声明了生产依赖，但缺少 package-lock.json。'
            }
          ]
        : []
  }
}

export function auditHttpFunctionPackages(functions = []) {
  const reports = functions
    .map(({ name, dir }) => inspectHttpFunctionPackage(name, dir))
    .sort((left, right) => left.function_name.localeCompare(right.function_name))
  const violations = reports.flatMap(report =>
    report.violations.map(violation => ({ function_name: report.function_name, ...violation }))
  )
  return {
    status: violations.length ? 'FAIL' : 'PASS',
    reports,
    violations
  }
}

function discoverFunctionDirectories() {
  const cloudfunctionsDirectory = path.join(PROJECT_ROOT, 'cloudfunctions')
  return fs
    .readdirSync(cloudfunctionsDirectory, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => ({ name: entry.name, dir: path.join(cloudfunctionsDirectory, entry.name) }))
}

function parseArgs(argv = []) {
  const requestedNames = []
  for (const arg of argv) {
    if (arg.startsWith('--function=')) {
      requestedNames.push(arg.slice('--function='.length).trim())
      continue
    }
    if (arg.startsWith('--functions=')) {
      requestedNames.push(
        ...arg
          .slice('--functions='.length)
          .split(',')
          .map(name => name.trim())
          .filter(Boolean)
      )
      continue
    }
    throw new Error(`不支持的参数：${arg}`)
  }
  return Array.from(new Set(requestedNames.filter(Boolean)))
}

function main() {
  const requestedNames = parseArgs(process.argv.slice(2))
  const functions = discoverFunctionDirectories()
  const selected = requestedNames.length
    ? functions.filter(item => requestedNames.includes(item.name))
    : functions
  const missing = requestedNames.filter(name => !selected.some(item => item.name === name))
  if (missing.length) {
    throw new Error(`未找到云函数目录：${missing.join(', ')}`)
  }
  const report = auditHttpFunctionPackages(selected)
  console.log(JSON.stringify(report, null, 2))
  if (report.status !== 'PASS') {
    process.exitCode = 1
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
