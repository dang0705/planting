#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const SELF_PATH = path.relative(ROOT, __filename).replace(/\\/g, '/')
const LEGACY_VALIDATOR_BASENAME = ['validate', 'brv', 'context', 'lifecycle'].join('-')
const LEGACY_SCRIPT = `scripts/${LEGACY_VALIDATOR_BASENAME}.mjs`
const LEGACY_PACKAGE_SCRIPT = ['check', ['brv', 'context', 'lifecycle'].join('-')].join(':')
const REQUIRED_PACKAGE_SCRIPT = 'node scripts/check-brv-v4-boundary.mjs'
const REQUIRED_WORKFLOW_RUN = 'npm run check:brv-v4-boundary'
const FORBIDDEN_PATTERNS = [
  new RegExp(LEGACY_VALIDATOR_BASENAME, 'g'),
  new RegExp(LEGACY_PACKAGE_SCRIPT.replace(':', '\\:'), 'g')
]
const SCAN_TARGETS = [
  'README.md',
  'docs',
  'package.json',
  '.github',
  'scripts'
]

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function walkFiles(targetPath) {
  const absolutePath = path.join(ROOT, targetPath)
  if (!fs.existsSync(absolutePath)) {
    return []
  }

  const stat = fs.statSync(absolutePath)
  if (stat.isFile()) {
    return [targetPath]
  }

  const files = []
  const stack = [absolutePath]

  while (stack.length) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(fullPath)
        continue
      }
      if (!entry.isFile()) {
        continue
      }
      files.push(path.relative(ROOT, fullPath).replace(/\\/g, '/'))
    }
  }

  return files.sort()
}

function collectScanFiles() {
  const files = new Set()
  for (const target of SCAN_TARGETS) {
    for (const file of walkFiles(target)) {
      if (file === SELF_PATH) {
        continue
      }
      files.add(file)
    }
  }
  return [...files].sort()
}

function findForbiddenRefs(files) {
  const matches = []

  for (const relativePath of files) {
    const text = readText(path.join(ROOT, relativePath))
    const lines = text.split(/\r?\n/)
    for (const pattern of FORBIDDEN_PATTERNS) {
      pattern.lastIndex = 0
      lines.forEach((line, index) => {
        if (pattern.test(line)) {
          matches.push(`${relativePath}:${index + 1}: ${line.trim()}`)
        }
        pattern.lastIndex = 0
      })
    }
  }

  return matches
}

function fail(messages) {
  console.error('check-brv-v4-boundary: FAILED')
  for (const message of messages) {
    console.error(`- ${message}`)
  }
  process.exit(1)
}

function main() {
  const errors = []
  const legacyScriptPath = path.join(ROOT, LEGACY_SCRIPT)

  if (fs.existsSync(legacyScriptPath)) {
    errors.push(`legacy V3 validator still exists: ${LEGACY_SCRIPT}`)
  }

  const packageJson = JSON.parse(readText(path.join(ROOT, 'package.json')))
  const packageScript = packageJson.scripts?.['check:brv-v4-boundary']
  if (packageScript !== REQUIRED_PACKAGE_SCRIPT) {
    errors.push(
      `package.json scripts.check:brv-v4-boundary must equal "${REQUIRED_PACKAGE_SCRIPT}", got "${packageScript ?? 'missing'}"`
    )
  }

  const workflowText = readText(path.join(ROOT, '.github/workflows/pr-check.yml'))
  if (!workflowText.includes(REQUIRED_WORKFLOW_RUN)) {
    errors.push(`PR workflow must run "${REQUIRED_WORKFLOW_RUN}"`)
  }

  const forbiddenMatches = findForbiddenRefs(collectScanFiles())
  if (forbiddenMatches.length) {
    errors.push('forbidden V3 references found:')
    errors.push(...forbiddenMatches)
  }

  if (errors.length) {
    fail(errors)
  }

  console.log('check-brv-v4-boundary: PASSED')
}

main()
