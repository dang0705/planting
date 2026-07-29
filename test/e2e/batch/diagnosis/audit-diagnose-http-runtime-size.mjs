#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const REPO_ROOT = path.resolve(__dirname, '../..')
const DEFAULT_ROOT = 'cloudfunctions/diagnose-http'
const DEFAULT_ENTRY = 'app.js'
const DEFAULT_LINE_THRESHOLD = 500
const DEFAULT_REDUCTION_TARGET_PERCENT = 30

function parseArgs(argv = []) {
  return argv.reduce((result, arg) => {
    if (!arg.startsWith('--')) {return result}
    const [rawKey, ...rest] = arg.slice(2).split('=')
    const key = rawKey.trim()
    result[key] = rest.length ? rest.join('=').trim() : 'true'
    return result
  }, {})
}

function walkJsFiles(dir) {
  const files = []
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules') {continue}
    const filepath = path.join(dir, name)
    const stat = fs.statSync(filepath)
    if (stat.isDirectory()) {
      files.push(...walkJsFiles(filepath))
    } else if (filepath.endsWith('.js')) {
      files.push(filepath)
    }
  }
  return files
}

function countLines(filepath) {
  const text = fs.readFileSync(filepath, 'utf8')
  if (!text) {return 0}
  const parts = text.split('\n')
  return text.endsWith('\n') ? parts.length - 1 : parts.length
}

function resolveLocalRequire(fromFile, specifier, fileSet) {
  if (!specifier.startsWith('.')) {return null}

  const base = path.resolve(path.dirname(fromFile), specifier)
  const candidates = [
    base,
    `${base}.js`,
    path.join(base, 'index.js')
  ]

  return candidates.find(candidate => fileSet.has(candidate)) || null
}

function collectReachableFiles(entryFile, fileSet) {
  const reachable = new Set()

  function visit(filepath) {
    if (!filepath || reachable.has(filepath)) {return}
    reachable.add(filepath)

    const source = fs.readFileSync(filepath, 'utf8')
    const requirePattern = /require\(\s*['"]([^'"]+)['"]\s*\)/g
    let match = requirePattern.exec(source)
    while (match) {
      const resolved = resolveLocalRequire(filepath, match[1], fileSet)
      if (resolved) {
        visit(resolved)
      }
      match = requirePattern.exec(source)
    }
  }

  visit(entryFile)
  return reachable
}

function buildReductionMetric(current, baseline, targetPercent = DEFAULT_REDUCTION_TARGET_PERCENT) {
  const normalizedCurrent = Number(current || 0)
  const normalizedBaseline = Number(baseline || 0)
  const normalizedTargetPercent = Number(targetPercent || DEFAULT_REDUCTION_TARGET_PERCENT)
  if (!Number.isFinite(normalizedBaseline) || normalizedBaseline <= 0) {
    return null
  }

  const reducedBy = normalizedBaseline - normalizedCurrent
  const reductionPercent = (reducedBy / normalizedBaseline) * 100
  return {
    baseline: normalizedBaseline,
    current: normalizedCurrent,
    reducedBy,
    reductionPercent: Number(reductionPercent.toFixed(2)),
    targetPercent: normalizedTargetPercent,
    targetMet: reductionPercent >= normalizedTargetPercent
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const rootDir = path.resolve(REPO_ROOT, args.root || DEFAULT_ROOT)
  const entryFile = path.resolve(rootDir, args.entry || DEFAULT_ENTRY)
  const lineThreshold = Number(args['line-threshold'] || DEFAULT_LINE_THRESHOLD)
  const reductionTargetPercent = Number(
    args['reduction-target-percent'] || DEFAULT_REDUCTION_TARGET_PERCENT
  )

  if (!fs.existsSync(rootDir)) {
    throw new Error(`目录不存在: ${rootDir}`)
  }
  if (!fs.existsSync(entryFile)) {
    throw new Error(`入口文件不存在: ${entryFile}`)
  }

  const files = walkJsFiles(rootDir).sort()
  const fileSet = new Set(files)
  const reachable = collectReachableFiles(entryFile, fileSet)
  const rows = files.map(filepath => ({
    file: path.relative(REPO_ROOT, filepath),
    lines: countLines(filepath),
    reachable: reachable.has(filepath)
  }))
  const overThreshold = rows
    .filter(row => row.lines > lineThreshold)
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file))
  const unreachable = rows
    .filter(row => !row.reachable)
    .sort((a, b) => b.lines - a.lines || a.file.localeCompare(b.file))

  const report = {
    root: path.relative(REPO_ROOT, rootDir),
    entry: path.relative(REPO_ROOT, entryFile),
    lineThreshold,
    reductionTargetPercent,
    totalJsFiles: rows.length,
    totalJsLines: rows.reduce((sum, row) => sum + row.lines, 0),
    reachableJsFiles: reachable.size,
    unreachableJsFiles: unreachable.length,
    unreachableJsLines: unreachable.reduce((sum, row) => sum + row.lines, 0),
    overThresholdFiles: overThreshold.length,
    overThreshold,
    unreachable
  }
  report.lineReduction = buildReductionMetric(
    report.totalJsLines,
    args['baseline-lines'],
    reductionTargetPercent
  )
  report.overThresholdReduction = buildReductionMetric(
    report.overThresholdFiles,
    args['baseline-over-threshold-files'],
    reductionTargetPercent
  )

  console.log(JSON.stringify(report, null, 2))
}

main()
