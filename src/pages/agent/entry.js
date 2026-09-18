export function buildAgentEntryUrl(baseUrl, ticket) {
  if (!/^[\w-]{43}$/.test(ticket || '') || !/^https?:\/\//.test(baseUrl)) {
    throw new Error('暂时无法连接小青，请稍后重试。')
  }
  return `${baseUrl.replace(/\/$/, '')}/agent-http/agent/index.html#/pages/chat/chat?ticket=${encodeURIComponent(ticket)}`
}

const waitBeforeRetry = () => new Promise(resolve => setTimeout(resolve, 250))

export async function requestAgentEntryTicket(requestTicket, { wait = waitBeforeRetry } = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await requestTicket({ payload: {} })
      const ticket = response?.data?.data?.ticket
      if (response?.statusCode === 200 && response?.data?.code === 0 && /^[\w-]{43}$/.test(ticket)) {
        return ticket
      }
      if (attempt === 0 && Number(response?.statusCode || 0) >= 500) {
        console.warn('[agent-entry] ticket attempt failed', {
          attempt: attempt + 1,
          statusCode: Number(response?.statusCode || 0),
          responseCode: response?.data?.code ?? null,
          hasTicket: Boolean(ticket)
        })
        await wait()
        continue
      }
      console.warn('[agent-entry] ticket rejected', {
        attempt: attempt + 1,
        statusCode: Number(response?.statusCode || 0),
        responseCode: response?.data?.code ?? null,
        hasTicket: Boolean(ticket)
      })
      throw new Error('connection')
    } catch (error) {
      if (attempt === 0 && error?.message !== 'connection') {
        console.warn('[agent-entry] ticket transport failed', {
          attempt: attempt + 1,
          errorName: String(error?.name || 'Error')
        })
        await wait()
        continue
      }
      throw new Error('connection')
    }
  }
  throw new Error('connection')
}
