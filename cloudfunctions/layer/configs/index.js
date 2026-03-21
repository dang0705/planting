const diagnose = {
  llm: {
    host: 'hunyuan.tencentcloudapi.com',
    model: 'hunyuan-t1-vision-20250916',
    service: 'hunyuan',
    options: {
      TopP: 0.1,
      Temperature: 0.1,
      Seed: 42
    }
  },
  prompts: {
    llm: ''
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
