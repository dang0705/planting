/* oxlint-disable no-console, no-magic-numbers */
import { spawn } from 'node:child_process'

const SCF_API_VERSION = '2018-04-16'
const DEFAULT_ALIAS = '$DEFAULT'
const LATEST_VERSION = '$LATEST'
const SHA256_PATTERN = /^[a-f0-9]{64}$/u

export const IMMUTABLE_DEFAULT_RELEASE_FUNCTIONS = new Set(['diagnose-http'])

// 关键函数的线上入口必须指向不可变数字版本；只更新 $LATEST 不会改变已绑定别名的流量。

function redactTcbArgs(args = []) {
  const redacted = []
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index]
    redacted.push(item)
    if (item === '--apiKeyId' || item === '--apiKey' || item === '--token') {
      index += 1
      redacted.push('***')
    }
  }
  return redacted
}

export function parseJsonFromOutput(output = '') {
  const text = String(output || '').trim()
  if (!text) {
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    // CloudBase CLI may print a short banner before JSON; parse the JSON fragment below.
  }

  const firstObject = text.indexOf('{')
  const lastObject = text.lastIndexOf('}')
  if (firstObject >= 0 && lastObject > firstObject) {
    return JSON.parse(text.slice(firstObject, lastObject + 1))
  }

  const firstArray = text.indexOf('[')
  const lastArray = text.lastIndexOf(']')
  if (firstArray >= 0 && lastArray > firstArray) {
    return JSON.parse(text.slice(firstArray, lastArray + 1))
  }

  return null
}

function unwrapCloudApiResponse(parsed = {}) {
  const payload = parsed?.Response || parsed?.response || parsed?.data || parsed
  const error = parsed?.error || payload?.Error || payload?.error
  if (error) {
    const code = String(error?.Code || error?.code || 'CLOUDBASE_API_ERROR')
    const message = String(error?.Message || error?.message || 'CloudBase API 调用失败')
    throw new Error(`${code}: ${message}`)
  }
  return payload
}

function readFirstValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value
    }
  }
  return ''
}

export function summarizeFunctionDetail(functionName, parsedDetail = {}) {
  const payload = Array.isArray(parsedDetail) ? parsedDetail[0] : parsedDetail
  const data = payload?.data || payload?.Data || payload?.result || payload?.Result || payload
  const detail =
    data?.Function || data?.function || data?.FunctionInfo || data?.functionInfo || data
  return {
    name: readFirstValue(detail, ['name', 'Name', 'FunctionName', 'functionName']) || functionName,
    status: readFirstValue(detail, ['status', 'Status']),
    runtime: readFirstValue(detail, ['runtime', 'Runtime']),
    memorySize: readFirstValue(detail, ['memorySize', 'MemorySize']),
    timeout: readFirstValue(detail, ['timeout', 'Timeout']),
    codeSize: readFirstValue(detail, ['codeSize', 'CodeSize']),
    codeSha256: readFirstValue(detail, ['codeSha256', 'CodeSha256']),
    handler: readFirstValue(detail, ['handler', 'Handler']),
    layers: Array.isArray(detail?.Layers || detail?.layers)
      ? (detail.Layers || detail.layers).map(layer => ({
          name: readFirstValue(layer, ['name', 'Name', 'LayerName', 'layerName']),
          version: readFirstValue(layer, ['version', 'Version', 'LayerVersion'])
        }))
      : [],
    modificationTime: readFirstValue(detail, [
      'modificationTime',
      'ModificationTime',
      'updateTime',
      'UpdateTime',
      'updatedAt',
      'UpdatedAt',
      'ModTime'
    ])
  }
}

function runTcb({ args, env, cwd, packageName, inheritOutput = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['--yes', '--package', packageName, 'tcb', ...args], {
      cwd,
      env,
      stdio: inheritOutput ? 'inherit' : ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    if (!inheritOutput) {
      child.stdout.on('data', chunk => {
        stdout += String(chunk)
      })
      child.stderr.on('data', chunk => {
        stderr += String(chunk)
      })
    }
    child.on('error', reject)
    child.on('exit', code => {
      if (code === 0) {
        resolve({ stdout, stderr })
        return
      }
      reject(new Error(`tcb ${redactTcbArgs(args).join(' ')} exited with code ${code}`))
    })
  })
}

