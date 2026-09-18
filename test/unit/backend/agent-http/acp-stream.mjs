// data_mode=unit_fake; protocol boundary isolation.
// Expected: https://docs.cloudbase.net/ai/agent-development/acp-protocol
// Project AGENTS.md: thought, tool payloads and internal identifiers must never be displayed.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const {
  consumeAcpStream,
  sanitizeAgentText
} = require('../../../../cloudfunctions/agent-http/acp-stream.js')
const frame = value => `data: ${JSON.stringify(value)}\n\n`
async function* chunks(text) {
  const bytes = Buffer.from(text)
  for (let i = 0; i < bytes.length; i += 7) {
    yield bytes.subarray(i, i + 7)
  }
}
test('中文跨字节分片仍完整，只有正文可以进入展示事件', async () => {
  const output = []
  const result = await consumeAcpStream(
    chunks(
      frame({
        method: 'session/update',
        params: {
          sessionId: 'private-session',
          update: { sessionUpdate: 'agent_thought_chunk', content: { text: 'private-thought' } }
        }
      }) +
        frame({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '你好，绿萝' }
            }
          }
        }) +
        frame({
          method: 'session/update',
          params: { update: { sessionUpdate: 'tool_call', raw: 'private-tool' } }
        }) +
        frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'end_turn' } }) +
        'data: [DONE]\n\n'
    ),
    event => output.push(event),
    { streamText: true }
  )
  assert.deepEqual(output, [{ text: '你好，绿萝' }])
  assert.equal(result.sessionId, 'private-session')
})

test('正文 ACP 增量事件会按到达顺序逐段转发', async () => {
  const output = []
  await consumeAcpStream(
    chunks(
      frame({
        method: 'session/update',
        params: {
          sessionId: 'private-session',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: '你好' }
          }
        }
      }) +
        frame({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '，绿萝' }
            }
          }
        }) +
        frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'end_turn' } })
    ),
    event => output.push(event),
    { streamText: true }
  )
  assert.deepEqual(output, [{ text: '你好' }, { text: '，绿萝' }])
})

test('工具名跨 ACP 正文分片时也不能泄漏内部标识', async () => {
  const output = []
  await consumeAcpStream(
    chunks(
      frame({
        method: 'session/update',
        params: {
          sessionId: 'private-session',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: '我将调用 qinghuazhi_watering_' }
          }
        }
      }) +
        frame({
          method: 'session/update',
          params: {
            sessionId: 'private-session',
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'plan 获取建议。' }
            }
          }
        }) +
        frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'end_turn' } })
    ),
    event => output.push(event),
    { streamText: true }
  )
  const text = output.map(event => event.text).join('')
  assert.equal(text.includes('qinghuazhi_watering_'), false)
  assert.equal(text.includes('qinghuazhi_watering_plan'), false)
  assert.ok(text.includes('浇水建议'))
})

test('断流不能冒充完整回复', async () => {
  await assert.rejects(
    consumeAcpStream(
      chunks(
        frame({
          params: {
            update: {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: '未完' }
            }
          }
        })
      ),
      () => {}
    ),
    /回复未完成/
  )
})
test('上游内部错误不会直接暴露', async () => {
  await assert.rejects(
    consumeAcpStream(chunks(frame({ error: { code: -1, message: 'secret-internal' } })), () => {}),
    error => !error.message.includes('secret-internal')
  )
})

test('客户端工具暂停会返回可续接结果，中间话术和工具参数都不进入展示事件', async () => {
  const output = []
  const result = await consumeAcpStream(
    chunks(
      frame({
        method: 'session/update',
        params: {
          sessionId: 'private-session',
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: { type: 'text', text: '我先查询植物目录。' }
          }
        }
      }) +
        frame({
          jsonrpc: '2.0',
          id: 'private-call-id',
          method: 'client/qinghuazhi_plant_lookup',
          params: { keyword: '绿萝', sessionId: 'private-session' }
        }) +
        frame({
          jsonrpc: '2.0',
          id: 1,
          result: {
            stopReason: 'tool_use',
            pendingToolUse: {
              toolUseId: 'private-tool-id',
              toolName: 'qinghuazhi_plant_lookup',
              input: { keyword: '绿萝' }
            }
          }
        })
    ),
    event => output.push(event)
  )

  assert.deepEqual(output, [])
  assert.deepEqual(result, {
    sessionId: 'private-session',
    stopReason: 'tool_use',
    pendingToolUse: {
      toolUseId: 'private-tool-id',
      toolName: 'qinghuazhi_plant_lookup',
      input: { keyword: '绿萝' }
    }
  })
})

test('client/AskUserQuestion 请求会被识别为客户端提问而不是普通自动工具', async () => {
  const result = await consumeAcpStream(
    chunks(
      frame({
        jsonrpc: '2.0',
        id: 'private-request-id',
        method: 'client/AskUserQuestion',
        params: {
          sessionId: 'private-session',
          questions: [
            {
              question: '选择状态？',
              header: '状态',
              multiSelect: false,
              options: [
                { label: '偏干', description: 'a' },
                { label: '偏湿', description: 'b' }
              ]
            }
          ]
        },
        _meta: { sessionId: 'private-session', toolCallId: 'private-tool-id' }
      }) + frame({ jsonrpc: '2.0', id: 1, result: { stopReason: 'tool_use' } })
    ),
    () => {}
  )

  assert.deepEqual(result.pendingToolUse, {
    toolUseId: 'private-tool-id',
    toolName: 'AskUserQuestion',
    input: {
      questions: [
        {
          question: '选择状态？',
          header: '状态',
          multiSelect: false,
          options: [
            { label: '偏干', description: 'a' },
            { label: '偏湿', description: 'b' }
          ]
        }
      ]
    }
  })
})

test('最终正文会移除内部工具名、状态码和底层连接错误', () => {
  const output = sanitizeAgentText(
    'qinghuazhi_watering_plan（watering_planner_v21）返回 Stream closed，状态 likely_too_dry（low），needs_review，原因码 CHECK_SOIL_BEFORE_WATERING；amountRangeMl、nextWaterDate、nextWaterWindow 为空，方式 soak_then_drain。'
  )
  for (const internal of [
    'qinghuazhi_watering_plan',
    'watering_planner_v21',
    'Stream closed',
    'likely_too_dry',
    '（low）',
    'needs_review',
    'CHECK_SOIL_BEFORE_WATERING',
    '原因码',
    'amountRangeMl',
    'nextWaterDate',
    'nextWaterWindow',
    'soak_then_drain'
  ]) {
    assert.equal(output.includes(internal), false)
  }
  assert.ok(output.includes('浇水建议'))
})
