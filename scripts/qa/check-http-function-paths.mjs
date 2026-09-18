#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const PROJECT_ROOT = path.resolve(scriptDir, '../..')
const SOURCE_ROOT = path.join(PROJECT_ROOT, 'src')
const FUNCTIONS_ROOT = path.join(PROJECT_ROOT, 'cloudfunctions')
const SOURCE_EXTENSIONS = new Set(['.js', '.mjs', '.ts', '.vue'])

function toProjectPath(filePath) {
  return path.relative(PROJECT_ROOT, filePath).split(path.sep).join('/')
}

function listFiles(directory) {
  if (!fs.existsSync(directory)) {
    return []
  }
  const files = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(entryPath))
    } else if (entry.isFile()) {
      files.push(entryPath)
    }
  }
  return files
}

function normalizeRoute(route) {
  const value = String(route || '').trim()
  if (!value || value === '/') {
    return '/'
  }
  const withLeadingSlash = value.startsWith('/') ? value : `/${value}`
  return withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/u, '') || '/'
}

function normalizeFunctionPath(value) {
  const withoutDynamicSuffix = String(value || '').split('${')[0]
  const withoutQuery = withoutDynamicSuffix.split(/[?#]/u)[0]
  return withoutQuery.replace(/^\/+/, '').replace(/\/+$/u, '')
}

function extractLiteral(line, matcher) {
  const match = line.match(matcher)
  if (!match) {
    return null
  }
  const value = match[1]
  return {
    value,
    unresolved: value.includes('${')
  }
}

export function extractFunctionPathReferences(source, filePath) {
  const references = []
  const dynamicReferences = []
  const lines = String(source || '').split(/\r?\n/u)
  const matchers = [
    /(?:functionPath\s*:\s*|requestHttp(?:Function|File)\s*\(\s*)'([^']*)'/u,
    /(?:functionPath\s*:\s*|requestHttp(?:Function|File)\s*\(\s*)"([^"]*)"/u,
    /(?:functionPath\s*:\s*|requestHttp(?:Function|File)\s*\(\s*)`([^`]*)`/u
  ]

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*')) {
      return
    }

    for (const matcher of matchers) {
      const literal = extractLiteral(line, matcher)
      if (!literal) {
        continue
      }
      references.push({
        file: toProjectPath(filePath),
        line: index + 1,
        rawPath: literal.value,
        unresolved: literal.unresolved
      })
      break
    }

    if (
      /\b(?:const|let|var)\s+functionPath\s*=\s*(?!['"`])/u.test(line) ||
      (/requestHttp(?:Function|File)\s*\(\s*(?!['"`])/u.test(line) &&
        !/\bfunction\s+requestHttp(?:Function|File)\s*\(/u.test(line))
    ) {
      dynamicReferences.push({
        file: toProjectPath(filePath),
        line: index + 1,
        kind: 'dynamic_function_path'
      })
    }
  })

  return { references, dynamicReferences }
}

function loadRouteIndex() {
  const routesByFunction = new Map()
  const functionNames = new Set()

  for (const directory of fs
    .readdirSync(FUNCTIONS_ROOT, { withFileTypes: true })
    .filter(entry => entry.isDirectory())) {
    const configPath = path.join(FUNCTIONS_ROOT, directory.name, 'cloudbase-functions.json')
    if (!fs.existsSync(configPath)) {
      continue
    }
    let config
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    } catch (error) {
      throw new Error(`${toProjectPath(configPath)} 无法解析：${error.message}`)
    }

    for (const item of Array.isArray(config.functions) ? config.functions : []) {
      const name = String(item?.name || '').trim()
      if (name) {
        functionNames.add(name)
      }
    }
    for (const item of Array.isArray(config.routes) ? config.routes : []) {
      const name = String(item?.functionName || '').trim()
      if (!name) {
        continue
      }
      functionNames.add(name)
      const routes = routesByFunction.get(name) || []
      routes.push(normalizeRoute(item.path))
      routesByFunction.set(name, routes)
    }
  }

  return { functionNames, routesByFunction }
}

function routeOwnsPath(routes, routePath) {
  const candidate = normalizeRoute(routePath)
  return routes.some(route => {
    const normalized = normalizeRoute(route)
    return normalized === '/' || candidate === normalized || candidate.startsWith(`${normalized}/`)
  })
}

export function auditFunctionPathReferences(references, routeIndex) {
  const violations = []
  const unresolved = []

  for (const reference of references) {
    const normalized = normalizeFunctionPath(reference.rawPath)
    const [functionName, ...routeParts] = normalized.split('/')
    const routePath = routeParts.length ? `/${routeParts.join('/')}` : '/'

    if (reference.unresolved) {
      unresolved.push({
        file: reference.file,
        line: reference.line,
        functionName,
        routePrefix: normalizeRoute(routePath)
      })
    }

    if (!functionName || !routeIndex.functionNames.has(functionName)) {
      violations.push({
        code: 'function_not_declared',
        file: reference.file,
        line: reference.line,
        functionName: functionName || '(empty)'
      })
      continue
    }

    if (!routeOwnsPath(routeIndex.routesByFunction.get(functionName) || [], routePath)) {
      violations.push({
        code: 'route_not_declared',
        file: reference.file,
        line: reference.line,
        functionName,
        routePath: normalizeRoute(routePath)
      })
    }
  }

  return { violations, unresolved }
}

function parseArgs(argv) {
  const reportOnly = argv.includes('--report-only')
  const unsupported = argv.filter(arg => arg !== '--report-only')
  if (unsupported.length) {
    throw new Error(`不支持的参数：${unsupported.join(', ')}`)
  }
  return { reportOnly }
}

export function runAudit({ reportOnly = false } = {}) {
  const routeIndex = loadRouteIndex()
  const references = []
  const dynamicReferences = []
  for (const filePath of listFiles(SOURCE_ROOT).filter(file =>
    SOURCE_EXTENSIONS.has(path.extname(file).toLowerCase())
  )) {
    const source = fs.readFileSync(filePath, 'utf8')
    const extracted = extractFunctionPathReferences(source, filePath)
    references.push(...extracted.references)
    dynamicReferences.push(...extracted.dynamicReferences)
  }

  const { violations, unresolved } = auditFunctionPathReferences(references, routeIndex)
  const report = {
    status: violations.length ? 'FAIL' : 'PASS',
    scanned_references: references.length,
    unresolved_dynamic_references: [...unresolved, ...dynamicReferences],
    violations
  }
  console.log(JSON.stringify(report, null, 2))
  if (violations.length && !reportOnly) {
    process.exitCode = 1
  }
  return report
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === path.resolve(fileURLToPath(import.meta.url))) {
  runAudit(parseArgs(process.argv.slice(2)))
}
