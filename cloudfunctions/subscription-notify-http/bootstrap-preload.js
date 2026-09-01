'use strict'

// Node 18.15 does not expose the Web File global, while undici may load before
// the function entry module and expects the constructor during initialization.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}
