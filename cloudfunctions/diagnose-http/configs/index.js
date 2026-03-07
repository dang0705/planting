module.exports = {
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
