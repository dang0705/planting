'use strict'

// CloudBase Node 18.15 在 functions-framework 加载业务模块前没有 Web File
// 全局变量；undici 会在此阶段读取它，因此必须通过 --require 预先补齐。
if (typeof globalThis.File !== 'function') {
  globalThis.File = class File {}
}

// 诊断图片上传会在首个请求中使用 CloudBase Node SDK 的存储能力。
// 必须在 functions-framework 接收 HTTP 请求前预加载，避免 SDK 首次 require
// 的冷启动耗时落在 storage/diagnose-images 的用户请求内；图片仍由业务代码
// 以原生二进制流上传，严禁改回 Base64。
try {
  require('@cloudbase/node-sdk')
} catch (error) {
  // 依赖异常交给业务模块和平台启动日志处理，不在预加载阶段伪造成功。
  console.warn('[storage-http] CloudBase Node SDK 预加载失败:', error?.message || error)
}
