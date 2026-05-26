#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname)

const allowedEnvFiles = new Set(['.env.local.example'])
const secretKeys = [
  'BAIDU_AK',
  'BAIDU_SK',
  'CLOUDBASE_AI_ACCESS_TOKEN',
  'CLOUDBASE_AI_API_KEY',
  'CLOUDBASE_SECRET_ID',
  'CLOUDBASE_SECRET_KEY',
  'HF_AUTOTRAIN_API_KEY',
  'LLM_API_KEY',
  'QWEATHER_API_KEY',
  'TENCENT_SECRET_ID',
  'TENCENT_SECRET_KEY',
  'TENCENTCLOUD_SECRETID',
  'TENCENTCLOUD_SECRETKEY',
  'WECHAT_MINIPROGRAM_PRIVATE_KEY'
]

const assignmentPattern = new RegExp(
  `(?:^|[\\s{,])["']?(${secretKeys.join('|')})["']?\\s*[:=]\\s*(.+)$`
)

function trackedFiles() {
  const output = execFileSync('git', ['ls-files', '-z', '--cached'], {
    cwd: projectRoot,
    encoding: 'buffer'
  })
  return String(output).split('\0').filter(Boolean)
}

function isBlockedPath(relPath) {
  const normalized = relPath.split(path.sep).join('/')
  const base = path.posix.basename(normalized)
  if (allowedEnvFiles.has(normalized)) {
    return false
  }
  if (base === '.env' || base.startsWith('.env.')) {
    return true
  }
  if (/\.(?:pem|key)$/i.test(base)) {
    return true
  }
  return /private.*key/i.test(base)
}

function looksBinary(buffer) {
  return buffer.includes(0)
}

function cleanValue(rawValue) {
  let value = String(rawValue || '').trim()
  if (value.endsWith(',')) {
    value = value.slice(0, -1).trim()
  }
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1).trim()
  }
  return value
}

function isPlaceholder(value, key) {
  const raw = String(value || '').trim()
  const normalized = cleanValue(value)
  const isQuoted =
    (raw.startsWith('"') && raw.includes('"', 1)) ||
    (raw.startsWith("'") && raw.includes("'", 1))
  if (!normalized) {
    return true
  }
  if (normalized === key) {
    return true
  }
  if (/\$\{\{\s*secrets\.[A-Z0-9_]+\s*}}/i.test(normalized)) {
    return true
  }
  if (/^\$\{[A-Z0-9_]+}$/i.test(normalized)) {
    return true
  }
  if (/^<[^>]+>$/.test(normalized)) {
    return true
  }
  if (/^(your-|replace_me|changeme|placeholder|xxx|__)/i.test(normalized)) {
    return true
  }
  if (!isQuoted && /^[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(normalized)) {
    return true
  }
  return normalized.length < 8
}

function scanContent(relPath, content) {
  const findings = []
  if (/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) {
    findings.push(`${relPath}: contains a private key block`)
  }
  if (/\bAKID[A-Za-z0-9]{20,}\b/.test(content)) {
    findings.push(`${relPath}: contains a Tencent SecretId-like token`)
  }

  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      return
    }
    const match = trimmed.match(assignmentPattern)
    if (!match) {
      return
    }
    const [, key, rawValue] = match
    if (!isPlaceholder(rawValue, key)) {
      findings.push(`${relPath}:${index + 1} assigns a non-placeholder value to ${key}`)
    }
  })

  return findings
}

function main() {
  const findings = []
  for (const relPath of trackedFiles()) {
    if (isBlockedPath(relPath)) {
      findings.push(`${relPath}: secret-bearing files must not be tracked`)
      continue
    }

    const absPath = path.join(projectRoot, relPath)
    if (!fs.existsSync(absPath) || fs.statSync(absPath).isDirectory()) {
      continue
    }

    const buffer = fs.readFileSync(absPath)
    if (looksBinary(buffer)) {
      continue
    }

    findings.push(...scanContent(relPath, buffer.toString('utf8')))
  }

  if (findings.length) {
    console.error('Secret check failed. Remove the values from tracked files and rotate any exposed key.')
    for (const finding of findings) {
      console.error(`- ${finding}`)
    }
    process.exit(1)
  }

  console.log('Secret check passed: no tracked plaintext credentials found.')
}

main()
