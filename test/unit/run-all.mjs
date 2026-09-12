#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const ROOTS = ['test/unit/frontend', 'test/unit/backend']

function walk(root) {
  const entries = fs.existsSync(root) ? fs.readdirSync(root, { withFileTypes: true }) : []
  return entries.flatMap(entry => {
    const child = path.join(root, entry.name)
    if (entry.isDirectory()) {
      return walk(child)
    }
    return entry.isFile() ? [child] : []
  })
}

function isRealDataTest(file) {
  const normalized = file.replaceAll('\\', '/')
  return (
    normalized.includes('/real-data/') ||
    normalized.endsWith('.real-data.mjs') ||
    normalized.endsWith('-real-data.mjs')
  )
}

function listTests({ includeRealData = false, realDataOnly = false, filter = '' } = {}) {
  return ROOTS.flatMap(root => walk(root))
    .filter(file => file.endsWith('.mjs') || file.endsWith('.cjs'))
    .filter(file => includeRealData || !isRealDataTest(file))
    .filter(file => !realDataOnly || isRealDataTest(file))
    .filter(file => !filter || file.includes(filter))
    .sort()
}

function parseRunnerOptions(argv = []) {
  const filterArgument = argv.find(argument => argument.startsWith('--filter=')) || ''
  return {
    includeRealData: argv.includes('--real-data') || argv.includes('--real-data-only'),
    realDataOnly: argv.includes('--real-data-only'),
    filter: filterArgument.slice('--filter='.length)
  }
}

function extractSourceRefs(source, rootName) {
  const refs = new Set()
  const escaped = rootName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const patterns = [
    new RegExp(`(?:^|['"\`(])(?:\\.\\.\\/)+${escaped}\\/([^'"\`),\\s]+)`, 'g'),
    new RegExp(`(?:^|['"\`(])${escaped}\\/([^'"\`),\\s]+)`, 'g')
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      refs.add(`${rootName}/${match[1]}`.replaceAll('\\', '/'))
    }
  }
  return [...refs]
}

function mirrorsAnySourceDir(file, unitRoot, sourceRefs, sourceRoot) {
  const relativeTestDir = path.dirname(path.relative(unitRoot, file)).replaceAll('\\', '/')
  return sourceRefs.some(ref => {
    const sourceRelativeDir = path.dirname(ref.slice(`${sourceRoot}/`.length)).replaceAll('\\', '/')
    return (
      relativeTestDir === sourceRelativeDir || sourceRelativeDir.startsWith(`${relativeTestDir}/`)
    )
  })
}

function assertUnitIsolation(files) {
  const violations = []
  const layoutViolations = []
  for (const file of files) {
    const normalized = file.replaceAll('\\', '/')
    const base = path.basename(normalized)
    if (base.startsWith('test-')) {
      layoutViolations.push(`${file}: filename must not use test- prefix`)
    }
    const source = fs.readFileSync(file, 'utf8')
    const srcRefs = extractSourceRefs(source, 'src')
    const cloudRefs = extractSourceRefs(source, 'cloudfunctions')
    const touchesSrc = srcRefs.length > 0
    const touchesCloud = cloudRefs.length > 0
    if (normalized.startsWith('test/unit/frontend/') && touchesCloud) {
      layoutViolations.push(`${file}: frontend unit must not import cloudfunctions`)
    }
    if (normalized.startsWith('test/unit/backend/') && touchesSrc) {
      layoutViolations.push(`${file}: backend unit must not import src`)
    }
    if (
      normalized.startsWith('test/unit/frontend/') &&
      (!touchesSrc || !mirrorsAnySourceDir(file, 'test/unit/frontend', srcRefs, 'src'))
    ) {
      layoutViolations.push(`${file}: frontend unit must mirror at least one src source directory`)
    }
    if (
      normalized.startsWith('test/unit/backend/') &&
      (!touchesCloud ||
        !mirrorsAnySourceDir(file, 'test/unit/backend', cloudRefs, 'cloudfunctions'))
    ) {
      layoutViolations.push(
        `${file}: backend unit must mirror at least one cloudfunctions source directory`
      )
    }
    if (touchesSrc && touchesCloud) {
      violations.push(file)
    }
  }
  if (layoutViolations.length) {
    throw new Error(`unit layout violations:\n${layoutViolations.join('\n')}`)
  }
  if (violations.length) {
    throw new Error(`unit tests must not cross src and cloudfunctions: ${violations.join(', ')}`)
  }
}

function runTest(file) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [file], { stdio: 'inherit' })
    child.on('close', code => resolve({ file, code }))
    child.on('error', error => resolve({ file, code: 1, error }))
  })
}

const runnerOptions = parseRunnerOptions(process.argv.slice(2))
const allTests = listTests({ includeRealData: true })
const tests = listTests(runnerOptions)
assertUnitIsolation(allTests)

if (!tests.length) {
  throw new Error('没有匹配的单元测试；检查 --real-data-only 或 --filter 参数')
}

if (process.argv.includes('--check-layout-only')) {
  process.stdout.write(`[unit] layout check passed: ${allTests.length} files\n`)
  process.exit(0)
}

let failed = 0
for (const file of tests) {
  process.stdout.write(`\n[unit] ${file}\n`)
  const result = await runTest(file)
  if (result.code !== 0) {
    failed += 1
    process.stderr.write(`[unit] failed: ${file}\n`)
  }
}

process.stdout.write(`\n[unit] summary: ${tests.length - failed}/${tests.length} passed\n`)
process.exit(failed === 0 ? 0 : 1)
