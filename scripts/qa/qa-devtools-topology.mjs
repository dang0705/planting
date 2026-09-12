import path from 'node:path'
import { SYSTEM_APP_ASAR, SYSTEM_ELECTRON } from './patch-wechat-devtools-launcher.mjs'

// Side-effect-free topology facts shared by launch and read-only QA checks.
// Importing this module must never start or inspect a DevTools process.
export const CONTROL_PORTS = Object.freeze({ daily: 9423, qa: 9422 })
export const SERVICE_PORTS = Object.freeze({ daily: 3798, qa: 3799 })
// QA-only Chromium CDP port used for the native auth rebind. It is fixed and
// owner-checked; it is never exposed as the Automator or daily debug channel.
export const NATIVE_DEBUG_PORTS = Object.freeze({ daily: null, qa: 9424 })

export function profileFromCommand(command) {
  const match = String(command || '').match(
    /--user-data-dir=(?:"([^"]+)"|'([^']+)'|(.*?)(?=\s+-{1,2}[\w-]|\s*$))/u
  )
  return match ? path.resolve(match[1] || match[2] || match[3]) : null
}

// A Chromium renderer/helper also carries --user-data-dir, but it is not the
// process that owns the DevTools profile. Treating such an orphan as an active
// DevTools instance blocks safe broker refresh and makes a later launch report
// a false profile conflict.
export function isDevToolsMainProcess(command) {
  const text = String(command || '')
  const officialElectron =
    text.includes(SYSTEM_ELECTRON) &&
    text.includes(SYSTEM_APP_ASAR) &&
    /(?:^|\s)--cli(?:\s|$)/u.test(text)
  const legacyNative = /\/wechatdevtools(?:\s|$)/u.test(text)
  return (officialElectron || legacyNative) && !text.includes(' Helper')
}
