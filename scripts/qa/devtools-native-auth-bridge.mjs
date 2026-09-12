import crypto from 'node:crypto'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { QA_RUNTIME_NATIVE_AUTH_DEBUG_PORT } from '../../.codex/skills/dispatch-task/scripts/dispatch-gate/lib/qa-runtime-plane.mjs'

const require = createRequire(import.meta.url)
const NativeWebSocket = globalThis.WebSocket || require('ws')

export const QA_NATIVE_AUTH_DEBUG_PORT = QA_RUNTIME_NATIVE_AUTH_DEBUG_PORT
export const NATIVE_AUTH_MODULE_HINT = 'getUserInfo/updateUserInfo'

function errorWithCode(code, message, details = {}) {
  return Object.assign(new Error(message), { code, ...details })
}

function validPort(port) {
  const value = Number(port)
  return Number.isInteger(value) && value > 0 && value <= 65_535 ? value : null
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex')
}

function authSummary(value) {
  return {
    generation: Number(value?.authGeneration) || null,
    identity_hash: value?.identityHash || null,
    openid_present: typeof value?.openid === 'string' && value.openid.length > 0,
    ticket_length: typeof value?.newticket === 'string' ? value.newticket.length : 0,
    signature_length: typeof value?.signature === 'string' ? value.signature.length : 0,
    source_role: value?.sourceRole || null,
    writer_role: value?.writerRole || null
  }
}

function requireAuthMaterial(auth) {
  const required = ['openid', 'signature', 'newticket', 'identityHash']
  const missing = required.filter(key => typeof auth?.[key] !== 'string' || !auth[key])
  if (missing.length > 0 || !(Number(auth?.authGeneration) > 0)) {
    throw errorWithCode('qa_native_auth_material_invalid', '原生 DevTools 认证重绑定材料不完整', {
      missing,
      auth: authSummary(auth)
    })
  }
  if (sha256(auth.openid) !== auth.identityHash) {
    throw errorWithCode(
      'qa_native_auth_identity_invalid',
      '原生 DevTools 认证重绑定材料身份校验失败',
      { auth: authSummary(auth) }
    )
  }
  return auth
}

function lsofListenerPids(port) {
  const result = spawnSync('lsof', [`-tiTCP:${Number(port)}`, '-sTCP:LISTEN'], {
    encoding: 'utf8'
  })
  if (result.status !== 0) {
    return []
  }
  return String(result.stdout || '')
    .split(/\s+/u)
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value > 0)
}

function processCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return String(result.stdout || '').trim()
}

function processParent(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' })
  const parent = Number(String(result.stdout || '').trim())
  return Number.isInteger(parent) && parent > 0 ? parent : null
}

function hasArgument(command, flag, value) {
  const text = String(command || '')
  return text.includes(`${flag}=${value}`) || text.includes(`${flag} ${value}`)
}

function isDescendantOrSelf(pid, ancestorPid) {
  const target = Number(pid)
  const ancestor = Number(ancestorPid)
  const visited = new Set()
  let current = target
  while (current && !visited.has(current)) {
    if (current === ancestor) {
      return true
    }
    visited.add(current)
    current = processParent(current)
  }
  return false
}

function assertPortValue(port) {
  const value = validPort(port)
  if (!value) {
    throw errorWithCode('qa_native_auth_debug_port_invalid', '原生 DevTools 调试端口无效', { port })
  }
  return value
}

export function assertNativeAuthDebugPortAvailable({
  port = QA_NATIVE_AUTH_DEBUG_PORT,
  profile = null
} = {}) {
  const normalizedPort = assertPortValue(port)
  const pids = lsofListenerPids(normalizedPort)
  if (pids.length > 0) {
    throw errorWithCode(
      'qa_native_auth_debug_port_conflict',
      'QA 原生认证调试端口已被占用，禁止跳端口或停止未知进程',
      {
        port: normalizedPort,
        listener_pids: pids,
        profile: profile || null,
        commands: pids.map(pid => processCommand(pid)).filter(Boolean)
      }
    )
  }
  return { status: 'available', port: normalizedPort, profile: profile || null }
}

