'use strict'

// 从 layer 重新导出天气对象存储抽象，保持 weather-http 内部 API 不变。
// 运行时 layer 挂载在 /opt/utils/；本地/测试环境回退到相对路径。
// weather-ingestion-scheduler 维持自身 services/weather-object-storage.js 副本，不受本文件影响。
let weatherObjectStorageModule
try {
  weatherObjectStorageModule = require('/opt/utils/weather-object-storage')
} catch {
  weatherObjectStorageModule = require('../../layer/utils/weather-object-storage')
}

module.exports = weatherObjectStorageModule
