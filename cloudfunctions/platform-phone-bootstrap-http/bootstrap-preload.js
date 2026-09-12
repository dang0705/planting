'use strict'

// Node 18.15 lacks the Web File global, while undici may be loaded by the
// CloudBase SDK before the function entry module is evaluated.
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}
