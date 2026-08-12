import crypto from 'node:crypto'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const QA_DIRECT_DEVTOOLS_BINARY =
  '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools'
export const QA_DIRECT_DEVTOOLS_PACKAGE =
  '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw'
const DEVTOOLS_INITIAL_CLI_PORT = 3799

export function buildTestOwnedDevToolsLaunch({
  profile,
  controlPort,
  appSessionId = crypto.randomBytes(8).toString('hex')
} = {}) {
  const normalizedProfile = path.resolve(String(profile || ''))
  if (!normalizedProfile || !Number.isInteger(Number(controlPort))) {
    throw new Error('test-owned DevTools launch requires profile and control port')
  }
  const pluginPath = path.join(normalizedProfile, 'WeappPlugin')
  return {
    command: QA_DIRECT_DEVTOOLS_BINARY,
    args: [
      QA_DIRECT_DEVTOOLS_PACKAGE,
      '--cli',
      '--remote-port',
      String(DEVTOOLS_INITIAL_CLI_PORT),
      '--ide-http-port',
      String(controlPort),
      `-load-extension=${pluginPath}`,
      `--custom-devtools-frontend=${pathToFileURL(path.join(pluginPath, 'inspector')).href}`,
      `--user-data-dir=${normalizedProfile}`,
      `--package-dir=${QA_DIRECT_DEVTOOLS_PACKAGE}`,
      `--app-session-id=${appSessionId}`
    ],
    app_session_id: appSessionId,
    control_port: Number(controlPort),
    profile: normalizedProfile
  }
}

export function launchTestOwnedDevTools({ spawnProcess = spawn, ...options } = {}) {
  const launch = buildTestOwnedDevToolsLaunch(options)
  const child = spawnProcess(launch.command, launch.args, {
    detached: true,
    stdio: 'ignore'
  })
  child.unref?.()
  return { ...launch, pid: child.pid ?? null }
}
