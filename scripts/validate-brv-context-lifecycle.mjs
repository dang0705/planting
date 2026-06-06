#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const ROOT = path.resolve(path.dirname(__filename), '..')
const TARGET_DIR = path.join(ROOT, '.brv', 'context-tree')
const MANIFEST_PATH = path.join(TARGET_DIR, '_manifest.json')
const CONTEXT_EXT = '.md'

const ALLOWED_STATUSES = new Set([
  'verified',
  'deprecated',
  'superseded',
  'provisional',
  'candidate',
  'observation'
])

const ALLOWED_OWNERS = new Set([
  'architecture',
  'frontend',
  'security',
  'testing',
  'tooling',
  'workflow',
  'project-management',
  'documentation',
  'ops',
  'ops-engineering'
])

const FACT_SOURCE_KINDS = new Set(['code', 'config', 'package'])
const REVIEW_AFTER_REGEX = /^(?:\d+[dwmy]|\d{4}-\d{2}-\d{2})$/i

function parseArgs(argv) {
  const opts = {
    includeBackups: false,
    includeNonManifest: false
  }
  for (const arg of argv) {
    if (arg === '--include-backups' || arg === '--backups') {
      opts.includeBackups = true
    }
    if (arg === '--include-non-manifest' || arg === '--all') {
      opts.includeNonManifest = true
    }
  }
  return opts
}

function listAllContextFiles(includeBackups) {
  const files = []
  const stack = [TARGET_DIR]
  while (stack.length) {
    const current = stack.pop()
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!includeBackups && full.includes(path.join('.brv', 'review-backups'))) {
          continue
        }
        stack.push(full)
      } else if (
        entry.isFile() &&
        path.extname(entry.name) === CONTEXT_EXT &&
        (includeBackups || !full.includes(path.join('.brv', 'review-backups')))
      ) {
        files.push(full)
      }
    }
  }
  return files.sort()
}

function listManifestContextFiles() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return listAllContextFiles(false)
  }
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
  const active = Array.isArray(manifest.active_context) ? manifest.active_context : []
  return active
    .filter(item => item && item.type === 'context' && String(item.path || '').endsWith(CONTEXT_EXT))
    .map(item => path.join(TARGET_DIR, item.path))
    .filter(filePath => fs.existsSync(filePath))
    .sort()
}

function listContextFiles(opts) {
  return opts.includeNonManifest
    ? listAllContextFiles(opts.includeBackups)
    : listManifestContextFiles()
}

function readFileMeta(lines) {
  const meta = {}
  for (const line of lines.slice(0, 40)) {
    const owner = /^Owner:\s*(.+?)\s*$/.exec(line)
    if (owner) {
      meta.owner = owner[1].trim()
    }
    const verified = /^Verified:\s*(\d{4}-\d{2}-\d{2})\s*$/.exec(line)
    if (verified) {
      meta.verified = verified[1].trim()
    }
    const reviewAfter = /^Review after:\s*(.+?)\s*$/.exec(line)
    if (reviewAfter) {
      meta.review_after = reviewAfter[1].trim()
    }
  }
  return meta
}

function fileExistsForSource(sourcePath) {
  if (!sourcePath || sourcePath === 'n/a') {
    return false
  }
  if (/^(user instruction|Archive\.zip|conversation|previous BRV)$/i.test(sourcePath)) {
    return false
  }
  return fs.existsSync(path.join(ROOT, sourcePath))
}

