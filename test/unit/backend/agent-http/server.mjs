// data_mode=unit_fake. Real HTTP handler, isolated auth/storage/upstream boundaries.
// Expected: current task identity isolation + AGENTS.md display boundary + ACP official protocol.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const { createHandler } = require('../../../../cloudfunctions/agent-http/server.js')
async function setup(t, options = {}) {
  const records = new Map(),
    calls = [],
    upstreamUrls = [],
    upstreamHeaders = []
  let active = true
  const store = {
    async insert(row) {
      records.set(row.ticketHash, row)
    },
    async consume(hash, sessionHash, now) {
      const row = records.get(hash)
      if (!row || row.sessionHash || row.ticketExpiresAt <= now) {
        return false
      }
      row.sessionHash = sessionHash
      return true
    },
    async find(hash) {
      return [...records.values()].find(row => row.sessionHash === hash)
    },
    async parentActive() {
      return active
    },
    async lock(row) {
      if (row.lock) {
        return ''
      }
      row.lock = 'locked'
      return row.lock
    },
    async finish(row, _lock, sessionId) {
      row.agentSessionId = sessionId
      row.lock = ''
    }
  }
  const handler = createHandler({
    store,
    resolveIdentity: async headers =>
      headers['x-planting-platform-session'] === 'valid-parent' ? { userId: 'alice' } : null,
    hashParent: () => 'parent-hash',
    apiKey: options.apiKey === undefined ? 'server-only-secret' : options.apiKey,
    agentEndpoint: options.agentEndpoint,
    origin: options.origin === undefined ? 'https://agent.example' : options.origin,
    development: options.development === true,
    executeTool: options.executeTool,
    agentQuota: options.agentQuota,
    fetchAgent: async (url, requestOptions) => {
      upstreamUrls.push(url)
      upstreamHeaders.push(requestOptions.headers)
      calls.push(JSON.parse(requestOptions.body))
      if (typeof options.fetchAgent === 'function') {
        return options.fetchAgent(calls.at(-1), calls.length)
      }
      return new Response(
        'data: ' +
          JSON.stringify({
            method: 'session/update',
            params: {
              sessionId: 'private-session',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: '你好' }
              }
            }
          }) +
          '\n\ndata: {"id":1,"result":{"stopReason":"end_turn"}}\n\n'
      )
    }
  })
  // Exact origin is a deployment setting, known before handler construction.
  const server = http.createServer((req, res) => handler(req, res))
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  t.after(() => {
    server.closeAllConnections()
    server.close()
  })
  return {
    base,
    calls,
    upstreamUrls,
    upstreamHeaders,
    revoke: () => {
      active = false
    }
  }
}

test('开发环境把消息发送到显式配置的本地 ACP 且不要求云端密钥', async t => {
  const localEndpoint = 'http://192.168.50.175:9000/acp'
  const { base, upstreamUrls, upstreamHeaders } = await setup(t, {
    development: true,
    origin: '',
    apiKey: '',
    agentEndpoint: localEndpoint
  })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const origin = new URL(base).origin
  const exchange = await fetch(`${base}/session`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'X-Forwarded-Host': new URL(base).host,
      'X-Forwarded-Proto': 'http',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ticket: data.ticket })
  })
  const response = await fetch(`${base}/message`, {
    method: 'POST',
    headers: {
      Origin: origin,
      'X-Forwarded-Host': new URL(base).host,
      'X-Forwarded-Proto': 'http',
      'Content-Type': 'application/json',
      Cookie: exchange.headers.get('set-cookie').split(';')[0]
    },
    body: JSON.stringify({ text: '绿萝怎么浇水' })
  })
  await response.text()

  assert.equal(response.status, 200)
  assert.deepEqual(upstreamUrls, [localEndpoint])
  assert.equal(upstreamHeaders[0].Accept, 'text/event-stream')
  assert.equal(upstreamHeaders[0]['X-Qinghuazhi-User-Id'], 'alice')
  assert.equal(Object.hasOwn(upstreamHeaders[0], 'Authorization'), false)
})