export function assertNativeAuthDebugPortOwnership({
  port = QA_NATIVE_AUTH_DEBUG_PORT,
  mainPid,
  profile
} = {}) {
  const normalizedPort = assertPortValue(port)
  const expectedProfile = `--user-data-dir=${String(profile || '')}`
  const listenerPids = lsofListenerPids(normalizedPort)
  const evidence = listenerPids.map(pid => ({
    pid,
    command: processCommand(pid),
    owned_by_main: isDescendantOrSelf(pid, mainPid),
    profile_match: processCommand(pid).includes(expectedProfile),
    debug_port_match: hasArgument(processCommand(pid), '--remote-debugging-port', normalizedPort)
  }))
  const verified =
    evidence.length > 0 &&
    evidence.every(item => item.owned_by_main && item.profile_match && item.debug_port_match)
  if (!verified) {
    throw errorWithCode(
      'qa_native_auth_debug_port_owner_unverified',
      '原生 DevTools 认证调试端口的进程所有权无法证明',
      { port: normalizedPort, main_pid: Number(mainPid) || null, evidence }
    )
  }
  return { status: 'verified', port: normalizedPort, main_pid: Number(mainPid), evidence }
}

async function fetchJson(url, timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    return await response.json()
  } finally {
    clearTimeout(timer)
  }
}

async function findExtensionTarget({ port, timeoutMs }) {
  const deadline = Date.now() + timeoutMs
  let lastError = null
  while (Date.now() < deadline) {
    try {
      const targets = await fetchJson(`http://127.0.0.1:${port}/json/list`, 1000)
      const target = targets.find(
        item =>
          item?.type === 'page' &&
          String(item.url || '').startsWith('chrome-extension://') &&
          item.webSocketDebuggerUrl
      )
      if (target) {
        return target
      }
      lastError = new Error('extension target unavailable')
    } catch (error) {
      lastError = error
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  throw errorWithCode(
    'qa_native_auth_bridge_target_unavailable',
    '原生 DevTools 认证桥接页未在启动窗口内出现',
    { port, timeout_ms: timeoutMs, cause: lastError?.message || null }
  )
}

function connectWebSocket(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const socket = new NativeWebSocket(url)
    const timer = setTimeout(() => {
      try {
        socket.close()
      } catch {
        // The connection may not have been established yet.
      }
      reject(
        errorWithCode('qa_native_auth_bridge_connect_timeout', '原生 DevTools 认证桥接连接超时')
      )
    }, timeoutMs)
    socket.addEventListener(
      'open',
      () => {
        clearTimeout(timer)
        resolve(socket)
      },
      { once: true }
    )
    socket.addEventListener(
      'error',
      error => {
        clearTimeout(timer)
        reject(
          errorWithCode('qa_native_auth_bridge_connect_failed', '原生 DevTools 认证桥接连接失败', {
            cause: String(error?.message || error)
          })
        )
      },
      { once: true }
    )
  })
}

function callCdp(socket, method, params = {}, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 2 ** 30) + 1
    const timer = setTimeout(() => {
      socket.removeEventListener('message', onMessage)
      reject(
        errorWithCode('qa_native_auth_bridge_call_timeout', `原生 DevTools ${method} 调用超时`, {
          method
        })
      )
    }, timeoutMs)
    const onMessage = event => {
      let value
      try {
        value = JSON.parse(event.data)
      } catch {
        return
      }
      if (value.id !== id) {
        return
      }
      clearTimeout(timer)
      socket.removeEventListener('message', onMessage)
      if (value.error) {
        reject(
          errorWithCode('qa_native_auth_bridge_call_failed', `原生 DevTools ${method} 调用失败`, {
            method
          })
        )
        return
      }
      resolve(value)
    }
    socket.addEventListener('message', onMessage)
    socket.send(JSON.stringify({ id, method, params }))
  })
}

