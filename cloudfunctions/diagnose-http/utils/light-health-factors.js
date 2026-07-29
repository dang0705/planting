'use strict'

// 光照健康估算因子表与常量
// 已下沉到 layer/utils/light-exposure-factors.js（项目唯一事实源）。
// 本文件为 re-export 代理，保持 diagnose-http 现有 require 路径不变。

let factorsModule
try {
  factorsModule = require('/opt/utils/light-exposure-factors')
} catch {
  factorsModule = require('../../layer/utils/light-exposure-factors')
}

module.exports = factorsModule
