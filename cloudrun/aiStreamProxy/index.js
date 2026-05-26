'use strict';

const https = require('https');

// 青植AI智能体配置 - appKey 安全存储在云函数中
const AGENT_CONFIG = {
  appKey: 'ZyBCwcYqaAUewBlEkPzYnBqupzWNYTqemUJLNCUjTzjVGEvBRZnWQWedXAyTyczmBFJxytOAdTwbelEglvaKUxmuXwNFJDAYvtYVHGvdxCnmMIazrwwAjdqrjDXEogQh',
  endpoint: 'wss.lke.cloud.tencent.com',
  path: '/v1/qbot/chat/sse'
};

/**
 * AI 流式代理 - 函数型云托管
 * 支持真正的 SSE 流式返回
 */
exports.main = async function(event, _context) {
  const { method, body, headers: _headers } = event;

  // 处理 CORS 预检请求
  if (method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: getCorsHeaders(),
      body: ''
    };
  }

  // 只接受 POST 请求
  if (method !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 405, message: '只支持 POST 请求' })
    };
  }

  // 解析请求体
  let params = {};
  try {
    params = typeof body === 'string' ? JSON.parse(body) : body;
  } catch {
    return {
      statusCode: 400,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 400, message: '请求体解析失败' })
    };
  }

  const { action, image, description, plantName, openid } = params;

  // 验证参数
  if (!action || !['identify', 'diagnose'].includes(action)) {
    return {
      statusCode: 400,
      headers: { ...getCorsHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 400, message: '无效的操作类型' })
    };
  }

  const visitorId = openid || 'anonymous';

  // 构建用户消息
  const userMessage = buildUserMessage(action, image, description, plantName);

  console.log('SSE 流式请求:', { action, hasImage: Boolean(image), visitorId });

  // 返回 SSE 流式响应
  return new Promise((resolve) => {
    const responseHeaders = {
      ...getCorsHeaders(),
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    };

    let fullText = '';
    let canRender = false;
    const chunks = [];

    callAgentSSE(userMessage, visitorId, {
      onTokenStat: () => {
        canRender = true;
        chunks.push(`data: ${JSON.stringify({ type: 'token_stat' })}\n\n`);
      },
      onText: (text) => {
        fullText = text;
        if (canRender) {
          chunks.push(`data: ${JSON.stringify({ type: 'text', text: fullText })}\n\n`);
        }
      },
      onFinish: () => {
        const result = action === 'identify'
          ? parseIdentifyResult(fullText)
          : parseDiagnoseResult(fullText);

        chunks.push(`data: ${JSON.stringify({ type: 'finish', fullText, result })}\n\n`);
        chunks.push('data: [DONE]\n\n');

        resolve({
          statusCode: 200,
          headers: responseHeaders,
          body: chunks.join('')
        });
      },
      onError: (error) => {
        chunks.push(`data: ${JSON.stringify({ type: 'error', message: error.message })}\n\n`);
        chunks.push('data: [DONE]\n\n');

        resolve({
          statusCode: 200,
          headers: responseHeaders,
          body: chunks.join('')
        });
      }
    });
  });
};

/**
 * 获取 CORS 响应头
 */
function getCorsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-WX-SERVICE'
  };
}

/**
 * 构建用户消息
 */
function buildUserMessage(action, image, description, plantName) {
  let userMessage = '';

  if (action === 'identify') {
    userMessage = '请识别这张植物图片';
    if (image) {userMessage += `\n\n![](${image})`;}
    if (description) {userMessage += `\n\n补充描述：${description}`;}
    userMessage += '\n\n请告诉我这是什么植物，包括中文名、学名、分类，以及养护建议。';
  } else if (action === 'diagnose') {
    userMessage = '请诊断这张植物图片的健康状况';
    if (image) {userMessage += `\n\n![](${image})`;}
    if (plantName) {userMessage += `\n\n植物名称：${plantName}`;}
    if (description) {userMessage += `\n\n症状描述：${description}`;}
    userMessage += '\n\n请直接告诉我植物可能存在什么问题，以及如何治疗和预防。';
  }

  return userMessage;
}

/**
 * 调用青植AI智能体 SSE
 */
