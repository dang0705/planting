#!/usr/bin/env node
import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const CONFIG_NAME = '.mp-e2e.json'
const skillRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const scaffoldRoot = path.join(skillRoot, 'scaffold')
const force = process.argv.includes('--force')
const dirArg = process.argv.slice(2).find(value => !value.startsWith('--'))

function gitRoot(cwd) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

async function exists(file) {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return null
  }
}

function isTaroPackage(pkg) {
  if (!pkg || typeof pkg !== 'object') {return false}
  const deps = { ...pkg.dependencies, ...pkg.devDependencies }
  return Boolean(deps['@tarojs/taro'] || deps['@tarojs/cli'])
}

async function decide(initDir) {
  const existingE2e = path.join(initDir, 'qa', 'e2e')
  const nestedE2e = path.join(initDir, 'src-taro', 'qa', 'e2e')
  const localPkg = await readJson(path.join(initDir, 'package.json'))
  const nestedPkg = await readJson(path.join(initDir, 'src-taro', 'package.json'))

  if (await exists(path.join(existingE2e, 'run.mjs')) || await exists(path.join(existingE2e, 'suite.manifest.json'))) {
    return { packageRoot: '.', e2eRoot: path.join('qa', 'e2e') }
  }
  if (await exists(path.join(nestedE2e, 'run.mjs')) || await exists(path.join(nestedE2e, 'suite.manifest.json'))) {
    return { packageRoot: 'src-taro', e2eRoot: path.join('src-taro', 'qa', 'e2e') }
  }
  if (isTaroPackage(localPkg)) {
    return { packageRoot: '.', e2eRoot: path.join('qa', 'e2e') }
  }
  if (isTaroPackage(nestedPkg)) {
    return { packageRoot: 'src-taro', e2eRoot: path.join('src-taro', 'qa', 'e2e') }
  }
  return { packageRoot: '.', e2eRoot: path.join('qa', 'e2e') }
}

async function listFiles(root) {
  const files = []
  async function walk(current) {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute)
        continue
      }
      if (entry.isFile()) {files.push(absolute)}
    }
  }
  await walk(root)
  return files
}

async function writeIfNeeded(destination, source) {
  const already = await exists(destination)
  if (already && !force) {
    return 'skipped'
  }
  await mkdir(path.dirname(destination), { recursive: true })
  await copyFile(source, destination)
  return already ? 'replaced' : 'written'
}

async function ensureScaffold({ initDir, e2eAbs }) {
  const written = []
  const skipped = []
  const replaced = []
  const qaScaffold = path.join(scaffoldRoot, 'qa-e2e')

  for (const source of await listFiles(qaScaffold)) {
    const relative = path.relative(qaScaffold, source)
    const destination = path.join(e2eAbs, relative)
    const result = await writeIfNeeded(destination, source)
    const record = path.relative(initDir, destination)
    if (result === 'written') {written.push(record)}
    else if (result === 'replaced') {replaced.push(record)}
    else {skipped.push(record)}
  }

  return { written, skipped, replaced }
}

const cwd = process.cwd()
const initDir = path.resolve(dirArg || gitRoot(cwd) || cwd)
const configPath = path.join(initDir, CONFIG_NAME)
const decided = await decide(initDir)
const layout = {
  version: 1,
  initDir: '.',
  packageRoot: decided.packageRoot,
  e2eRoot: decided.e2eRoot,
  artifact: path.join(decided.packageRoot, 'dist'),
  suite: path.join(decided.e2eRoot, 'suite.manifest.json'),
  adapter: path.join(decided.e2eRoot, 'adapter', 'babolat-adapter.mjs'),
  leaves: path.join(decided.e2eRoot, 'leaves'),
  cli: path.join(decided.packageRoot, 'packages', 'miniprogram-e2e', 'src', 'cli', 'mp-e2e.mjs')
}

const e2eAbs = path.join(initDir, layout.e2eRoot)
if (!await exists(path.join(scaffoldRoot, 'qa-e2e'))) {
  throw new Error(`missing skill scaffold: ${path.join(scaffoldRoot, 'qa-e2e')}`)
}

const files = await ensureScaffold({ initDir, e2eAbs })
await writeFile(configPath, `${JSON.stringify(layout, null, 2)}\n`)

process.stdout.write(`${JSON.stringify({
  status: 'initialized',
  initDir,
  configPath,
  layout,
  files
}, null, 2)}\n`)
