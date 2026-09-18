import path from 'node:path'

import {
  assertInstalledDevToolsBundle,
  SYSTEM_APP_ASAR,
  SYSTEM_ELECTRON,
  isOfficialElectronBundle
} from './patch-wechat-devtools-launcher.mjs'

export const INSTALLED_DEVTOOLS_NW_BINARY =
  '/Applications/wechatwebdevtools.app/Contents/MacOS/wechatdevtools'
export const INSTALLED_DEVTOOLS_PACKAGE =
  '/Applications/wechatwebdevtools.app/Contents/Resources/package.nw'

function requiredPort(value, name) {
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error(`native DevTools ${name} must be a valid port`)
  }
  return port
}

/**
 * Build the argument vector for the installed Electron DevTools runtime.
 * Electron receives the parent user-data root and derives the release
 * product-hash directory itself; passing the legacy hash directory here
 * creates a second profile and strands the enrolled auth state.
 */
export function buildOfficialElectronDevToolsArgs({
  servicePort,
  controlPort,
  userDataDir,
  appSessionId,
  appAsar = SYSTEM_APP_ASAR
} = {}) {
  const installedBundle = assertInstalledDevToolsBundle()
  if (!isOfficialElectronBundle() || installedBundle.runtime_kind !== 'official_electron') {
    throw new Error('official Electron DevTools bundle is unavailable')
  }
  const resolvedAppAsar = path.resolve(String(appAsar || installedBundle.app_asar))
  if (resolvedAppAsar !== path.resolve(installedBundle.app_asar)) {
    throw new Error('official Electron DevTools app.asar must be the installed bundle')
  }
  const normalizedUserDataDir = path.resolve(String(userDataDir || ''))
  if (!normalizedUserDataDir || normalizedUserDataDir === path.parse(normalizedUserDataDir).root) {
    throw new Error('official Electron DevTools runtime requires an isolated user-data-dir')
  }
  if (!appSessionId) {
    throw new Error('official Electron DevTools runtime requires app-session-id')
  }
  return [
    resolvedAppAsar,
    '--cli',
    '--remote-port',
    String(requiredPort(servicePort, 'servicePort')),
    '--enable-service-port',
    `--user-data-dir=${normalizedUserDataDir}`,
    `--app-session-id=${String(appSessionId)}`,
    // The 2.02.2609012 bootstrap reads this as a two-token pair, not an
    // equals-form flag; the latter silently selects a random control port.
    '--ide-http-port',
    String(requiredPort(controlPort, 'controlPort'))
  ]
}

export const OFFICIAL_ELECTRON_COMMAND = SYSTEM_ELECTRON

/**
 * The only supported formal runtime argument shape. QA and managed-daily
 * entrypoints may differ in profile and fixed ports, but never in the
 * executable/package/bootstrap contract.
 */
export function buildInstalledNativeDevToolsArgs({
  servicePort,
  controlPort,
  userDataDir,
  extensionPath = null,
  customFrontend = null,
  appSessionId,
  packageDir = INSTALLED_DEVTOOLS_PACKAGE,
  browserDebugPort = null
} = {}) {
  const normalizedPackage = path.resolve(String(packageDir || ''))
  if (normalizedPackage !== path.resolve(INSTALLED_DEVTOOLS_PACKAGE)) {
    throw new Error('native DevTools runtime package must be the installed package.nw')
  }
  const normalizedProfile = path.resolve(String(userDataDir || ''))
  if (!normalizedProfile || normalizedProfile === path.parse(normalizedProfile).root) {
    throw new Error('native DevTools runtime requires an isolated user-data-dir')
  }
  if (!appSessionId) {
    throw new Error('native DevTools runtime requires app-session-id')
  }
  const normalizedBrowserDebugPort =
    browserDebugPort === null || browserDebugPort === undefined
      ? null
      : requiredPort(browserDebugPort, 'browserDebugPort')
  const args = [
    normalizedPackage,
    '--cli',
    '--remote-port',
    String(requiredPort(servicePort, 'servicePort')),
    '--enable-service-port',
    `--user-data-dir=${normalizedProfile}`,
    `--package-dir=${normalizedPackage}`,
    '--ide-http-port',
    String(requiredPort(controlPort, 'controlPort'))
  ]
  if (normalizedBrowserDebugPort) {
    // WeChat DevTools forwards this Chromium flag literally. The value must
    // stay in the same token; the split form reaches renderer argv without a
    // port value and silently produces no CDP listener.
    args.push(`--remote-debugging-port=${normalizedBrowserDebugPort}`)
  }
  if (extensionPath) {
    args.push(`-load-extension=${path.resolve(String(extensionPath))}`)
  }
  if (customFrontend) {
    args.push(`--custom-devtools-frontend=${String(customFrontend)}`)
  }
  args.push(`--user-data-dir=${normalizedProfile}`, `--app-session-id=${appSessionId}`)
  return args
}
