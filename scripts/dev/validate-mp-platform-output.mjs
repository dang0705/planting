#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(new URL('../..', import.meta.url).pathname)

function fail(message) {
  const error = new Error(message)
  error.code = 'MP_PLATFORM_OUTPUT_INVALID'
  throw error
}

function parseArgs(argv) {
  const options = { platform: '', outputDir: '' }
  for (const arg of argv) {
    const [key, ...parts] = String(arg || '').split('=')
    const value = parts.join('=').trim()
    if (key === '--platform') options.platform = value
    if (key === '--output-dir') options.outputDir = value
  }
  return options
}

function readManifestAppId(platform) {
  const manifest = fs.readFileSync(path.join(projectRoot, 'src', 'manifest.json'), 'utf8')
  const platformBlock = manifest.match(
    new RegExp(`"${platform}"\\s*:\\s*\\{([\\s\\S]*?)\\n\\s*\\}`, 'u')
  )?.[1]
  const appId = platformBlock?.match(/"appid"\s*:\s*"([^"]+)"/u)?.[1]?.trim()
  if (!appId) {
    fail(`src/manifest.json 缺少 ${platform}.appid`)
  }
  return appId
}

export function validateMpPlatformOutput({ platform, outputDir } = {}) {
  const normalizedPlatform = String(platform || '').trim()
  if (!['mp-toutiao', 'mp-xhs', 'mp-weixin'].includes(normalizedPlatform)) {
    fail(`不支持的目标平台：${normalizedPlatform || 'unknown'}`)
  }
  const expectedAppId = readManifestAppId(normalizedPlatform)
  const root = path.resolve(projectRoot, outputDir || path.join('dist', 'dev', normalizedPlatform))
  const configPath = path.join(root, 'project.config.json')
  if (!fs.existsSync(configPath)) {
    fail(`缺少小程序产物配置：${configPath}`)
  }
  let config
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    fail(`小程序产物配置不是有效 JSON：${configPath}`)
  }
  const actualAppId = String(config?.appid || '').trim()
  if (!actualAppId || actualAppId === 'testAppId' || actualAppId !== expectedAppId) {
    fail(
      `小程序产物 AppID 不匹配：expected=${expectedAppId} actual=${actualAppId || 'missing'} output=${root}`
    )
  }
  const appJsonPath = path.join(root, 'app.json')
  if (fs.existsSync(appJsonPath)) {
    try {
      JSON.parse(fs.readFileSync(appJsonPath, 'utf8'))
    } catch {
      fail(`小程序 app.json 不是有效 JSON：${appJsonPath}`)
    }
  }
  return { platform: normalizedPlatform, outputDir: root, appId: actualAppId }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)
) {
  try {
    const result = validateMpPlatformOutput(parseArgs(process.argv.slice(2)))
    process.stdout.write(`mp platform output ready: ${JSON.stringify(result)}\n`)
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exit(1)
  }
}
