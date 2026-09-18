export function resolveWithinDeadline({
  action,
  timeoutMs,
  setTimer = setTimeout,
  clearTimer = clearTimeout
}) {
  return new Promise(resolve => {
    let settled = false
    let timer = null
    const finish = result => {
      if (settled) {
        return
      }
      settled = true
      if (timer !== null) {
        clearTimer(timer)
      }
      resolve(result)
    }
    timer = setTimer(() => finish({ timedOut: true, timeoutMs }), timeoutMs)
    Promise.resolve()
      .then(action)
      .then(
        value => finish({ timedOut: false, value }),
        error => finish({ timedOut: false, error: String(error?.message || error) })
      )
  })
}
