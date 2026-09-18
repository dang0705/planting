'use strict'

// Nodejs18.15 没有全局 File；undici 可能在 functions-framework 加载业务代码前读取它。
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
