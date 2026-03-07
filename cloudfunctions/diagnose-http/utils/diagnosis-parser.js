'use strict'

function parseLLMDiagnosis(text) {
  const cleanText = String(text || '')

  let healthScore = 65
  let healthStatus = 'warning'

  if (/严重|病害|枯死|根腐|立即|紧急|需要立即处理/.test(cleanText)) {
    healthScore = 35
    healthStatus = 'sick'
  } else if (/健康|正常|良好|没问题|状态不错/.test(cleanText)) {
    healthScore = 85
    healthStatus = 'healthy'
  } else if (/注意|观察|轻微|需要注意/.test(cleanText)) {
    healthScore = 65
    healthStatus = 'warning'
  }

  let mainIssue = '需要进一步观察'
  if (/浇水过多|积水/.test(cleanText)) mainIssue = '浇水过多'
  else if (/缺水|干燥/.test(cleanText)) mainIssue = '缺水'
  else if (/光照不足/.test(cleanText)) mainIssue = '光照不足'
  else if (/光照过强|晒伤/.test(cleanText)) mainIssue = '光照过强'
  else if (/缺肥|营养/.test(cleanText)) mainIssue = '营养不足'
  else if (/病虫害|虫/.test(cleanText)) mainIssue = '病虫害'
  else if (/空调|干燥/.test(cleanText)) mainIssue = '环境过于干燥'

  return {
    healthScore,
    healthStatus,
    mainIssue,
    symptoms: cleanText.substring(0, 200),
    treatment: cleanText.substring(0, 200),
    prevention: '建议持续观察并根据诊断结论调整浇水、光照和施肥。',
    summary: cleanText.substring(0, 150)
  }
}

function removeDuplicateContent(text) {
  const paragraphs = text.split('\n').filter(p => p.trim().length > 20)
  if (paragraphs.length > 0) {
    let longestPara = paragraphs[0]
    for (const p of paragraphs) {
      if (p.length > longestPara.length) {
        longestPara = p
      }
    }
    return longestPara
  }

  const sentences = text.split(/[。！？]+/).filter(s => s.trim())
  const seen = new Set()
  const unique = []
  for (const s of sentences) {
    const trimmed = s.trim()
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed)
      unique.push(trimmed)
    }
  }
  return unique.join('。')
}

function parseAgentDiagnosis(text) {
  const cleanText = removeDuplicateContent(String(text || ''))
  let healthScore = 60
  let healthStatus = 'warning'

  if (/严重|病害|枯死|根腐|立即|紧急/.test(cleanText)) {
    healthScore = 35
    healthStatus = 'sick'
  } else if (/健康|正常|良好|没问题/.test(cleanText)) {
    healthScore = 85
    healthStatus = 'healthy'
  } else if (/注意|观察|轻微|缺水|缺肥|黄叶/.test(cleanText)) {
    healthScore = 65
    healthStatus = 'warning'
  }

  let mainIssue = '需要进一步观察'
  const issuePatterns = [
    /可能是(.{5,30}?)(?:导致|造成|引起)/,
    /问题(?:是|在于)(.{5,30})/,
    /主要(?:是|原因)(.{5,30})/,
    /(.{5,20}?)(?:不足|过多|缺乏)/
  ]
  for (const pattern of issuePatterns) {
    const match = cleanText.match(pattern)
    if (match) {
      mainIssue = match[1].trim()
      break
    }
  }

  if (mainIssue === '需要进一步观察') {
    if (/浇水过多|积水/.test(cleanText)) mainIssue = '浇水过多导致根部问题'
    else if (/缺水|干燥/.test(cleanText)) mainIssue = '缺水导致叶片枯萎'
    else if (/光照不足|阴暗/.test(cleanText)) mainIssue = '光照不足影响生长'
    else if (/光照过强|晒伤/.test(cleanText)) mainIssue = '光照过强导致叶片灼伤'
    else if (/缺肥|营养/.test(cleanText)) mainIssue = '营养不足需要施肥'
    else if (/病虫害|虫/.test(cleanText)) mainIssue = '可能存在病虫害'
    else if (/黄叶|发黄/.test(cleanText)) mainIssue = '叶片发黄需要调整养护'
  }

  let treatment = '请根据具体情况调整养护方式'
  const treatmentMatch = cleanText.match(/(?:建议|需要|应该|可以)(.{10,100}?)(?:。|$)/)
  if (treatmentMatch) {
    treatment = treatmentMatch[1].trim()
  }

  let prevention = '定期检查植物健康状况，保持适当的浇水和光照'
  const preventionMatch = cleanText.match(/(?:预防|避免|注意)(.{10,80}?)(?:。|$)/)
  if (preventionMatch) {
    prevention = preventionMatch[1].trim()
  }

  return {
    healthScore,
    healthStatus,
    mainIssue,
    symptoms: cleanText.substring(0, 200),
    treatment,
    prevention,
    summary: cleanText.substring(0, 150)
  }
}

module.exports = {
  parseLLMDiagnosis,
  parseAgentDiagnosis
}

