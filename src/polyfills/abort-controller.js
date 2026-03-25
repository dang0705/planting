class MiniAbortSignal {
  constructor() {
    this.aborted = false
    this.reason = undefined
    this.onabort = null
    this._listeners = new Set()
  }

  addEventListener(type, listener) {
    if (type !== 'abort' || typeof listener !== 'function') return
    this._listeners.add(listener)
  }

  removeEventListener(type, listener) {
    if (type !== 'abort' || typeof listener !== 'function') return
    this._listeners.delete(listener)
  }

  dispatchEvent(event) {
    if (!event || event.type !== 'abort') return true
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
    if (this.signal.aborted) return
    this.signal.aborted = true
    this.signal.reason = reason
    this.signal.dispatchEvent({ type: 'abort' })
  }
}

if (typeof globalThis !== 'undefined' && typeof globalThis.AbortController === 'undefined') {
  globalThis.AbortController = MiniAbortController
}

if (typeof globalThis !== 'undefined' && typeof globalThis.AbortSignal === 'undefined') {
  globalThis.AbortSignal = MiniAbortSignal
}