test('客户端工具结果通过同一 ACP 会话续接，内部工具信息不进入 H5', async t => {
  const toolCalls = []
  const fetchAgent = (body, callNumber) => {
    if (callNumber === 1) {
      return new Response(
        'data: ' +
          JSON.stringify({
            method: 'session/update',
            params: {
              sessionId: 'private-session',
              update: {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: '我先查询植物目录。' }
              }
            }
          }) +
          '\n\ndata: ' +
          JSON.stringify({
            id: 1,
            result: {
              stopReason: 'tool_use',
              pendingToolUse: {
                toolUseId: 'private-tool-id',
                toolName: 'qinghuazhi_plant_lookup',
                input: { keyword: '绿萝' }
              }
            }
          }) +
          '\n\n'
      )
    }
    assert.deepEqual(body.params.prompt, [
      {
        type: 'tool_result',
        tool_use_id: 'private-tool-id',
        content: JSON.stringify({ ok: true, matches: [{ name: '绿萝' }] }),
        is_error: false
      }
    ])
    assert.equal(body.params.sessionId, 'private-session')
    return new Response(
      'data: ' +
        JSON.stringify({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '浇水前先检查盆土。' }
            }
          }
        }) +
        '\n\ndata: {"id":1,"result":{"stopReason":"end_turn"}}\n\n'
    )
  }
  const { base } = await setup(t, {
    executeTool: async pending => {
      toolCalls.push(pending)
      return { ok: true, matches: [{ name: '绿萝' }] }
    },
    fetchAgent
  })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]

  const response = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '绿萝怎么浇水合适' })
  })
  const output = await response.text()

  assert.equal(response.status, 200)
  assert.equal(toolCalls.length, 1)
  assert.equal(toolCalls[0].toolName, 'qinghuazhi_plant_lookup')
  assert.ok(output.includes('浇水前先检查盆土。'))
  assert.ok(output.includes('"done":true'))
  assert.equal(output.includes('private-tool-id'), false)
  assert.equal(output.includes('qinghuazhi_plant_lookup'), false)
})

test('AskUserQuestion 会暂停并只向 H5 返回安全 ask_user 事件，不自动执行工具', async t => {
  let executeCount = 0
  const fetchAgent = (_body, callNumber) => {
    assert.equal(callNumber, 1)
    return new Response(
      'data: ' +
        JSON.stringify({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '请先选择植物状态。' }
            }
          }
        }) +
        '\n\ndata: ' +
        JSON.stringify({
          jsonrpc: '2.0',
          id: 'private-request-id',
          method: 'client/AskUserQuestion',
          params: {
            sessionId: 'private-session',
            questions: [
              {
                question: '你的植物现在是什么状态？',
                header: '植物状态',
                multiSelect: false,
                options: [
                  { label: '偏干', description: '盆土表层已经干燥。', preview: 'secret-preview' },
                  { label: '偏湿', description: '盆土仍然湿润。' }
                ],
                toolUseId: 'forged-public-field'
              }
            ],
            secret: 'private-secret'
          },
          _meta: { sessionId: 'private-session', toolCallId: 'private-tool-id' }
        }) +
        '\n\ndata: {"id":1,"result":{"stopReason":"tool_use"}}\n\n'
    )
  }
  const { base } = await setup(t, {
    fetchAgent,
    executeTool: async () => {
      executeCount += 1
      return { ok: true }
    }
  })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]

  const response = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '帮我判断植物状态' })
  })
  const output = await response.text()
  const events = output
    .split('\n\n')
    .filter(Boolean)
    .map(block => JSON.parse(block.replace(/^data:\s*/, '')))
  const ask = events.find(event => event.type === 'ask_user')

  assert.equal(response.status, 200)
  assert.equal(executeCount, 0)
  assert.deepEqual(ask.questions, [
    {
      question: '你的植物现在是什么状态？',
      header: '植物状态',
      multiSelect: false,
      options: [
        { label: '偏干', description: '盆土表层已经干燥。' },
        { label: '偏湿', description: '盆土仍然湿润。' }
      ]
    }
  ])
  assert.equal(typeof ask.resumeToken, 'string')
  assert.equal(output.includes('private-session'), false)
  assert.equal(output.includes('private-tool-id'), false)
  assert.equal(output.includes('private-secret'), false)
  assert.equal(output.includes('secret-preview'), false)
  assert.ok(output.includes('"done":true'))
})