function validateFile(filePath) {
  const errors = []
  const text = fs.readFileSync(filePath, 'utf8')
  const lines = text.split(/\r?\n/)
  const fileMeta = readFileMeta(lines)

  let inEntry = false
  let currentId = null
  let entry = {}
  let entryStartLine = 0
  let entryLines = []
  let entryCount = 0
  let factCount = 0

  const flushEntry = () => {
    if (!inEntry) {
      return
    }
    entryCount += 1
    const blockText = entryLines.join('\n')
    const merged = {
      ...entry,
      owner: entry.owner || fileMeta.owner,
      verified: entry.verified || fileMeta.verified,
      review_after: entry.review_after || fileMeta.review_after
    }

    for (const key of ['verified', 'review_after', 'owner', 'status']) {
      if (!Object.prototype.hasOwnProperty.call(merged, key)) {
        errors.push({
          file: filePath,
          line: entryStartLine,
          id: currentId,
          field: key,
          message: `missing required field "${key}"`
        })
      }
    }

    if (merged.status && !ALLOWED_STATUSES.has(merged.status)) {
      errors.push({
        file: filePath,
        line: entryStartLine,
        id: currentId,
        field: 'status',
        message: `invalid status "${merged.status}"`
      })
    }
    if (merged.owner && !ALLOWED_OWNERS.has(merged.owner)) {
      errors.push({
        file: filePath,
        line: entryStartLine,
        id: currentId,
        field: 'owner',
        message: `invalid owner "${merged.owner}"`
      })
    }
    if (merged.review_after && !REVIEW_AFTER_REGEX.test(merged.review_after)) {
      errors.push({
        file: filePath,
        line: entryStartLine,
        id: currentId,
        field: 'review_after',
        message: `invalid review_after "${merged.review_after}"`
      })
    }
    if (merged.verified && !/^\d{4}-\d{2}-\d{2}$/.test(merged.verified)) {
      errors.push({
        file: filePath,
        line: entryStartLine,
        id: currentId,
        field: 'verified',
        message: `invalid verified date "${merged.verified}"`
      })
    }

    if (entry.type === 'fact') {
      factCount += 1
      if (!FACT_SOURCE_KINDS.has(entry.source_kind)) {
        errors.push({
          file: filePath,
          line: entryStartLine,
          id: currentId,
          field: 'source_kind',
          message: `fact must use source_kind in ${Array.from(FACT_SOURCE_KINDS).join(', ')}`
        })
      }
      if (!/^\s{4,}lines:\s*.+/m.test(blockText)) {
        errors.push({
          file: filePath,
          line: entryStartLine,
          id: currentId,
          field: 'source.lines',
          message: 'fact must include source.lines'
        })
      }
      const sourceFiles = [...blockText.matchAll(/^\s{4,}-?\s*file:\s*(.+?)\s*$/gm)]
        .map(match => match[1].trim())
      if (!sourceFiles.length) {
        errors.push({
          file: filePath,
          line: entryStartLine,
          id: currentId,
          field: 'source.file',
          message: 'fact must include source.file'
        })
      }
      for (const sourceFile of sourceFiles) {
        if (!fileExistsForSource(sourceFile)) {
          errors.push({
            file: filePath,
            line: entryStartLine,
            id: currentId,
            field: 'source.file',
            message: `source file not found: ${sourceFile}`
          })
        }
      }
    }
  }

  lines.forEach((line, idx) => {
    if (/^\s*-\s*id:/.test(line)) {
      flushEntry()
      inEntry = true
      entry = {}
      entryLines = [line]
      entryStartLine = idx + 1
      const match = /^\s*-\s*id:\s*(.+?)\s*$/.exec(line)
      currentId = match ? match[1] : `(line ${entryStartLine})`
      return
    }

    if (!inEntry) {
      return
    }

    entryLines.push(line)
    const match = /^\s{2,}([a-z_]+):\s*(.+?)\s*$/.exec(line)
    if (!match) {
      return
    }
    const key = match[1]
    const value = match[2]
    if (['type', 'status', 'owner', 'verified', 'review_after', 'source_kind'].includes(key)) {
      entry[key] = value
    }
  })

  flushEntry()
  return { errors, entryCount, factCount }
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const files = listContextFiles(opts)
  const allErrors = []
  let entryCount = 0
  let factCount = 0

  for (const filePath of files) {
    const result = validateFile(filePath)
    entryCount += result.entryCount
    factCount += result.factCount
    allErrors.push(...result.errors)
  }

  if (allErrors.length) {
    console.error('brv-context-lifecycle: FAILED')
    for (const error of allErrors) {
      console.error(`${error.file}:${error.line} [${error.id}] ${error.field}: ${error.message}`)
    }
    process.exit(1)
  }

  console.log(`brv-context-lifecycle: PASSED (${files.length} files, ${entryCount} entries, ${factCount} facts)`)
}

main()
