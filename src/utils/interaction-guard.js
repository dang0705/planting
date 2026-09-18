/**
 * 保护需要等待异步结果的离散用户动作。
 *
 * 第一次调用立即执行；同一动作尚未结束时，后续调用复用第一次 Promise，
 * 不会重复触发登录、写入或导航。无论成功还是失败，动作结束后都会自动解锁。
 */
export function createAsyncActionGuard() {
  let pendingPromise = null

  return {
    get isPending() {
      return Boolean(pendingPromise)
    },

    run(action) {
      if (pendingPromise) {
        return pendingPromise
      }
      if (typeof action !== 'function') {
        return Promise.reject(new TypeError('异步动作必须是函数'))
      }

      let currentPromise
      try {
        currentPromise = Promise.resolve().then(action)
      } catch (error) {
        currentPromise = Promise.reject(error)
      }
      pendingPromise = currentPromise
      const clear = () => {
        if (pendingPromise === currentPromise) {
          pendingPromise = null
        }
      }
      currentPromise.then(clear, clear)
      return currentPromise
    }
  }
}

/**
 * leading 节流：只允许时间窗口内的第一次离散动作。
 * 不应用于 touchmove、swiper 或滚动等连续输入。
 */
export function createLeadingThrottle(handler, wait = 400) {
  if (typeof handler !== 'function') {
    throw new TypeError('节流动作必须是函数')
  }
  const interval = Math.max(0, Number(wait) || 0)
  let lastInvokedAt = -Infinity

  function throttled(...args) {
    const now = Date.now()
    if (now - lastInvokedAt < interval) {
      return undefined
    }
    lastInvokedAt = now
    return handler.apply(this, args)
  }

  throttled.cancel = () => {
    lastInvokedAt = -Infinity
  }
  return throttled
}

/**
 * trailing 防抖：在连续输入停止后执行一次。
 * 返回函数带 cancel 方法，组件卸载或用户确认提交时可清理待执行任务。
 */
export function createDebounced(handler, wait = 300) {
  if (typeof handler !== 'function') {
    throw new TypeError('防抖动作必须是函数')
  }
  const delay = Math.max(0, Number(wait) || 0)
  let timer = null
  let latestThis = null
  let latestArgs = []

  function debounced(...args) {
    latestThis = this
    latestArgs = args
    if (timer) {
      clearTimeout(timer)
    }
    timer = setTimeout(() => {
      timer = null
      const context = latestThis
      const callArgs = latestArgs
      latestThis = null
      latestArgs = []
      handler.apply(context, callArgs)
    }, delay)
  }

  debounced.cancel = () => {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    latestThis = null
    latestArgs = []
  }

  return debounced
}
