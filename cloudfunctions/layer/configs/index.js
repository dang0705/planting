const diagnose = {
  llm: {
    host: 'hunyuan.tencentcloudapi.com',
    model: 'hunyuan-vision',
    service: 'hunyuan'
  },
  prompts: {
    llm: `请结合图片和症状描述输出诊断结论，必须使用中文，并按以下格式输出：
  主要问题：一句话
  处理建议：最多3条、每条不超过10字、总字数不超过100字。`
  }
}

const payment = {
  routes: {
    createOrder: '/create-order',
    callback: '/pay-callback',
    health: '/health'
  },
  defaults: {
    appid: 'wx85bb3976301f75fb',
    currency: 'CNY',
    description: '植物服务订单',
    total: 1
  }
}

module.exports = {
  diagnose,
  payment,
  llm: diagnose.llm,
  prompts: diagnose.prompts
}