test('同一登录会话提交安全选择后通过 tool_result 续接 ACP', async t => {
  const calls = []
  const fetchAgent = (body, callNumber) => {
    calls.push(body)
    if (callNumber === 1) {
      return new Response(
        'data: ' +
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'client/AskUserQuestion',
            params: {
              sessionId: 'private-session',
              questions: [
                {
                  question: '你的植物现在是什么状态？',
                  header: '植物状态',
                  multiSelect: false,
                  options: [
                    { label: '偏干', description: 'a' },
                    { label: '偏湿', description: 'b' }
                  ]
                }
              ]
            },
            _meta: { toolCallId: 'private-tool-id' }
          }) +
          '\n\ndata: {"id":1,"result":{"stopReason":"tool_use"}}\n\n'
      )
    }
    assert.equal(body.params.sessionId, 'private-session')
    assert.deepEqual(body.params.prompt, [
      {
        type: 'tool_result',
        tool_use_id: 'private-tool-id',
        content: JSON.stringify({ answers: { '你的植物现在是什么状态？': '偏干' } }),
        is_error: false
      }
    ])
    return new Response(
      'data: ' +
        JSON.stringify({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '收到，你的植物可能偏干。' }
            }
          }
        }) +
        '\n\ndata: {"id":1,"result":{"stopReason":"end_turn"}}\n\n'
    )
  }
  const { base } = await setup(t, { fetchAgent })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]
  const first = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '帮我判断植物状态' })
  })
  const firstOutput = await first.text()
  const ask = firstOutput
    .split('\n\n')
    .filter(Boolean)
    .map(block => JSON.parse(block.replace(/^data:\s*/, '')))
    .find(event => event.type === 'ask_user')

  const resumed = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      resumeToken: ask.resumeToken,
      answers: { '你的植物现在是什么状态？': '偏干' }
    })
  })
  const resumedOutput = await resumed.text()

  assert.equal(resumed.status, 200)
  assert.ok(resumedOutput.includes('收到，你的植物可能偏干。'))
  assert.ok(resumedOutput.includes('"done":true'))
  assert.equal(calls.length, 2)
})

test('服务端额度拒绝时不调用模型，并返回前端可识别的 429', async t => {
  let upstreamCalls = 0
  const quotaError = Object.assign(new Error('今天的小青额度已用完，明天再来继续聊天。'), {
    statusCode: 429,
    code: 'AGENT_DAILY_LIMIT_EXCEEDED',
    data: {
      policy: 'daily_turns',
      usedToday: 20,
      dailyLimit: 20,
      remainingToday: 0,
      blocked: true,
      warning: false,
      message: '今天的小青额度已用完，明天再来继续聊天。'
    }
  })
  const { base } = await setup(t, {
    agentQuota: {
      reserve: async () => {
        throw quotaError
      }
    },
    fetchAgent: async () => {
      upstreamCalls += 1
      return new Response('')
    }
  })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]

  const response = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '继续聊天' })
  })
  const body = await response.json()

  assert.equal(response.status, 429)
  assert.equal(body.code, 'AGENT_DAILY_LIMIT_EXCEEDED')
  assert.equal(body.data.remainingToday, 0)
  assert.equal(upstreamCalls, 0)
})

