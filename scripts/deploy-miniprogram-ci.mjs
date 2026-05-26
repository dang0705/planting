#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const projectRoot = path.resolve(new URL('..', import.meta.url).pathname)

function parseArgs(argv = []) {
  const parsed = {
    action: '',
    appid: '',
    desc: '',
    dryRun: false,
    pagePath: '',
    privateKeyPath: '',
    projectPath: '',
    qrcodeOutput: '',
    robot: '',
    version: ''
  }

  for (const arg of argv) {
    if (arg === '--dry-run') {
      parsed.dryRun = true
      continue
    }
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (!match) {
      continue
    }
    const key = match[1].replace(/-([a-z])/g, (_, char) => char.toUpperCase())
    if (Object.hasOwn(parsed, key)) {
      parsed[key] = match[2].trim()
    }
  }

  return parsed
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function sanitizeVersion(value) {
  return String(value || '')
    .replace(/[^0-9A-Za-z._-]/g, '-')
    .slice(0, 64)
}

function normalizePrivateKey(rawValue = '') {
  let value = String(rawValue || '').trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  value = value.replace(/\\n/g, '\n').trim()
  return value.endsWith('\n') ? value : `${value}\n`
}

function buildOptions(args) {
  const pkg = readJson(path.join(projectRoot, 'package.json'))
  const runSuffix = process.env.GITHUB_RUN_NUMBER ? `-${process.env.GITHUB_RUN_NUMBER}` : ''
  const sha = process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : 'local'
  const targetEnv = process.env.TARGET_ENV || process.env.VITE_APP_ENV || 'local'
  const action = String(
    args.action ||
    process.env.MINIPROGRAM_CI_ACTION ||
    process.env.GITHUB_EVENT_INPUT_MINIPROGRAM_ACTION ||
    'preview'
  ).trim()

  return {
    action,
    appid: String(args.appid || process.env.WECHAT_MINIPROGRAM_APPID || '').trim(),
    desc: String(
      args.desc ||
      process.env.MINIPROGRAM_CI_DESC ||
      `GitHub Actions ${targetEnv} ${action} ${sha}`
    ).slice(0, 256),
    dryRun: args.dryRun,
    pagePath: String(args.pagePath || process.env.MINIPROGRAM_CI_PAGE_PATH || '').trim(),
    privateKey: String(process.env.WECHAT_MINIPROGRAM_PRIVATE_KEY || '').trim(),
    privateKeyPath: String(
      args.privateKeyPath ||
      process.env.WECHAT_MINIPROGRAM_PRIVATE_KEY_PATH ||
      ''
    ).trim(),
    projectPath: path.resolve(
      projectRoot,
      args.projectPath ||
      process.env.MINIPROGRAM_CI_PROJECT_PATH ||
      'dist/build/mp-weixin'
    ),
    qrcodeOutput: path.resolve(
      projectRoot,
      args.qrcodeOutput ||
      process.env.MINIPROGRAM_CI_QRCODE_OUTPUT ||
      path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'miniprogram-preview-qrcode.jpg')
    ),
    robot: Number(args.robot || process.env.MINIPROGRAM_CI_ROBOT || 1),
    version: sanitizeVersion(
      args.version ||
      process.env.MINIPROGRAM_CI_VERSION ||
      `${pkg.version || '0.0.0'}${runSuffix}`
    )
  }
}

