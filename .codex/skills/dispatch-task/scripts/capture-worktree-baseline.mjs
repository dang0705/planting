#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { normalizeGitPath, parsePorcelainV1Z } from './lib/git-status.mjs'

const [outFile] = process.argv.slice(2)
if (!outFile) {
  console.error('usage: capture-worktree-baseline.mjs <baseline-output.json>')
  process.exit(2)
}

const runGit = args => execFileSync('git', args, { encoding: 'utf8' }).replace(/\n$/, '')
const sha256 = textOrBuffer => crypto.createHash('sha256').update(textOrBuffer).digest('hex')
const safeGit = args => {
  try {
    return runGit(args)
  } catch {
    return ''
  }
}
const fileFingerprint = file => {
  const normalized = normalizeGitPath(file)
  const exists = fs.existsSync(normalized)
  const stat = exists ? fs.statSync(normalized) : null
  const isFile = Boolean(stat?.isFile?.())
  const worktree_sha256 = isFile ? sha256(fs.readFileSync(normalized)) : null
  const unstaged_diff_sha256 = sha256(safeGit(['diff', '--binary', '--', normalized]))
  const staged_diff_sha256 = sha256(safeGit(['diff', '--cached', '--binary', '--', normalized]))
  return {
    path: normalized,
    exists,
    is_file: isFile,
    worktree_sha256,
    unstaged_diff_sha256,
    staged_diff_sha256
  }
}

const status = parsePorcelainV1Z(
  execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
)
const statusFiles = [...new Set(status.map(item => item.path))].sort()
const baseline = {
  captured_at: new Date().toISOString(),
  git_root: runGit(['rev-parse', '--show-toplevel']),
  head: runGit(['rev-parse', 'HEAD']),
  status_files: statusFiles,
  status_entries: status,
  dirty_file_fingerprints: statusFiles.map(fileFingerprint),
  dirty: status.length > 0
}

fs.mkdirSync(path.dirname(outFile), { recursive: true })
fs.writeFileSync(outFile, `${JSON.stringify(baseline, null, 2)}\n`)
console.log(
  JSON.stringify(
    {
      status: 'captured',
      file: outFile,
      dirty: baseline.dirty,
      status_files: baseline.status_files,
      dirty_file_fingerprints: baseline.dirty_file_fingerprints.length
    },
    null,
    2
  )
)
