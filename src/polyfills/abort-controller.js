/* global global, self, window */

class MiniAbortSignal {
  constructor() {
    this.aborted = false
    this.reason = undefined
    this.onabort = null
    this._listeners = new Set()
  }

  addEventListener(type, listener) {
    if (type !== 'abort' || typeof listener !== 'function') {
      return
    }
    this._listeners.add(listener)
  }

  removeEventListener(type, listener) {
    if (type !== 'abort' || typeof listener !== 'function') {
      return
    }
    this._listeners.delete(listener)
  }

  dispatchEvent(event) {
    if (!event || event.type !== 'abort') {
      return true
    }
    for (const listener of this._listeners) {
      listener.call(this, event)
    }
    if (typeof this.onabort === 'function') {
      this.onabort.call(this, event)
    }
    return true
  }
}

class MiniAbortController {
  constructor() {
    this.signal = new MiniAbortSignal()
  }

  abort(reason) {
    if (this.signal.aborted) {
      return
    }
    this.signal.aborted = true
    this.signal.reason = reason
    this.signal.dispatchEvent({ type: 'abort' })
  }
}

function resolveGlobalObjects() {
  const globalObjects = []
  if (typeof globalThis !== 'undefined') {
    globalObjects.push(globalThis)
  }
  if (typeof global !== 'undefined') {
    globalObjects.push(global)
  }
  if (typeof self !== 'undefined') {
    globalObjects.push(self)
  }
  if (typeof window !== 'undefined') {
    globalObjects.push(window)
  }
  return [...new Set(globalObjects)]
}

const globalObjects = resolveGlobalObjects()

for (const globalObject of globalObjects) {
  if (typeof globalObject.AbortController === 'undefined') {
    globalObject.AbortController = MiniAbortController
  }
  if (typeof globalObject.AbortSignal === 'undefined') {
    globalObject.AbortSignal = MiniAbortSignal
  }
}