export function buildNativeAuthSyncExpression(auth) {
  const material = JSON.stringify(requireAuthMaterial(auth))
  return `(() => {
    const auth = ${material};
    const modulePath = Object.keys(require.cache || {}).find((candidate) => {
      try {
        const value = require(candidate);
        return typeof value?.getUserInfo === 'function' && typeof value?.updateUserInfo === 'function';
      } catch {
        return false;
      }
    });
    if (!modulePath) {
      return JSON.stringify({ ok: false, code: 'qa_native_auth_module_unavailable' });
    }
    const authModule = require(modulePath);
    const before = authModule.getUserInfo?.() || null;
    authModule.updateUserInfo(auth);
    const after = authModule.getUserInfo?.() || null;
    const named = (name) => localStorage.getItem('userInfo_' + name);
    const matches = Boolean(
      after?.openid === auth.openid &&
      after?.signature === auth.signature &&
      after?.newticket === auth.newticket &&
      String(after?.authGeneration) === String(auth.authGeneration) &&
      after?.identityHash === auth.identityHash &&
      named('openid') === auth.openid &&
      named('signature') === auth.signature &&
      named('newticket') === auth.newticket &&
      named('authGeneration') === String(auth.authGeneration) &&
      named('identityHash') === auth.identityHash
    );
    return JSON.stringify({
      ok: matches,
      code: matches ? 'qa_native_auth_state_synced' : 'qa_native_auth_state_mismatch',
      module_path: modulePath,
      before: {
        generation: before?.authGeneration || null,
        identity_hash: before?.identityHash || null,
        ticket_length: before?.newticket?.length || 0
      },
      after: {
        generation: after?.authGeneration || null,
        identity_hash: after?.identityHash || null,
        ticket_length: after?.newticket?.length || 0,
        login_status: named('loginStatus') || null
      },
      storage: {
        user_info_keys_count: (() => { try { return JSON.parse(localStorage.getItem('userInfoKeys') || '[]').length; } catch { return 0; } })(),
        named_ticket_length: (named('newticket') || '').length,
        named_generation: named('authGeneration') || null
      }
    });
  })()`
}

export async function syncNativeAuthRuntime({
  auth,
  mainPid,
  profile,
  port = QA_NATIVE_AUTH_DEBUG_PORT,
  timeoutMs = 8_000
} = {}) {
  const material = requireAuthMaterial(auth)
  const normalizedPort = assertPortValue(port)
  const ownership = assertNativeAuthDebugPortOwnership({
    port: normalizedPort,
    mainPid,
    profile
  })
  const target = await findExtensionTarget({ port: normalizedPort, timeoutMs })
  const socket = await connectWebSocket(target.webSocketDebuggerUrl, Math.min(timeoutMs, 3_000))
  try {
    const result = await callCdp(
      socket,
      'Runtime.evaluate',
      { expression: buildNativeAuthSyncExpression(material), returnByValue: true },
      Math.min(timeoutMs, 3_000)
    )
    const value = result?.result?.result?.value
    let bridge
    try {
      bridge = JSON.parse(value)
    } catch {
      bridge = null
    }
    if (!bridge?.ok || bridge.code !== 'qa_native_auth_state_synced') {
      throw errorWithCode(
        bridge?.code || 'qa_native_auth_state_sync_failed',
        '原生 DevTools 认证状态未能在启动阶段完成一致性校验',
        { ownership, target_url: target.url, bridge: bridge || { raw_type: typeof value } }
      )
    }
    return {
      status: 'ready',
      code: 'qa_native_auth_state_synced',
      port: normalizedPort,
      target_url: target.url,
      ownership,
      bridge: {
        code: bridge.code,
        module_path: bridge.module_path,
        before: bridge.before,
        after: bridge.after,
        storage: bridge.storage,
        expected: authSummary(material)
      }
    }
  } finally {
    try {
      socket.close()
    } catch {
      // The bridge connection is disposable and may already be closed.
    }
  }
}
