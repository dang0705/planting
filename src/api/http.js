import { httpRequest } from '@/http-functions/core/httpRequest'

const defaultHttpFunctionRequester = httpRequest()

export async function requestHttpFunction(
  functionPath,
  {
    method = 'GET',
    query,
    body,
    payload,
    headers,
    auth = true,
    responseType,
    enableChunked,
    timeout,
    onChunkReceived
  } = {}
) {
  const response = await defaultHttpFunctionRequester({
    functionPath,
    method,
    query,
    payload: payload ?? body,
    headers,
    auth,
    responseType,
    enableChunked,
    timeout,
    onChunkReceived
  })

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.data
  }

  throw new Error(response.data?.message || `HTTP ${response.statusCode}`)
}