test('续接上游失败后保留当前问答令牌以便重试', async t => {
  const fetchAgent = (_body, callNumber) => {
    if (callNumber === 1) {
      return new Response(
        'data: ' +
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'client/AskUserQuestion',
            params: {
              sessionId: 'private-session',
              questions: [
                {
                  question: '你的植物现在是什么状态？',
                  header: '植物状态',
                  multiSelect: false,
                  options: [
                    { label: '偏干', description: 'a' },
                    { label: '偏湿', description: 'b' }
                  ]
                }
              ]
            },
            _meta: { toolCallId: 'private-tool-id' }
          }) +
          '\n\ndata: {"id":1,"result":{"stopReason":"tool_use"}}\n\n'
      )
    }
    if (callNumber === 2) {
      throw new Error('upstream temporarily unavailable')
    }
    return new Response(
      'data: ' +
        JSON.stringify({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '已收到你的选择。' }
            }
          }
        }) +
        '\n\ndata: {"id":1,"result":{"stopReason":"end_turn"}}\n\n'
    )
  }
  const { base } = await setup(t, { fetchAgent })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]
  const first = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '帮我判断植物状态' })
  })
  const ask = (await first.text())
    .split('\n\n')
    .filter(Boolean)
    .map(block => JSON.parse(block.replace(/^data:\s*/, '')))
    .find(event => event.type === 'ask_user')
  const answer = { resumeToken: ask.resumeToken, answers: { '你的植物现在是什么状态？': '偏干' } }
  const failed = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify(answer)
  })
  await failed.text()
  const retried = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify(answer)
  })
  const retriedOutput = await retried.text()
  assert.equal(retried.status, 200)
  assert.ok(retriedOutput.includes('已收到你的选择。'))
})

test('连续提问时旧 resumeToken 不能续接当前问答', async t => {
  const askResponse = (question, toolId) =>
    new Response(
      'data: ' +
        JSON.stringify({
          jsonrpc: '2.0',
          method: 'client/AskUserQuestion',
          params: {
            sessionId: 'private-session',
            questions: [
              {
                question,
                header: '植物状态',
                multiSelect: false,
                options: [
                  { label: '偏干', description: 'a' },
                  { label: '偏湿', description: 'b' }
                ]
              }
            ]
          },
          _meta: { toolCallId: toolId }
        }) +
        '\n\ndata: {"id":1,"result":{"stopReason":"tool_use"}}\n\n'
    )
  const fetchAgent = (_body, callNumber) =>
    askResponse(
      callNumber === 1 ? '第一轮状态？' : '第二轮状态？',
      callNumber === 1 ? 'private-tool-1' : 'private-tool-2'
    )
  const { base, calls } = await setup(t, { fetchAgent })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]
  const first = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text: '帮我判断植物状态' })
  })
  const firstAsk = (await first.text())
    .split('\n\n')
    .filter(Boolean)
    .map(block => JSON.parse(block.replace(/^data:\s*/, '')))
    .find(event => event.type === 'ask_user')
  const second = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      resumeToken: firstAsk.resumeToken,
      answers: { '第一轮状态？': '偏干' }
    })
  })
  const secondAsk = (await second.text())
    .split('\n\n')
    .filter(Boolean)
    .map(block => JSON.parse(block.replace(/^data:\s*/, '')))
    .find(event => event.type === 'ask_user')
  assert.equal(typeof secondAsk.resumeToken, 'string')

  const stale = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      resumeToken: firstAsk.resumeToken,
      answers: { '第一轮状态？': '偏干' }
    })
  })
  assert.equal(stale.status, 400)
  assert.equal(calls.length, 2)
})

