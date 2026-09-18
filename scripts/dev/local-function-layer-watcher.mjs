import fs from 'node:fs'

const DEFAULT_DEBOUNCE_MS = 150

export function createLocalFunctionLayerWatcher({
  root,
  onChange,
  onError = () => {},
  debounceMs = DEFAULT_DEBOUNCE_MS,
  fsModule = fs,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
} = {}) {
  if (!root || typeof onChange !== 'function') {
    return { status: 'disabled', close() {} }
  }

  let timer = null
  let closed = false
  let watcher

  const scheduleChange = filename => {
    if (closed) {
      return
    }
    if (timer) {
      clearTimeoutFn(timer)
    }
    timer = setTimeoutFn(() => {
      timer = null
      Promise.resolve(onChange({ filename: String(filename || '') })).catch(onError)
    }, debounceMs)
  }

  try {
    watcher = fsModule.watch(root, { recursive: true }, (_eventType, filename) => {
      scheduleChange(filename)
    })
    watcher.on?.('error', onError)
  } catch (error) {
    onError(error)
    return { status: 'unavailable', error, close() {} }
  }

  return {
    status: 'watching',
    close() {
      if (closed) {
        return
      }
      closed = true
      if (timer) {
        clearTimeoutFn(timer)
        timer = null
      }
      watcher.close()
    }
  }
}
