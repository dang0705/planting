/**
 * Runtime requests execute in the Mini Program, not Node. Leaves must supply
 * their own allowed request URL; this adapter deliberately has no endpoint.
 */
export function createRuntimeHttpClient(miniProgram) {
  return {
    async request({ url, method = 'GET', data = null, header = {} }) {
      if (!url) {throw new Error('runtime request url is required')}
      const slot = `__mpE2eRequest_${Date.now()}_${Math.random().toString(16).slice(2)}`
      await miniProgram.evaluate(
        function (requestSlot, requestOptions) {
          globalThis[requestSlot] = { state: 'pending' }
          wx.request({
            ...requestOptions,
            success(response) {
              globalThis[requestSlot] = { state: 'done', ok: true, response: { statusCode: response.statusCode, data: response.data } }
            },
            fail(error) {
              globalThis[requestSlot] = { state: 'done', ok: false, error: error?.errMsg || String(error) }
            }
          })
        },
        slot,
        { url, method, data, header }
      )
      const deadline = Date.now() + 15_000
      while (Date.now() < deadline) {
        const observation = await miniProgram.evaluate(function (requestSlot) {
          return globalThis[requestSlot] || null
        }, slot)
        if (observation?.state === 'done') {
          if (!observation.ok) {throw new Error(observation.error || 'runtime wx.request failed')}
          return observation.response
        }
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      throw new Error('runtime wx.request timed out')
    }
  }
}
