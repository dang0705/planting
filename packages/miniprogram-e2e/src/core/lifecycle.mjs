/**
 * Minimal LIFO cleanup primitive shared by host and platform integrations.
 * It deliberately knows nothing about DevTools, projects, or fixtures.
 */
export function createCleanupStack() {
  const actions = []
  return Object.freeze({
    defer(name, cleanup) {
      if (typeof cleanup !== 'function') {throw new TypeError('cleanup must be a function')}
      actions.push({ name: String(name || 'cleanup'), cleanup })
    },
    async run() {
      const completed = []
      const failures = []
      for (const action of [...actions].reverse()) {
        try {
          completed.push({ name: action.name, value: await action.cleanup() })
        } catch (error) {
          failures.push({ name: action.name, code: String(error?.code || 'mp_e2e_cleanup_failed'), message: String(error?.message || error) })
        }
      }
      return { status: failures.length ? 'failed' : 'passed', completed, failures }
    }
  })
}

/** @template T @param {Promise<T>} operation @param {{timeoutMs:number,name:string}} options */
export async function withTimeout(operation, { timeoutMs, name }) {
  let timer
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(`${name} timed out after ${timeoutMs}ms`)
          error.code = 'mp_e2e_timeout'
          reject(error)
        }, timeoutMs)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
