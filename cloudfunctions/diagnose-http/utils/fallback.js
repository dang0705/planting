'use strict'

const { ai } = require('/opt/utils/cloudbase')

async function callAIModelFallback(image, description) {
  const aiInstance = ai()
  const model = aiInstance.createModel('deepseek')

  let userContent = '你是一位专业植物医生，请根据以下信息诊断植物健康状况。\n\n'

  if (description) {
    userContent += `植物症状描述：${description}\n\n`
  }
  if (image) {
    userContent += `植物图片链接：${image}\n\n`
  }

  userContent += `请以JSON格式返回：
{
  "healthScore": 75,
  "healthStatus": "warning",
  "mainIssue": "主要问题",
  "symptoms": "症状描述",
  "treatment": "治疗方案",
  "prevention": "预防措施",
  "summary": "诊断总结(80-120字)"
}
诊断标准：healthy(80-100), warning(50-79), sick(0-49)。
总输出尽量简洁。`

  try {
    const response = await model.generateText({
      model: 'deepseek-v3.2',
      messages: [{ role: 'user', content: userContent }]
    })

    const jsonMatch = response.text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0])
    }
    throw new Error('AI返回格式错误')
  } catch (error) {
    return {
      healthScore: 50,
      healthStatus: 'warning',
      mainIssue: '诊断服务暂时不可用',
      symptoms: '服务暂时无法响应',
      treatment: '请稍后重试',
      prevention: '定期检查植物健康状况',
      summary: '抱歉，诊断服务暂时无法响应，请稍后重试。'
    }
  }
}

module.exports = {
  callAIModelFallback
}

