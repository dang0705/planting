'use strict'

// 从 layer 重新导出 day file 读取与 latestSample 转 dailyRecord 工具，保持 weather-http 内部 API 不变。
// 运行时 layer 挂载在 /opt/utils/；本地/测试环境回退到相对路径。
// layer 自包含路径构造器与日期工具，createCurrentWeatherArchiveService 仅需 storage/now/resolveLocationInput。
let weatherDayFileReaderModule
try {
  weatherDayFileReaderModule = require('/opt/utils/weather-day-file-reader')
} catch {
  weatherDayFileReaderModule = require('../../layer/utils/weather-day-file-reader')
}

const {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  createCurrentWeatherArchiveService,
  createWeatherDayFileReader,
  downloadJsonWithTimeout,
  isUsableFinalizedDayFile,
  isUsableLatestSample,
  latestSampleToDailyRecord
} = weatherDayFileReaderModule

module.exports = {
  buildCurrentWeatherDataFromDailyRollup,
  buildCurrentWeatherDataFromLatestSample,
  createCurrentWeatherArchiveService,
  createWeatherDayFileReader,
  downloadJsonWithTimeout,
  isUsableFinalizedDayFile,
  isUsableLatestSample,
  latestSampleToDailyRecord
}
