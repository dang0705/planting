#!/usr/bin/env node

const DEFAULT_ENV_ID = process.env.CLOUDBASE_ENV_ID || 'cloud1-2grufevs395a9d5e'
const DEFAULT_OPENID = process.env.OUT_OF_POOL_BACKFILL_OPENID || 'dev_terminal_out_of_pool_backfill'
const PAGE_SIZE = Number(process.env.OUT_OF_POOL_BACKFILL_PAGE_SIZE || 50)
const MAX_PAGES = Number(process.env.OUT_OF_POOL_BACKFILL_MAX_PAGES || 20)

function normalizeEnvId(value = '') {
  const normalized = String(value || '').trim()
  return normalized || DEFAULT_ENV_ID
}

function buildGatewayBase(envId) {
  return `https://${envId}.api.tcloudbasegateway.com`
}

async function signInAnonymously(envId) {
  const response = await fetch(`${buildGatewayBase(envId)}/auth/v1/signin/anonymously`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-device-id': `codex-out-of-pool-backfill-${Date.now()}`
    },
    body: '{}'
  })
  const payload = await response.json().catch(() => null)
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      `anonymous_signin_failed:${response.status}:${JSON.stringify(payload || {})}`
    )
  }
  return String(payload.access_token || '')
}

async function callFunctionJson({ envId, token, path, query = {} }) {
  const search = new URLSearchParams()
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {return}
    search.set(key, String(value))
  })
  search.set('webfn', 'true')

  const response = await fetch(
    `${buildGatewayBase(envId)}/v1/functions/diagnose-http${path}?${search.toString()}`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  )
  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    throw new Error(`function_call_failed:${response.status}:${JSON.stringify(payload || {})}`)
  }
  if (Number(payload?.code ?? 200) !== 200) {
    throw new Error(`function_payload_failed:${JSON.stringify(payload || {})}`)
  }
  return payload?.data ?? null
}

async function fetchAllCandidates({ envId, token }) {
  const items = []
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const data = await callFunctionJson({
      envId,
      token,
      path: '/visual/out-of-pool/list',
      query: {
        page,
        pageSize: PAGE_SIZE,
        status: 'all',
        skipAuth: true,
        openid: DEFAULT_OPENID
      }
    })
    const pageItems = Array.isArray(data?.items) ? data.items : []
    items.push(...pageItems)
    if (!data?.hasMore || !pageItems.length) {
      break
    }
  }
  return items
}

async function backfillOne({ envId, token, item }) {
  const data = await callFunctionJson({
    envId,
    token,
    path: '/visual/out-of-pool/image',
    query: {
      visualNormalizedImageResultId: item.visualNormalizedImageResultId,
      candidateIndex: item.candidateIndex,
      skipAuth: true,
      openid: DEFAULT_OPENID
    }
  })
  return {
    visualNormalizedImageResultId: item.visualNormalizedImageResultId,
    candidateIndex: item.candidateIndex,
    imageSource: data?.imageSource || '',
    previewLength: String(data?.previewImageRef || '').length
  }
}

async function main() {
  const envId = normalizeEnvId(process.argv[2] || DEFAULT_ENV_ID)
  const token = await signInAnonymously(envId)
  const allItems = await fetchAllCandidates({ envId, token })
  const directItems = allItems.filter(item => String(item?.imageState || '') === 'direct')

  const results = []
  for (const item of directItems) {
    results.push(await backfillOne({ envId, token, item }))
  }

  const summary = {
    envId,
    totalItems: allItems.length,
    directItems: directItems.length,
    backfilled: results.filter(item => item.imageSource === 'rehydrated_from_image_ref').length,
    directFallbackOnly: results.filter(item => item.imageSource === 'image_ref').length,
    results
  }

  console.log(JSON.stringify(summary, null, 2))
}

main().catch(error => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        message: String(error?.message || error || '')
      },
      null,
      2
    )
  )
  process.exit(1)
})
