import { createServer } from 'node:net'
import { access } from 'node:fs/promises'

const DEFAULT_CANDIDATES = [
  '/Applications/wechatwebdevtools.app/Contents/MacOS/Electron',
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli'
]

/** @param {{candidates?:string[]}} options */
export async function findWeChatDevTools({ candidates = DEFAULT_CANDIDATES } = {}) {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Continue through caller supplied candidates.
    }
  }
  const error = new Error('Official WeChat DevTools executable was not found')
  error.code = 'mp_e2e_devtools_not_found'
  throw error
}

/** @param {{host?:string}} options */
export async function allocatePortLease({ host = '127.0.0.1' } = {}) {
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, host, resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('could not allocate local port')
  }
  return {
    host,
    port: address.port,
    async release() {
      await new Promise(resolve => server.close(resolve))
    }
  }
}