function hasTrafficRouting(alias = {}) {
  const routing = alias?.RoutingConfig || alias?.routingConfig || {}
  return [
    routing.AdditionalVersionWeights,
    routing.AddtionVersionMatchs,
    routing.AdditionVersionMatches
  ].some(items => Array.isArray(items) && items.length > 0)
}

export function assertSafeDefaultAlias(alias = {}, functionName = '') {
  const name = String(alias?.Name || alias?.name || '')
  const version = String(alias?.FunctionVersion || alias?.functionVersion || '')
  if (name !== DEFAULT_ALIAS || !version) {
    throw new Error(`${functionName} 缺少可回读的 ${DEFAULT_ALIAS} 别名，停止发布。`)
  }
  if (!/^\d+$/u.test(version)) {
    throw new Error(`${functionName} 的 ${DEFAULT_ALIAS} 未指向不可变数字版本，停止发布。`)
  }
  if (hasTrafficRouting(alias)) {
    throw new Error(`${functionName} 的 ${DEFAULT_ALIAS} 存在灰度流量，禁止自动覆盖。`)
  }
  return { name, version }
}

function normalizeCodeHash(response = {}, label = '') {
  const hash = String(response?.CodeSha256 || response?.codeSha256 || '')
    .trim()
    .toLowerCase()
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`${label} 未返回合法 CodeSha256，停止发布。`)
  }
  return hash
}

function releaseDescription(deploymentId = '', sourceFingerprint = '') {
  const deployment = String(deploymentId || '')
    .replace(/[^a-zA-Z0-9_.-]/gu, '')
    .slice(0, 80)
  const source = String(sourceFingerprint || '').toLowerCase()
  return `planting-deploy:${deployment};source:${source.slice(0, 24)}`
}

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds))
}

async function waitForVersionActive(client, functionName, namespace, version) {
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    const detail = await client.callScf('GetFunction', {
      FunctionName: functionName,
      Namespace: namespace,
      Qualifier: version,
      ShowCode: 'FALSE'
    })
    const status = String(detail?.AvailableStatus || detail?.Status || '')
    if (status === 'Available' || status === 'Active') {
      return detail
    }
    if (/failed|error/iu.test(status)) {
      throw new Error(`${functionName} 版本 ${version} 状态异常：${status}`)
    }
    await client.wait(1500)
  }
  throw new Error(`${functionName} 新版本等待可用超时。`)
}

async function waitForCodeAddress(client, functionName, namespace, qualifier) {
  let lastError = null
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      return await client.callScf('GetFunctionAddress', {
        FunctionName: functionName,
        Namespace: namespace,
        Qualifier: qualifier
      })
    } catch (error) {
      lastError = error
      if (attempt < 20) {
        await client.wait(1500)
      }
    }
  }
  throw new Error(
    `${functionName} ${qualifier} 代码摘要在等待可用后仍无法读取：${String(lastError?.message || lastError)}`
  )
}

async function rollbackDefaultAlias(client, functionName, namespace, beforeAlias) {
  const previous = assertSafeDefaultAlias(beforeAlias, functionName)
  await client.callScf('UpdateAlias', {
    FunctionName: functionName,
    Namespace: namespace,
    Name: DEFAULT_ALIAS,
    FunctionVersion: previous.version,
    Description: String(beforeAlias?.Description || '')
  })
  const rollbackAlias = await client.callScf('GetAlias', {
    FunctionName: functionName,
    Namespace: namespace,
    Name: DEFAULT_ALIAS
  })
  const verified = assertSafeDefaultAlias(rollbackAlias, functionName)
  if (verified.version !== previous.version) {
    throw new Error(`${functionName} 自动回退后仍未指向版本 ${previous.version}。`)
  }
}

