'use strict'

if (typeof globalThis.File === 'undefined') {
  const BlobConstructor = typeof globalThis.Blob === 'function' ? globalThis.Blob : null
  globalThis.File = BlobConstructor
    ? class File extends BlobConstructor {
        constructor(fileBits, fileName, options = {}) {
          super(fileBits, options)
          this.name = String(fileName || '')
          this.lastModified = Number(options.lastModified || Date.now())
        }
      }
    : class File {
        constructor(_fileBits, fileName, options = {}) {
          this.name = String(fileName || '')
          this.lastModified = Number(options.lastModified || Date.now())
        }
      }
}
