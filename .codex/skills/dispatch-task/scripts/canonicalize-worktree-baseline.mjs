#!/usr/bin/env node
import crypto from 'node:crypto'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import {
  canonicalizeLegacyQuotedBaseline,
  normalizeGitPath,
  parsePorcelainV1Z
} from './lib/git-status.mjs'

const [baselineFile] = process.argv.slice(2)
if (!baselineFile) {
  console.error('usage: canonicalize-worktree-baseline.mjs <worktree-baseline.json>')
  process.exit(2)
}

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex')
const runGit = args => execFileSync('git', args, { encoding: 'utf8' }).replace(/\n$/, '')
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
  return {
    path: normalized,
    exists,
    is_file: isFile,
    worktree_sha256: isFile ? sha256(fs.readFileSync(normalized)) : null,
    unstaged_diff_sha256: sha256(safeGit(['diff', '--binary', '--', normalized])),
    staged_diff_sha256: sha256(safeGit(['diff', '--cached', '--binary', '--', normalized]))
  }
}

let baseline
try {
  baseline = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
} catch (error) {
  console.error(
    JSON.stringify({ status: 'invalid_json', baseline_file: baselineFile, error: error.message })
  )
  process.exit(2)
}

const repair = canonicalizeLegacyQuotedBaseline(baseline, {
  currentStatusEntries: parsePorcelainV1Z(
    execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  ),
  getFingerprint: fileFingerprint
})
if (repair.errors.length) {
  console.error(
    JSON.stringify(
      {
        status: 'blocked',
        baseline_file: baselineFile,
        errors: repair.errors,
        canonicalizations: repair.canonicalizations
      },
      null,
      2
    )
  )
  process.exit(1)
}
if (repair.canonicalizations.length) {
  const temporary = `${baselineFile}.canonicalize-${process.pid}`
  fs.writeFileSync(temporary, `${JSON.stringify(repair.baseline, null, 2)}\n`)
  fs.renameSync(temporary, baselineFile)
}
console.log(
  JSON.stringify(
    {
      status: repair.canonicalizations.length ? 'canonicalized' : 'already_canonical',
      baseline_file: baselineFile,
      canonicalizations: repair.canonicalizations
    },
    null,
    2
  )
)
