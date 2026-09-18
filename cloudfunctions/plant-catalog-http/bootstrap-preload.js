'use strict'

// CloudBase Node 18.15 在 functions-framework 加载业务模块前没有 Web File
// 全局变量；undici 会在此阶段读取它，因此必须通过 --require 预先补齐。
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}