function validateOptions(options) {
  if (!['preview', 'upload'].includes(options.action)) {
    throw new Error('MINIPROGRAM_CI_ACTION 只能是 preview 或 upload。')
  }
  if (!options.appid) {
    throw new Error('缺少 WECHAT_MINIPROGRAM_APPID。')
  }
  if (!Number.isInteger(options.robot) || options.robot < 1 || options.robot > 30) {
    throw new Error('MINIPROGRAM_CI_ROBOT 必须是 1 到 30 的整数。')
  }
  if (
    String(process.env.TARGET_ENV || '').trim().toLowerCase() === 'prod' &&
    String(process.env.MINIPROGRAM_CI_UPLOAD_SOURCE_MAP || '').trim().toLowerCase() === 'true'
  ) {
    throw new Error('生产小程序上传禁止开启 MINIPROGRAM_CI_UPLOAD_SOURCE_MAP。')
  }
  if (!options.dryRun) {
    if (!fs.existsSync(options.projectPath)) {
      throw new Error(`缺少小程序构建目录：${options.projectPath}`)
    }
    if (!fs.existsSync(path.join(options.projectPath, 'project.config.json'))) {
      throw new Error('小程序构建目录缺少 project.config.json，请先运行微信小程序构建。')
    }
    if (!options.privateKey && !options.privateKeyPath) {
      throw new Error('缺少微信小程序 CI 私钥，请配置 WECHAT_MINIPROGRAM_PRIVATE_KEY 或 WECHAT_MINIPROGRAM_PRIVATE_KEY_PATH。')
    }
  }
}

function materializePrivateKey(options) {
  if (options.privateKeyPath) {
    return {
      privateKeyPath: options.privateKeyPath,
      cleanup: () => {}
    }
  }

  const tempRoot = process.env.RUNNER_TEMP || os.tmpdir()
  const tempDir = fs.mkdtempSync(path.join(tempRoot, 'miniprogram-ci-'))
  const privateKeyPath = path.join(tempDir, 'private.key')
  fs.writeFileSync(privateKeyPath, normalizePrivateKey(options.privateKey), { mode: 0o600 })
  return {
    privateKeyPath,
    cleanup: () => fs.rmSync(tempDir, { recursive: true, force: true })
  }
}

function hardenProjectConfig(options) {
  if (options.action !== 'upload' || process.env.MINIPROGRAM_CI_UPLOAD_SOURCE_MAP === 'true') {
    return
  }

  const configPath = path.join(options.projectPath, 'project.config.json')
  const config = readJson(configPath)
  config.setting = {
    ...(config.setting || {}),
    uploadWithSourceMap: false
  }
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`)
  console.log('miniprogram-ci upload source map disabled in build artifact.')
}

async function runCi(options) {
  const ci = require('miniprogram-ci')
  hardenProjectConfig(options)
  const key = materializePrivateKey(options)

  try {
    const project = new ci.Project({
      appid: options.appid,
      type: 'miniProgram',
      projectPath: options.projectPath,
      privateKeyPath: key.privateKeyPath,
      ignores: ['node_modules/**/*']
    })
    const setting = { useProjectConfig: true }

    if (options.action === 'upload') {
      await ci.upload({
        project,
        version: options.version,
        desc: options.desc,
        setting,
        robot: options.robot
      })
      console.log(`miniprogram-ci upload finished: version ${options.version}`)
      return
    }

    const previewOptions = {
      project,
      desc: options.desc,
      setting,
      robot: options.robot,
      qrcodeFormat: 'image',
      qrcodeOutputDest: options.qrcodeOutput
    }
    if (options.pagePath) {
      previewOptions.pagePath = options.pagePath
    }
    await ci.preview(previewOptions)
    console.log(`miniprogram-ci preview finished: ${options.qrcodeOutput}`)
  } finally {
    key.cleanup()
  }
}

async function main() {
  const options = buildOptions(parseArgs(process.argv.slice(2)))
  validateOptions(options)

  console.log(`miniprogram-ci action: ${options.action}`)
  console.log(`miniprogram project: ${path.relative(projectRoot, options.projectPath)}`)
  console.log(`miniprogram version: ${options.version}`)

  if (options.dryRun) {
    console.log('Dry run only: no miniprogram-ci command was executed.')
    return
  }

  await runCi(options)
}

main().catch(error => {
  console.error(String(error?.stack || error))
  process.exit(1)
})
