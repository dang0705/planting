/**
 * Read the current mini-program page without making App.getCurrentPage the
 * only liveness signal. Some DevTools releases can leave that RPC pending
 * while App.getPageStack is already available after an appservice reload.
 */
export async function getCurrentPageWithFallback(
  miniProgram,
  { timeoutMs = 6000, perRpcTimeoutMs = 3000 } = {}
) {
  const deadline = Date.now() + Math.max(1, Number(timeoutMs) || 1)
  let currentPageError = null

  if (typeof miniProgram?.currentPage === 'function') {
    try {
      const page = await boundedCall(
        () => miniProgram.currentPage(),
        Math.min(perRpcTimeoutMs, Math.max(1, deadline - Date.now()))
      )
      if (page) {
        return { page, source: 'current_page' }
      }
    } catch (error) {
      currentPageError = error
    }
  }

  if (typeof miniProgram?.pageStack === 'function' && Date.now() < deadline) {
    try {
      const stack = await boundedCall(
        () => miniProgram.pageStack(),
        Math.max(1, deadline - Date.now())
      )
      const page = Array.isArray(stack) ? stack[stack.length - 1] : null
      if (page) {
        return {
          page,
          source: 'page_stack_fallback',
          current_page_error: currentPageError?.message || null
        }
      }
    } catch (error) {
      if (!currentPageError) {
        currentPageError = error
      }
    }
  }

  const error = currentPageError || new Error('mini-program current page is unavailable')
  error.code ||= 'automator_current_page_unavailable'
  throw error
}

function boundedCall(operation, timeoutMs) {
  return new Promise((resolve, reject) => {
    let settled = false
    const timer = setTimeout(() => {
      if (settled) {
        return
      }
      settled = true
      const error = new Error(`page probe timed out after ${timeoutMs}ms`)
      error.code = 'automator_page_probe_timeout'
      reject(error)
    }, timeoutMs)

    Promise.resolve()
      .then(operation)
      .then(
        value => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          resolve(value)
        },
        error => {
          if (settled) {
            return
          }
          settled = true
          clearTimeout(timer)
          reject(error)
        }
      )
  })
}
