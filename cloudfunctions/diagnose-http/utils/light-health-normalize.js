'use strict'

// 光照健康估算输入归一化
// 已下沉到 layer/utils/light-exposure-normalize.js（项目唯一事实源）。
// 本文件为 re-export 代理，保持 diagnose-http 现有 require 路径不变。

let normalizeModule
try {
  normalizeModule = require('/opt/utils/light-exposure-normalize')
} catch {
  normalizeModule = require('../../layer/utils/light-exposure-normalize')
}

module.exports = normalizeModule