export async function releaseImmutableDefaultVersion({
  client,
  functionName,
  namespace,
  deploymentId,
  sourceFingerprint,
  runtimeBaseUrl
}) {
  const beforeAlias = await client.callScf('GetAlias', {
    FunctionName: functionName,
    Namespace: namespace,
    Name: DEFAULT_ALIAS
  })
  const previous = assertSafeDefaultAlias(beforeAlias, functionName)
  const latestAddress = await waitForCodeAddress(
    client,
    functionName,
    namespace,
    LATEST_VERSION
  )
  const latestCodeSha256 = normalizeCodeHash(latestAddress, `${functionName} ${LATEST_VERSION}`)
  const description = releaseDescription(deploymentId, sourceFingerprint)
  const published = await client.callScf('PublishVersion', {
    FunctionName: functionName,
    Namespace: namespace,
    Description: description
  })
  const publishedVersion = String(published?.FunctionVersion || '').trim()
  if (!/^\d+$/u.test(publishedVersion)) {
    throw new Error(`${functionName} PublishVersion 未返回不可变数字版本。`)
  }

  await waitForVersionActive(client, functionName, namespace, publishedVersion)
  const publishedAddress = await client.callScf('GetFunctionAddress', {
    FunctionName: functionName,
    Namespace: namespace,
    Qualifier: publishedVersion
  })
  const publishedCodeSha256 = normalizeCodeHash(
    publishedAddress,
    `${functionName} ${publishedVersion}`
  )
  if (publishedCodeSha256 !== latestCodeSha256) {
    throw new Error(`${functionName} 新版本代码摘要与 ${LATEST_VERSION} 不一致，别名未切换。`)
  }

  let aliasSwitched = false
  try {
    await client.callScf('UpdateAlias', {
      FunctionName: functionName,
      Namespace: namespace,
      Name: DEFAULT_ALIAS,
      FunctionVersion: publishedVersion,
      Description: String(beforeAlias?.Description || '')
    })
    aliasSwitched = true

    const afterAlias = await client.callScf('GetAlias', {
      FunctionName: functionName,
      Namespace: namespace,
      Name: DEFAULT_ALIAS
    })
    const activated = assertSafeDefaultAlias(afterAlias, functionName)
    if (activated.version !== publishedVersion) {
      throw new Error(
        `${functionName} ${DEFAULT_ALIAS} 回读版本为 ${activated.version}，期望 ${publishedVersion}。`
      )
    }

    const defaultAddress = await client.callScf('GetFunctionAddress', {
      FunctionName: functionName,
      Namespace: namespace,
      Qualifier: DEFAULT_ALIAS
    })
    const defaultCodeSha256 = normalizeCodeHash(defaultAddress, `${functionName} ${DEFAULT_ALIAS}`)
    if (defaultCodeSha256 !== publishedCodeSha256) {
      throw new Error(`${functionName} ${DEFAULT_ALIAS} 代码摘要与新版本不一致。`)
    }

    const runtimeEvidence = await client.verifyGatewayQualifier({
      functionName,
      version: publishedVersion,
      runtimeBaseUrl
    })
    return {
      policy: 'immutable_default_alias_v1',
      previousVersion: previous.version,
      publishedVersion,
      latestCodeSha256,
      publishedCodeSha256,
      defaultCodeSha256,
      aliasVerified: true,
      runtimeVerified: true,
      runtimeEvidence
    }
  } catch (error) {
    if (aliasSwitched) {
      try {
        await rollbackDefaultAlias(client, functionName, namespace, beforeAlias)
      } catch (rollbackError) {
        throw new AggregateError(
          [error, rollbackError],
          `${functionName} 发布校验失败，且自动回退失败，请立即人工检查 ${DEFAULT_ALIAS}。`
        )
      }
    }
    throw error
  }
}

