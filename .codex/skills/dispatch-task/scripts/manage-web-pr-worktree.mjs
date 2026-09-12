#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const [action, handoffFile, ...flags] = process.argv.slice(2)
if (!['prepare', 'cleanup'].includes(action) || !handoffFile) {
  console.error(
    'usage: manage-web-pr-worktree.mjs <prepare|cleanup> <handoff.json> [--force]'
  )
  process.exit(2)
}

const readJson = file => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (error) {
    console.error(JSON.stringify({ status: 'invalid_json', file, error: error.message }, null, 2))
    process.exit(2)
  }
}
const runGit = (args, cwd = process.cwd()) =>
  execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
const safeGit = (args, cwd = process.cwd()) => {
  try {
    return runGit(args, cwd)
  } catch {
    return ''
  }
}
const fail = (message, details = {}) => {
  console.error(JSON.stringify({ status: 'blocked', reason: message, ...details }, null, 2))
  process.exit(1)
}
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const hasUnsafeRefChars = value => /[\s~^:?*[\\]/.test(value) || value.includes('..')
const parseWorktreeList = text => {
  const entries = []
  let current = null
  for (const line of text.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) {
        entries.push(current)
      }
      current = { path: line.slice('worktree '.length) }
    } else if (current && line.startsWith('HEAD ')) {
      current.head = line.slice('HEAD '.length)
    } else if (current && line === 'bare') {
      current.bare = true
    } else if (current && line.startsWith('branch ')) {
      current.branch = line.slice('branch '.length)
    } else if (current && line === 'detached') {
      current.detached = true
    }
  }
  if (current) {
    entries.push(current)
  }
  return entries
}

const handoff = readJson(handoffFile)
const remoteSync = handoff?.external_contract?.remote_sync ?? handoff?.zcode_contract?.remote_sync ?? {}
const remote = remoteSync.remote
const branch = remoteSync.branch
const worktreePath = remoteSync.planned_worktree_path
if (remoteSync.required !== true || remoteSync.status !== 'pushed') {
  fail('handoff remote_sync must be required=true and status=pushed')
}
for (const [name, value] of Object.entries({ remote, branch, worktreePath })) {
  if (!nonEmptyString(value)) {
    fail(`remote_sync.${name} is required`)
  }
}
if (hasUnsafeRefChars(remote) || hasUnsafeRefChars(branch)) {
  fail('remote_sync remote/branch contains unsafe git ref characters', { remote, branch })
}

const gitRoot = runGit(['rev-parse', '--show-toplevel'])
const resolvedWorktreePath = path.resolve(worktreePath)
if (resolvedWorktreePath === path.resolve(gitRoot)) {
  fail('planned worktree path must not be the main git root', { worktreePath })
}
if (resolvedWorktreePath.startsWith(`${path.resolve(gitRoot)}${path.sep}`)) {
  fail('planned worktree path must not be inside the main git root', { worktreePath })
}

const remoteRef = `${remote}/${branch}`
const commandsRun = []
const runRecordedGit = args => {
  commandsRun.push(`git ${args.join(' ')}`)
  return runGit(args)
}

if (action === 'prepare') {
  if (fs.existsSync(resolvedWorktreePath)) {
    fail('planned worktree path already exists', { worktreePath: resolvedWorktreePath })
  }
  runRecordedGit(['fetch', remote, branch])
  runRecordedGit(['worktree', 'add', resolvedWorktreePath, remoteRef])
  const worktreeHead = runGit(['rev-parse', 'HEAD'], resolvedWorktreePath)
  console.log(
    JSON.stringify(
      {
        status: 'prepared',
        dispatch_run_id: handoff.dispatch_run_id,
        remote_branch: remoteRef,
        worktree_path: resolvedWorktreePath,
        worktree_head: worktreeHead,
        commands_run: commandsRun,
        main_workspace: gitRoot
      },
      null,
      2
    )
  )
  process.exit(0)
}

const force = flags.includes('--force')
const worktrees = parseWorktreeList(runGit(['worktree', 'list', '--porcelain']))
const registered = worktrees.find(entry => path.resolve(entry.path) === resolvedWorktreePath)
if (!registered) {
  fail('planned worktree path is not a registered git worktree', {
    worktree_path: resolvedWorktreePath
  })
}
const dirty = safeGit(['status', '--short', '--untracked-files=all'], resolvedWorktreePath)
if (dirty && !force) {
  fail('planned worktree has local changes; rerun cleanup with --force only after confirming they are disposable', {
    worktree_path: resolvedWorktreePath,
    dirty_status: dirty.split('\n').filter(Boolean)
  })
}
runRecordedGit(['worktree', 'remove', ...(force ? ['--force'] : []), resolvedWorktreePath])
console.log(
  JSON.stringify(
    {
      status: 'removed',
      dispatch_run_id: handoff.dispatch_run_id,
      worktree_path: resolvedWorktreePath,
      forced: force,
      commands_run: commandsRun,
      main_workspace: gitRoot
    },
    null,
    2
  )
)
