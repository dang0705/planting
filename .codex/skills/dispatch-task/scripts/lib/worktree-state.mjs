import fs from 'node:fs'
import crypto from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { normalizeGitPath, parsePorcelainV1Z } from './git-status.mjs'

const normalize = normalizeGitPath
const sha256 = textOrBuffer => crypto.createHash('sha256').update(textOrBuffer).digest('hex')
const runGit = args => execFileSync('git', args, { encoding: 'utf8' }).replace(/\n$/, '')
const safeGit = args => {
  try {
    return runGit(args)
  } catch {
    return ''
  }
}

export const ignoredStatusFile = file => {
  const normalized = normalize(file)
  return (
    normalized === '.tmp' ||
    normalized.startsWith('.tmp/') ||
    normalized === '.codex/tmp' ||
    normalized.startsWith('.codex/tmp/') ||
    normalized === '.e2e-artifacts' ||
    normalized.startsWith('.e2e-artifacts/')
  )
}

export const fileFingerprint = file => {
  const normalized = normalize(file)
  const exists = fs.existsSync(normalized)
  const stat = exists ? fs.statSync(normalized) : null
  const isFile = Boolean(stat?.isFile?.())
  return {
    path: normalized,
    exists,
    is_file: isFile,
    worktree_sha256: isFile ? sha256(fs.readFileSync(normalized)) : null,
    unstaged_diff_sha256: sha256(safeGit(['diff', '--binary', '--', normalized])),
    staged_diff_sha256: sha256(safeGit(['diff', '--cached', '--binary', '--', normalized]))
  }
}

export const sameFingerprint = (left, right) =>
  left &&
  right &&
  left.exists === right.exists &&
  left.is_file === right.is_file &&
  left.worktree_sha256 === right.worktree_sha256 &&
  left.unstaged_diff_sha256 === right.unstaged_diff_sha256 &&
  left.staged_diff_sha256 === right.staged_diff_sha256

export const currentStatusEntries = () =>
  parsePorcelainV1Z(
    execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  )

export const currentStatusFiles = () =>
  [...new Set(currentStatusEntries().map(entry => normalize(entry.path)))].filter(
    file => !ignoredStatusFile(file)
  )

export const changedSinceBaselineFiles = baseline => {
  const baselineSet = new Set((baseline.status_files ?? []).map(normalize))
  return currentStatusFiles().filter(file => !baselineSet.has(file))
}