function findRuntimeLogEvidence(parsed = {}, expectedVersion = '') {
  const results = parsed?.results || parsed?.data?.results || parsed?.Results || []
  for (const item of Array.isArray(results) ? results : []) {
    const content = item?.content || item?.Content || item
    const record = typeof content === 'string' ? parseJsonFromOutput(content) || {} : content || {}
    if (
      String(record.qualifier || '') === expectedVersion &&
      String(record.alias || '') === DEFAULT_ALIAS &&
      String(record.request_source || '') === 'TCB_GW' &&
      String(record.status_code || '') === '200'
    ) {
      return {
        qualifier: String(record.qualifier),
        alias: String(record.alias),
        requestSource: String(record.request_source),
        statusCode: Number(record.status_code),
        requestId: String(record.request_id || '')
      }
    }
  }
  return null
}

export function createTcbFunctionClient({ cwd, env, envId, region, deployPackage, apiPackage }) {
  const run = (args, { packageName = deployPackage, inheritOutput = false } = {}) =>
    runTcb({ args, env, cwd, packageName, inheritOutput })

  async function callScf(action, params) {
    const result = await run(
      [
        '-e',
        envId,
        '-r',
        region,
        'api',
        'scf',
        action,
        '--api-version',
        SCF_API_VERSION,
        '--body',
        JSON.stringify(params),
        '--json'
      ],
      { packageName: apiPackage }
    )
    const parsed = parseJsonFromOutput(result.stdout)
    if (!parsed) {
      throw new Error(`CloudBase API ${action} 未返回可解析 JSON。`)
    }
    return unwrapCloudApiResponse(parsed)
  }

  return {
    wait: delay,
    callScf,
    async deployTarget(target) {
      console.log(`Deploying CloudBase function ${target.name}`)
      await run(
        ['fn', 'code', 'update', target.name, '--dir', target.stagedDir, '-e', envId, '--json'],
        { packageName: deployPackage, inheritOutput: true }
      )
      const result = await run(['fn', 'detail', target.name, '-e', envId, '--json'], {
        packageName: deployPackage
      })
      const parsed = parseJsonFromOutput(result.stdout)
      if (!parsed) {
        throw new Error(`CloudBase fn detail for ${target.name} did not return parseable JSON.`)
      }
      const summary = summarizeFunctionDetail(target.name, parsed)
      console.log('CloudBase function detail summary: ' + JSON.stringify(summary))
      return summary
    },
    async login(credentials) {
      const loginArgs = [
        'login',
        '--apiKeyId',
        credentials.secretId,
        '--apiKey',
        credentials.secretKey
      ]
      await run(loginArgs, { packageName: deployPackage, inheritOutput: true })
      if (apiPackage !== deployPackage) {
        await run(loginArgs, { packageName: apiPackage, inheritOutput: true })
      }
    },
    async verifyGatewayQualifier({ functionName, version, runtimeBaseUrl }) {
      const baseUrl = String(runtimeBaseUrl || '')
        .trim()
        .replace(/\/+$/u, '')
      if (!baseUrl) {
        throw new Error(`${functionName} 缺少线上 HTTP 基地址，无法验证真实网关版本。`)
      }
      const response = await fetch(`${baseUrl}/${functionName}/health`, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(20_000)
      })
      if (!response.ok) {
        throw new Error(`${functionName} 网关健康检查返回 HTTP ${response.status}。`)
      }
      await response.arrayBuffer()

      const query = `function_name:"${functionName}" AND qualifier:"${version}" AND src:system`
      for (let attempt = 1; attempt <= 15; attempt += 1) {
        const result = await run(
          [
            'logs',
            'search',
            '--env-id',
            envId,
            '--query',
            query,
            '--timeRange',
            '5m',
            '--limit',
            '50',
            '--sort',
            'desc',
            '--json'
          ],
          { packageName: apiPackage }
        )
        const parsed = parseJsonFromOutput(result.stdout)
        const evidence = findRuntimeLogEvidence(parsed, version)
        if (evidence) {
          return evidence
        }
        await delay(1500)
      }
      throw new Error(`${functionName} 未在时限内取得 qualifier=${version} 的真实网关日志。`)
    }
  }
}
