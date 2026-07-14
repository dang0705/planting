#!/usr/bin/env node
import fs from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const [handoffFile, projectPathArg] = process.argv.slice(2)
if (!handoffFile) {
  console.error('usage: check-miniprogram-qa-env.mjs <handoff.json> [projectPath]')
  process.exit(2)
}

const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)))
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'))
const nonEmptyString = value => typeof value === 'string' && value.trim().length > 0
const normalize = value =>
  path
    .resolve(String(value))
    .replaceAll('\\', '/')
    .replace(/\/+$/, '')

const handoff = readJson(handoffFile)
const external = handoff.external_contract ?? handoff.zcode_contract ?? {}
const provider = external.provider || (external.external_implementer === 'zcode_glm' ? 'zcode' : '')
const webExternal =
  ['trae', 'chrome_cloud_agent'].includes(provider) || external.prompt_transport === 'browser_plugin'
const expectedProjectPath = webExternal && nonEmptyString(external?.remote_sync?.planned_worktree_path)
  ? path.join(external.remote_sync.planned_worktree_path, 'dist', 'dev', 'mp-weixin')
  : path.join(repoRoot, 'dist', 'dev', 'mp-weixin')
const actualProjectPath = projectPathArg || expectedProjectPath
const runtimeAcceptanceMode =
  handoff?.validation?.runtime_acceptance_mode ??
  (handoff?.validation?.miniprogram_automator_required === true ? 'automator_required' : null)

const checkPort = port =>
  new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port, timeout: 1000 })
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => resolve(false))
  })

const devtoolsCli = '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
const projectConfig = path.join(actualProjectPath, 'project.config.json')
const envLocal = path.join(path.dirname(path.dirname(path.dirname(actualProjectPath))), '.env.local')
const port9420 = await checkPort(9420)
const errors = []

if (normalize(actualProjectPath) !== normalize(expectedProjectPath)) {
  errors.push(`projectPath must match expected path: ${normalize(expectedProjectPath)}`)
}
if (!fs.existsSync(projectConfig)) {errors.push('project.config.json is missing under projectPath')}
if (!fs.existsSync(devtoolsCli)) {errors.push('WeChat DevTools CLI is missing')}
if (!fs.existsSync(envLocal)) {errors.push('.env.local is missing for runtime worktree')}
if (runtimeAcceptanceMode === 'automator_required' && !port9420) {
  errors.push('automator_required requires 9420 to be listening')
}

const report = {
  status: errors.length ? 'blocked' : 'passed',
  gate: 'miniprogram_qa_env',
  projectPath: normalize(actualProjectPath),
  expectedProjectPath: normalize(expectedProjectPath),
  project_config_exists: fs.existsSync(projectConfig),
  devtools_cli_exists: fs.existsSync(devtoolsCli),
  env_local_exists: fs.existsSync(envLocal),
  automator_port_9420_listening: port9420,
  port_9420_note: port9420
    ? 'transport is reachable; page and wx.request evidence are still required'
    : 'port is not listening; run or reuse WeChat DevTools automator before automator_required QA',
  errors
}

console.log(JSON.stringify(report, null, 2))
process.exit(errors.length ? 1 : 0)
