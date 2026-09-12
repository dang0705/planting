import { httpRequest } from '@/http-functions/core/httpRequest'

function unwrapResponseEnvelope(raw, fallbackMessage = '请求失败') {
  if (!raw || typeof raw !== 'object') {
    throw new Error('接口响应为空')
  }

  const code = Number(raw.code ?? 200)
  if (code !== 200) {
    throw new Error(raw.message || fallbackMessage)
  }

  return raw.data ?? null
}

const listOutOfPoolRequester = httpRequest({
  functionPath: 'diagnose-http/visual/out-of-pool/list',
  method: 'GET'
})

const imageOutOfPoolRequester = httpRequest({
  functionPath: 'diagnose-http/visual/out-of-pool/image',
  method: 'GET'
})

const reviewOutOfPoolRequester = httpRequest({
  functionPath: 'diagnose-http/visual/out-of-pool/review',
  method: 'POST'
})

const listOutOfPoolProxyMappingsRequester = httpRequest({
  functionPath: 'diagnose-http/visual/out-of-pool/proxy-mappings/list',
  method: 'GET'
})

const upsertOutOfPoolProxyMappingRequester = httpRequest({
  functionPath: 'diagnose-http/visual/out-of-pool/proxy-mappings/upsert',
  method: 'POST'
})

const disableOutOfPoolProxyMappingRequester = httpRequest({
  functionPath: 'diagnose-http/visual/out-of-pool/proxy-mappings/disable',
  method: 'POST'
})

export async function requestOutOfPoolReviewList(query = {}) {
  const response = await listOutOfPoolRequester({ query })
  return unwrapResponseEnvelope(response?.data, '读取池外视觉候选失败')
}

export async function requestOutOfPoolReviewImage(query = {}) {
  const response = await imageOutOfPoolRequester({ query })
  return unwrapResponseEnvelope(response?.data, '读取池外视觉候选图片失败')
}

export async function requestOutOfPoolReviewAction(payload = {}) {
  const response = await reviewOutOfPoolRequester({ payload })
  return unwrapResponseEnvelope(response?.data, '提交池外视觉候选审核失败')
}

export async function requestOutOfPoolProxyMappingList(query = {}) {
  const response = await listOutOfPoolProxyMappingsRequester({ query })
  return unwrapResponseEnvelope(response?.data, '读取池外 proxy 映射失败')
}

export async function requestOutOfPoolProxyMappingUpsert(payload = {}) {
  const response = await upsertOutOfPoolProxyMappingRequester({ payload })
  return unwrapResponseEnvelope(response?.data, '保存池外 proxy 映射失败')
}

export async function requestOutOfPoolProxyMappingDisable(payload = {}) {
  const response = await disableOutOfPoolProxyMappingRequester({ payload })
  return unwrapResponseEnvelope(response?.data, '停用池外 proxy 映射失败')
}
