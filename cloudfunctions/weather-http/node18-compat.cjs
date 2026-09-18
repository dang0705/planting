'use strict'

// Nodejs18.15 没有全局 File；undici 在 functions-framework 启动时会先读取它。
// 该文件由 scf_bootstrap 通过 --require 预加载，确保框架加载任何业务模块前完成兼容。
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
