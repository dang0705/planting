#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const errors = []

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath)
  if (!fs.existsSync(absolutePath)) {
    errors.push(`missing required file: ${relativePath}`)
    return ''
  }
  return fs.readFileSync(absolutePath, 'utf8')
}

const configText = read('.openviking/config.json')
if (configText) {
  try {
    const config = JSON.parse(configText)
    if (config.version !== 1) errors.push('.openviking/config.json version must be 1')
    if (config.peer?.id !== 'planting') errors.push('.openviking/config.json peer.id must be planting')
  } catch {
    errors.push('.openviking/config.json must be valid JSON')
  }
}

const readme = read('README.md')
if (/memory source has .*ByteRover V4/i.test(readme)) {
  errors.push('README.md still declares ByteRover V4 as the default memory source')
}

const agents = read('AGENTS.md')
if (/AI memories:\s*ByteRover\s*$/im.test(agents)) {
  errors.push('AGENTS.md still declares ByteRover as the default memory source')
}

const claude = read('CLAUDE.md')
for (const [file, content] of [['AGENTS.md', agents], ['CLAUDE.md', claude]]) {
  if (/byterover|\bbrv\b|\.brv(?:space|\/)/i.test(content)) {
    errors.push(`${file} still contains a legacy ByteRover memory reference`)
  }
}

const governance = read('docs/KNOWLEDGE_GOVERNANCE.md')
const defaultMemoryLine = governance
  .split(/\r?\n/)
  .find((line) => line.includes('当前默认 memory source 是'))
const openVikingIndex = defaultMemoryLine?.indexOf('OpenViking') ?? -1
const byteRoverIndex = defaultMemoryLine?.indexOf('ByteRover V4') ?? -1
if (byteRoverIndex >= 0 && (openVikingIndex < 0 || byteRoverIndex < openVikingIndex)) {
  errors.push('docs/KNOWLEDGE_GOVERNANCE.md still declares ByteRover V4 as the default memory source')
}

const packageJson = JSON.parse(read('package.json'))
if (packageJson.scripts?.['check:openviking-memory-boundary'] !== 'node scripts/check-openviking-memory-boundary.mjs') {
  errors.push('package.json must expose check:openviking-memory-boundary')
}

const workflow = read('.github/workflows/pr-check.yml')
if (!workflow.includes('npm run check:openviking-memory-boundary')) {
  errors.push('.github/workflows/pr-check.yml must run the OpenViking memory boundary check')
}

if (errors.length) {
  console.error('check:openviking-memory-boundary: FAILED')
  for (const error of errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log('check:openviking-memory-boundary: PASSED')
