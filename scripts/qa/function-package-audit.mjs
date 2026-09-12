#!/usr/bin/env node

import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = path.resolve(scriptDir, '../..')
export const DEFAULT_FUNCTION_NAMES = Object.freeze([
  'auth-user-http',
  'plant-user-http'
])

// Runtime logs are local observability output, never deployable function source.
// .gitignore is not a CloudBase upload contract, so the audit and deployment
// staging code must enforce this boundary independently.
const IGNORED_DIRECTORY_NAMES = new Set(['.git', '.tmp', 'dist', 'node_modules', 'logs'])
const IGNORED_FILE_NAMES = new Set(['.DS_Store'])
const SENSITIVE_FILE_PATTERN = /(?:^|\/)\.(?:env|pem|key)(?:\.|$)/u
const REQUIRE_PATTERN = /require\(\s*['"]([^'"]+)['"]\s*\)/gu

const STARTUP_DEPENDENCY_RULES = Object.freeze({
  'auth-user-http': [
    {
      pattern: /platform-phone-verifiers/u,
      code: 'auth_phone_verifier_eager_load',
      message: 'auth/user 读路径不得在模块启动时加载跨平台手机号校验器'
    }
  ],
  'plant-user-http': [
    {
      pattern:
        /(?:plant-deletion-service|\/native-mysql|watering-reminder-service|fertilization-reminder-service|watering-planner-service|watering-advisor-service|\/watering-planner|\/transpiration|user-plant-light-environment|air-environment-service|air-environment-evidence|light-exposure-normalize)/u,
      code: 'plant_read_path_private_write_dependency',
      message: 'user-plants 读路径不得在模块启动时加载非列表业务或私网写依赖'
    }
  ]
})

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex')
}

function normalizedRelativePath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/')
}

function shouldIgnoreFile(filePath) {
  const relative = normalizedRelativePath(filePath)
  return (
    IGNORED_FILE_NAMES.has(path.basename(filePath)) ||
    SENSITIVE_FILE_PATTERN.test(relative) ||
    relative.startsWith('.tmp/') ||
    relative.startsWith('dist/')
  )
}

function collectFiles(directory) {
  const files = []
  const walk = current => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          walk(entryPath)
        }
        continue
      }
      if (entry.isFile() && !shouldIgnoreFile(entryPath)) {
        files.push(entryPath)
      }
    }
  }
  walk(directory)
  return files.sort((left, right) =>
    normalizedRelativePath(left).localeCompare(normalizedRelativePath(right))
  )
}

function readTopLevelImports(appPath) {
  if (!fs.existsSync(appPath)) {
    return []
  }
  const source = fs.readFileSync(appPath, 'utf8')
  const imports = []
  for (const match of source.matchAll(REQUIRE_PATTERN)) {
    const lineStart = source.lastIndexOf('\n', match.index) + 1
    const indentation = source.slice(lineStart, match.index).match(/^[ \t]*/u)?.[0] || ''
    if (indentation.length > 0) {
      continue
    }
    const specifier = String(match[1] || '').trim()
    if (specifier) {
      imports.push(specifier)
    }
  }
  return Array.from(new Set(imports)).sort()
}

function startupDependencyViolations(functionName, imports) {
  const rules = STARTUP_DEPENDENCY_RULES[functionName] || []
  return rules
    .filter(rule => imports.some(specifier => rule.pattern.test(specifier)))
    .map(rule => ({
      code: rule.code,
      message: rule.message
    }))
}

function packageConfig(functionDirectory) {
  const packagePath = path.join(functionDirectory, 'package.json')
  if (!fs.existsSync(packagePath)) {
    return { path: null, dependencies: [] }
  }
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  return {
    path: normalizedRelativePath(packagePath),
    dependencies: Object.keys(packageJson.dependencies || {}).sort()
  }
}

export function auditFunctionPackage(functionName, functionDirectory) {
  const directory = path.resolve(functionDirectory)
  const files = fs.existsSync(directory) ? collectFiles(directory) : []
  const entries = files.map(filePath => {
    const content = fs.readFileSync(filePath)
    return {
      path: normalizedRelativePath(filePath),
      bytes: content.length,
      sha256: sha256(content)
    }
  })
  const appPath = path.join(directory, 'app.js')
  const topLevelImports = readTopLevelImports(appPath)
  const violations = startupDependencyViolations(functionName, topLevelImports)
  const sourceFingerprint = sha256(
    entries.map(entry => entry.path + '\t' + entry.bytes + '\t' + entry.sha256).join('\n')
  )
  const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0)
  const packageInfo = packageConfig(directory)
  return {
    function_name: functionName,
    directory: normalizedRelativePath(directory),
    entrypoint: fs.existsSync(appPath) ? normalizedRelativePath(appPath) : null,
    source_fingerprint: sourceFingerprint,
    file_count: entries.length,
    source_bytes: totalBytes,
    package: packageInfo,
    top_level_imports: topLevelImports,
    startup_dependency_violations: violations,
    files: entries
  }
}

export function auditConfiguredFunctions({
  names = DEFAULT_FUNCTION_NAMES,
  configPath = path.join(PROJECT_ROOT, 'cloudbaserc.json')
} = {}) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  const configuredFunctions = Array.isArray(config.functions) ? config.functions : []
  const audits = names.map(name => {
    const configured = configuredFunctions.find(item => String(item?.name || '').trim() === name)
    const configuredDirectory = configured?.dir || './cloudfunctions/' + name
    return auditFunctionPackage(name, path.resolve(PROJECT_ROOT, configuredDirectory))
  })
  const violations = audits.flatMap(audit =>
    audit.startup_dependency_violations.map(violation => ({
      function_name: audit.function_name,
      ...violation
    }))
  )
  return {
    status: violations.length ? 'FAIL' : 'PASS',
    audit_version: 1,
    project_root: PROJECT_ROOT,
    functions: audits,
    violations,
    generated_at: new Date().toISOString()
  }
}

function parseArgs(argv = []) {
  const result = {
    names: [],
    reportFile: '',
    json: false
  }
  for (const arg of argv) {
    if (arg === '--json') {
      result.json = true
    } else if (arg.startsWith('--function=')) {
      result.names.push(arg.slice('--function='.length).trim())
    } else if (arg.startsWith('--functions=')) {
      result.names.push(
        ...arg
          .slice('--functions='.length)
          .split(',')
          .map(item => item.trim())
          .filter(Boolean)
      )
    } else if (arg.startsWith('--report-file=')) {
      result.reportFile = arg.slice('--report-file='.length).trim()
    }
  }
  result.names = Array.from(new Set(result.names.filter(Boolean)))
  return result
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const report = auditConfiguredFunctions({
    names: args.names.length ? args.names : DEFAULT_FUNCTION_NAMES
  })
  if (args.reportFile) {
    const reportPath = path.resolve(args.reportFile)
    fs.mkdirSync(path.dirname(reportPath), { recursive: true })
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n')
  }
  console.log(
    args.json
      ? JSON.stringify(report, null, 2)
      : JSON.stringify(
          {
            status: report.status,
            functions: report.functions.map(item => ({
              function_name: item.function_name,
              source_fingerprint: item.source_fingerprint,
              file_count: item.file_count,
              source_bytes: item.source_bytes,
              startup_dependency_violations: item.startup_dependency_violations
            })),
            violations: report.violations
          },
          null,
          2
        )
  )
  if (report.status !== 'PASS') {
    process.exitCode = 1
  }
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  await main()
}