test('伪造内部字段或不在卡片中的选择会被拒绝且不会触发上游', async t => {
  let calls = 0
  const { base } = await setup(t, {
    fetchAgent: () => {
      calls += 1
      return new Response('data: {"id":1,"result":{"stopReason":"end_turn"}}\n\n')
    }
  })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  headers.Cookie = exchanged.headers.get('set-cookie').split(';')[0]

  const response = await fetch(`${base}/message`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      text: '继续',
      sessionId: 'forged-session',
      tool_use_id: 'forged-tool'
    })
  })
  assert.equal(response.status, 400)
  assert.equal(calls, 0)
})
test('未登录不能生成网页登录票据', async t => {
  const { base } = await setup(t)
  const res = await fetch(`${base}/ticket`, { method: 'POST' })
  assert.equal(res.status, 401)
  assert.equal((await res.json()).message, '请先登录后再使用小青。')
})
test('本地网关健康探针返回统一业务码', async t => {
  const { base } = await setup(t)
  const response = await fetch(`${base}/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { code: 200, data: { status: 'ok' } })
})
test('未知来源不能兑换票据，凭证不出现在错误中', async t => {
  const { base } = await setup(t)
  const res = await fetch(`${base}/session`, {
    method: 'POST',
    headers: { Origin: 'https://evil.example' }
  })
  assert.equal(res.status, 403)
  assert.equal((await res.text()).includes('server-only-secret'), false)
})
test('已登录只取得短期票据，不取得后台凭证', async t => {
  const { base } = await setup(t)
  const res = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const body = await res.json()
  assert.equal(res.status, 200)
  assert.match(body.data.ticket, /^[\w-]{43}$/)
  assert.deepEqual(Object.keys(body.data), ['ticket'])
})
test('本地模式只允许与当前 LAN 网关同源的 H5 换票', async t => {
  const { base } = await setup(t, { development: true, origin: '' })
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const sameOrigin = await fetch(`${base}/session`, {
    method: 'POST',
    headers: {
      Origin: base,
      'X-Forwarded-Host': new URL(base).host,
      'X-Forwarded-Proto': 'http',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ticket: data.ticket })
  })
  assert.equal(sameOrigin.status, 200)

  const foreignOrigin = await fetch(`${base}/session`, {
    method: 'POST',
    headers: {
      Origin: 'http://other-device.local',
      'X-Forwarded-Host': new URL(base).host,
      'X-Forwarded-Proto': 'http',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ ticket: data.ticket })
  })
  assert.equal(foreignOrigin.status, 403)
})
test('换票到聊天完整接线：Cookie 安全属性、会话延续、伪造会话拒绝、退出失效', async t => {
  const { base, calls, revoke } = await setup(t)
  const ticketResponse = await fetch(`${base}/ticket`, {
    method: 'POST',
    headers: { 'x-planting-platform-session': 'valid-parent' }
  })
  const { data } = await ticketResponse.json()
  const headers = { Origin: 'https://agent.example', 'Content-Type': 'application/json' }
  const exchanged = await fetch(`${base}/session`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ ticket: data.ticket })
  })
  assert.equal(exchanged.status, 200)
  const cookie = exchanged.headers.get('set-cookie')
  for (const attribute of ['HttpOnly', 'Secure', 'SameSite=Strict']) {
    assert.ok(cookie.includes(attribute))
  }
  headers.Cookie = cookie.split(';')[0]
  const ask = body =>
    fetch(`${base}/message`, { method: 'POST', headers, body: JSON.stringify(body) })
  const first = await ask({ text: '你好' })
  assert.equal(first.status, 200)
  const output = await first.text()
  assert.ok(output.includes('你好'))
  assert.ok(output.includes('"done":true'))
  assert.ok(!output.includes('private-session'))
  const second = await ask({ text: '继续' })
  await second.text()
  assert.equal(calls[1].params.sessionId, 'private-session')
  const forged = await ask({ text: '继续', sessionId: 'someone-else' })
  assert.equal(forged.status, 400)
  assert.equal(calls.length, 2)
  revoke()
  assert.equal((await ask({ text: '你好' })).status, 401)
  assert.equal(calls.length, 2)
})
