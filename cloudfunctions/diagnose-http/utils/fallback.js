'use strict'

async function callAIModelFallback() {
  throw new Error('已禁用文本回退诊断，诊断首轮必须使用图像症状标注链路')
}

module.exports = {
  callAIModelFallback
}
