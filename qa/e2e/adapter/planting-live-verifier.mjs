import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { resolveLocalApiBaseUrl } from '../../../scripts/dev/local-api-env-config.mjs'

function commandOf(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], { encoding: 'utf8' })
  return result.status === 0 ? String(result.stdout || '').trim() : ''
}

function listenerPids(port) {
  const result = spawnSync('lsof', ['-tiTCP:' + Number(port), '-sTCP:LISTEN'], { encoding: 'utf8' })
  return result.status === 0
    ? String(result.stdout || '').split(/\s+/u).filter(Boolean).map(Number).filter(Number.isFinite)
    : []
}

function parentPid(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' })
  return result.status === 0 ? Number(String(result.stdout || '').trim()) || null : null
}

function isDescendantOf(pid, ancestor) {
  let current = Number(pid)
  for (let hop = 0; current > 1 && hop < 16; hop += 1) {
    if (current === Number(ancestor)) {return true}
    current = parentPid(current)
  }
  return false
}

async function assertRuntimeArtifactSidecar(projectPath) {
  const sidecarPath = path.join(String(projectPath || ''), 'mp-e2e.contract.json')
  let contract
  try {
    contract = JSON.parse(await readFile(sidecarPath, 'utf8'))
  } catch (cause) {
    const error = new Error('QA DevTools project does not contain the compiled-asset sidecar')
    error.code = 'planting_runtime_sidecar_missing'
    error.cause = cause
    throw error
  }
  if (contract?.contractVersion !== 1 || contract?.adapter?.id !== 'planting') {
    const error = new Error('QA DevTools project contains an invalid compiled-asset sidecar')
    error.code = 'planting_runtime_sidecar_invalid'
    error.details = { sidecarPath, contract }
    throw error
  }
  return { verified: true, path: sidecarPath, sha_contract_version: contract.contractVersion }
}

function assertOwnership({ mainPid, controlPort, automatorPort, profile, projectPath }) {
  const normalizedMainPid = Number(mainPid)
  const command = commandOf(mainPid)
  const expectedUserDataDir = path.dirname(path.resolve(String(profile || '')))
  const commandMatches =
    command.includes('/Contents/MacOS/Electron ') &&
    command.includes('/Contents/Resources/app.asar') &&
    command.includes(`--ide-http-port ${controlPort}`) &&
    command.includes(`--user-data-dir=${expectedUserDataDir}`)
  const controlOwners = listenerPids(controlPort)
  const automatorOwners = listenerPids(automatorPort)
  const controlMatches = controlOwners.includes(normalizedMainPid)
  const automatorMatches = automatorOwners.length === 1 && isDescendantOf(automatorOwners[0], normalizedMainPid)
  if (!commandMatches || !controlMatches || !automatorMatches) {
    const error = new Error('QA DevTools ownership did not match the isolated profile and ports')
    error.code = 'planting_qa_ownership_unverified'
    error.details = {
      mainPid: normalizedMainPid,
      controlPort,
      automatorPort,
      command,
      expectedUserDataDir,
      controlOwners,
      automatorOwners,
      commandMatches,
      controlMatches,
      automatorMatches
    }
    throw error
  }
  return {
    verified: true,
    main_devtools_pid: mainPid,
    control_port: controlPort,
    automator_port: automatorPort,
    profile,
    project_path: projectPath,
    control_listener_pids: controlOwners,
    automator_listener_pids: automatorOwners
  }
}

async function verifyAuthenticatedWxRequest(miniProgram) {
  const baseUrl = resolveLocalApiBaseUrl(
    { mode: 'lan', port: 3010, functionPortBase: 9000 },
    process.env
  ).replace(/\/+$/u, '')
  const requestUrl = baseUrl.replace(/\/(?:plant-user-http\/)?user-plants\/health$/u, '') + '/plant-user-http/user-plants?page=1&pageSize=1'
  const slot = `__mpE2eLiveRequest_${Date.now()}_${process.pid}`
  const cloudEnvId = String(
    process.env.CLOUDBASE_ENV_ID || process.env.VITE_CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e'
  ).trim()
  await miniProgram.evaluate(
    function (resultSlot, url, environmentId) {
      globalThis[resultSlot] = { state: 'pending' }
      const finish = value => { globalThis[resultSlot] = { state: 'done', ...value } }
      if (!wx.cloud || typeof wx.cloud.callFunction !== 'function') {
        finish({ ok: false, error: 'wx.cloud.callFunction unavailable' })
        return
      }
      try {
        wx.cloud.init({ env: environmentId, traceUser: false })
      } catch (error) {
        finish({ ok: false, error: error?.errMsg || error?.message || 'wx.cloud.init failed' })
        return
      }
      wx.cloud.callFunction({
        name: 'wechat-identity',
        data: {},
        success(identityResult) {
          const openid = String(identityResult?.result?.openid || '')
          if (!openid) {
            finish({ ok: false, error: 'wechat identity missing openid' })
            return
          }
          wx.request({
            url,
            method: 'GET',
            header: { 'x-wx-openid': openid, 'x-openid': openid, 'x-app-env': 'development', 'x-env': 'development' },
            success(response) {
              const body = response?.data || {}
              finish({
                ok: Number(response?.statusCode) === 200 && Number(body?.code) === 200,
                statusCode: response?.statusCode ?? null,
                responseCode: body?.code ?? null,
                error: body?.message || null
              })
            },
            fail(error) { finish({ ok: false, error: error?.errMsg || String(error) }) }
          })
        },
        fail(error) { finish({ ok: false, error: error?.errMsg || String(error) }) }
      })
    },
    slot,
    requestUrl,
    cloudEnvId
  )
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    const result = await miniProgram.evaluate(function (resultSlot) {
      return globalThis[resultSlot] || null
    }, slot)
    if (result?.state === 'done') {
      if (!result.ok) {
        const error = new Error(result.error || 'authenticated wx.request failed')
        error.code = 'planting_runtime_wx_request_failed'
        error.details = { requestUrl, result }
        throw error
      }
      return { verified: true, request_url: requestUrl, status_code: result.statusCode, response_code: result.responseCode }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  const error = new Error('authenticated wx.request timed out')
  error.code = 'planting_runtime_wx_request_timeout'
  throw error
}

/** @param {object} miniProgram */
export async function verifyPlantingLiveRuntime(miniProgram, {
  projectPath,
  profile,
  mainPid,
  controlPort = 9422,
  automatorPort = 9421
} = {}) {
  const sidecar = await assertRuntimeArtifactSidecar(projectPath)
  const ownership = assertOwnership({ mainPid, controlPort, automatorPort, profile, projectPath })
  const page = await Promise.race([
    miniProgram.currentPage().catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), 5_000))
  ])
  if (!page) {
    const error = new Error('Automator did not expose a current page')
    error.code = 'planting_runtime_page_unavailable'
    throw error
  }
  const runtimeRequest = await verifyAuthenticatedWxRequest(miniProgram)
  return { sidecar, ownership, runtime_request: runtimeRequest, page_path: page.path || null }
}
