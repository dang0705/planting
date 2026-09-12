import { httpRequest } from '@/http-functions/core/httpRequest'
import { IS_LOCAL_API_BASE_URL, PUBLIC_HTTP_FUNCTION_BASE_URL } from '@/api/env'

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
    preferPlatformSession = false,
    requirePlatformSession = false,
    requireSignedIdentityTicket = false,
    dataType,
    responseType,
    enableChunked,
    timeout,
    baseUrl,
    returnErrorResponse = false,
    onChunkReceived
  } = {}
) {
  const publicBaseUrl =
    baseUrl ?? (!IS_LOCAL_API_BASE_URL ? PUBLIC_HTTP_FUNCTION_BASE_URL : undefined)
  const response = await defaultHttpFunctionRequester({
    functionPath,
    method,
    query,
    payload: payload ?? body,
    headers,
    auth,
    preferPlatformSession,
    requirePlatformSession,
    requireSignedIdentityTicket,
    dataType,
    responseType,
    enableChunked,
    timeout,
    baseUrl: publicBaseUrl,
    returnErrorResponse,
    onChunkReceived
  })

  if (response.statusCode >= 200 && response.statusCode < 300) {
    return response.data
  }

  if (returnErrorResponse) {
    return response.data
  }

  throw new Error(response.data?.message || `HTTP ${response.statusCode}`)
}
