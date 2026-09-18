'use strict'

// Node.js 18.15 does not expose the Web File global. Load this before the
// CloudBase framework so transitive undici imports can initialize safely.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}