function callAgentSSE(content, visitorId, { onTokenStat, onText, onFinish, onError }) {
  const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const payload = JSON.stringify({
    session_id: sessionId,
    bot_app_key: AGENT_CONFIG.appKey,
    visitor_biz_id: visitorId,
    content: content,
    request_id: `req_${Date.now()}`,
    streaming_throttle: 5
  });

  const options = {
    hostname: AGENT_CONFIG.endpoint,
    path: AGENT_CONFIG.path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload)
    }
  };

  let buffer = '';

  const req = https.request(options, (res) => {
    res.on('data', (chunk) => {
      buffer += chunk.toString();

      const events = buffer.split('\n\n');
      buffer = events.pop() || '';

      for (const event of events) {
        if (!event.trim()) {continue;}

        const lines = event.split('\n');
        let eventType = '';
        let eventData = '';

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventType = line.substring(6).trim();
          } else if (line.startsWith('data:')) {
            eventData = line.substring(5).trim();
          }
        }

        if (eventType && eventData) {
          try {
            const data = JSON.parse(eventData);

            if (eventType === 'token_stat') {
              onTokenStat();
            } else if (eventType === 'reply' && data.payload?.content) {
              onText(data.payload.content);
            } else if (eventType === 'error') {
              onError(new Error(data.error?.message || '智能体返回错误'));
              return;
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    });

    res.on('end', () => {
      onFinish();
    });

    res.on('error', onError);
  });

  req.on('error', onError);
  req.setTimeout(120000, () => {
    req.destroy();
    onError(new Error('请求超时'));
  });

  req.write(payload);
  req.end();
}

/**
 * 解析识别结果
 */
function parseIdentifyResult(text) {
  const cleanText = text || '';

  const plantPatterns = [
    { pattern: /绿萝/g, name: '绿萝', scientific: 'Epipremnum aureum', category: '观叶植物' },
    { pattern: /多肉|石莲花|观音莲|莲座|桃蛋|艾伦/g, name: '多肉植物', scientific: 'Succulent', category: '多肉植物' },
    { pattern: /仙人掌/g, name: '仙人掌', scientific: 'Cactaceae', category: '多肉植物' },
    { pattern: /发财树/g, name: '发财树', scientific: 'Pachira aquatica', category: '观叶植物' },
    { pattern: /吊兰/g, name: '吊兰', scientific: 'Chlorophytum comosum', category: '观叶植物' },
    { pattern: /虎皮兰|虎尾兰/g, name: '虎皮兰', scientific: 'Sansevieria trifasciata', category: '观叶植物' },
    { pattern: /富贵竹/g, name: '富贵竹', scientific: 'Dracaena sanderiana', category: '观叶植物' },
    { pattern: /芦荟/g, name: '芦荟', scientific: 'Aloe vera', category: '多肉植物' },
    { pattern: /龟背竹/g, name: '龟背竹', scientific: 'Monstera deliciosa', category: '观叶植物' },
    { pattern: /君子兰/g, name: '君子兰', scientific: 'Clivia miniata', category: '观花植物' },
    { pattern: /文竹/g, name: '文竹', scientific: 'Asparagus setaceus', category: '观叶植物' },
    { pattern: /常春藤/g, name: '常春藤', scientific: 'Hedera helix', category: '观叶植物' },
    { pattern: /蝴蝶兰/g, name: '蝴蝶兰', scientific: 'Phalaenopsis', category: '观花植物' },
    { pattern: /茉莉/g, name: '茉莉花', scientific: 'Jasminum', category: '观花植物' },
  ];

  let identified = null;
  for (const p of plantPatterns) {
    if (p.pattern.test(cleanText)) {
      identified = p;
      break;
    }
  }

  let confidence = 0.75;
  const confMatch = cleanText.match(/置信度[大概约]*(\d+)[成%]?|(\d+)%/);
  if (confMatch) {
    const num = parseInt(confMatch[1] || confMatch[2], 10);
    confidence = num > 1 ? num / 100 : num / 10;
  }

  if (identified) {
    return {
      name: identified.name,
      scientificName: identified.scientific,
      category: identified.category,
      confidence,
      summary: cleanText.substring(0, 200)
    };
  }

  return {
    name: '未知植物',
    scientificName: 'Unknown',
    category: '待确认',
    confidence: 0.5,
    summary: cleanText.substring(0, 200)
  };
}

/**
 * 解析诊断结果
 */
function parseDiagnoseResult(text) {
  const cleanText = text || '';

  let healthScore = 65;
  let healthStatus = 'warning';

  if (/严重|病害|枯死|根腐|立即|紧急|需要立即处理/.test(cleanText)) {
    healthScore = 35;
    healthStatus = 'sick';
  } else if (/健康|正常|良好|没问题|状态不错/.test(cleanText)) {
    healthScore = 85;
    healthStatus = 'healthy';
  } else if (/注意|观察|轻微|需要注意/.test(cleanText)) {
    healthScore = 65;
    healthStatus = 'warning';
  }

  let mainIssue = '需要进一步观察';
  if (/浇水过多|积水/.test(cleanText)) {mainIssue = '浇水过多';}
  else if (/缺水|干燥/.test(cleanText)) {mainIssue = '缺水';}
  else if (/光照不足/.test(cleanText)) {mainIssue = '光照不足';}
  else if (/光照过强|晒伤/.test(cleanText)) {mainIssue = '光照过强';}
  else if (/缺肥|营养/.test(cleanText)) {mainIssue = '营养不足';}
  else if (/病虫害|虫/.test(cleanText)) {mainIssue = '病虫害';}
  else if (/空调|干燥/.test(cleanText)) {mainIssue = '环境过于干燥';}

  return { healthScore, healthStatus, mainIssue, summary: cleanText.substring(0, 200) };
}
