import assert from 'node:assert/strict'

const {
  buildFrontendTokenUsageSummary,
  buildStreamDiagnosisPromise,
  buildVisualProgressText,
  requestDiagnoseStream
} =
  await import('../../../../../../../src/subpackages/diagnosis/http-functions/diagnose/client-stream.js')

const lifecycleEvents = [
  'visual_preparing',
  'visual_session_created',
  'visual_input_ready',
  'visual_model_started',
  'visual_model_prompt_ready',
  'visual_model_response_started',
  'visual_model_complete',
  'visual_decision_ready',
  'visual_persisted',
  'visual_extraction_complete'
]

for (const event of lifecycleEvents) {
  if (event === 'visual_model_prompt_ready') {
    continue
  }
  const progressText = buildVisualProgressText(event, {
    imageCount: 2,
    content: '池内结构化裁决证据'
  })
  assert.notEqual(progressText, '')
  assert.doesNotMatch(progressText, /池内|池外|裁决|结构化|证据/)
}

const responseStartedProgressText = buildVisualProgressText('visual_model_response_started', {
  content: '{"normalized_organ":"leaf"}',
  fullText: '{"normalized_organ":"leaf"}',
  prompt: '内部提示词'
})
assert.equal(responseStartedProgressText, '正在整理检查结果。')
assert.doesNotMatch(responseStartedProgressText, /normalized_organ|leaf|提示词/)
assert.equal(
  buildVisualProgressText('visual_model_started', { displayText: '正在查看叶片。' }),
  '正在查看叶片。'
)
assert.equal(
  buildVisualProgressText('visual_model_started', {
    data: { displayText: '正在查看根部。' }
  }),
  '正在查看根部。'
)
assert.equal(
  buildVisualProgressText('visual_model_started', {
    data: JSON.stringify({ displayText: '正在查看茎部。' })
  }),
  '正在查看茎部。'
)
assert.equal(
  buildVisualProgressText('visual_model_started', {
    data: { payload: { node: { displayText: '正在查看土表。' } } }
  }),
  '正在查看土表。'
)
assert.equal(
  buildVisualProgressText('message', {
    data: { event: 'visual_model_started', data: { displayText: '正在查看全株。' } }
  }),
  '正在查看全株。'
)
assert.equal(buildVisualProgressText('unknown_node', {}), '')
assert.deepEqual(
  buildFrontendTokenUsageSummary({
    promptTokens: 1200,
    completionTokens: 80,
    totalTokens: 1280,
    promptCacheHitTokens: 900,
    promptCacheCreationInputTokens: 30,
    promptCacheMissTokens: 270
  }),
  {
    inputTokens: 1200,
    outputTokens: 80,
    totalTokens: 1280,
    cachedTokens: 900,
    cacheCreationTokens: 30,
    cacheMissTokens: 270,
    reasoningTokens: null,
    providerPromptTextTokens: null,
    providerPromptImageTokens: null
  }
)
assert.deepEqual(
  buildFrontendTokenUsageSummary({
    input_tokens: 1200,
    output_tokens: 80,
    prompt_tokens_details: {
      cached_input_tokens: 900,
      cache_creation_input_tokens: 30,
      cache_miss_input_tokens: 270
    }
  }),
  {
    inputTokens: 1200,
    outputTokens: 80,
    totalTokens: 1280,
    cachedTokens: 900,
    cacheCreationTokens: 30,
    cacheMissTokens: 270,
    reasoningTokens: null,
    providerPromptTextTokens: null,
    providerPromptImageTokens: null
  }
)

const decisionProgressText = buildVisualProgressText('visual_decision_ready', {
  decision: {
    counts: { symptomCandidates: 2, outOfPoolSymptomCandidates: 1 },
    symptomCandidates: [{ symptomCn: '不应展示的模型标签' }]
  }
})
assert.equal(decisionProgressText, '照片检查完成，发现 3 处需要留意的地方。')
assert.doesNotMatch(decisionProgressText, /不应展示的模型标签/)

const expectedResult = {
  diagnosisSessionId: 'diag_stream_1',
  routePrimaryAction: 'question_package',
  aiUsage: {
    inputTokens: 1200,
    outputTokens: 80,
    totalTokens: 1280,
    cachedTokens: 900
  }
}
const expectedDiagnosisDebug = {
  tokenUsage: {
    imageCount: 1,
    inputTokens: 1200,
    outputTokens: 80,
    totalTokens: 1280,
    cachedTokens: 900,
    cacheCreationTokens: 30
  },
  modelBusinessData: [
    {
      imageIndex: 0,
      imageId: 'img_leaf_1',
      rawTextOutput: '{"leaf_spot":true}',
      rawStructuredOutput: { leaf_spot: true },
      usage: { promptTokens: 1200, completionTokens: 80 }
    }
  ],
  finalVisualEvidenceData: {
    effectiveImageCount: 1,
    visualEvidenceItems: [
      { symptomKey: 'leaf_spot', displayNameCn: '叶片斑点', supportImageCount: 1 }
    ]
  }
}
const progress = []
const frontendLogs = []
const originalConsoleLog = console.log
console.log = (...args) => frontendLogs.push(args)
let streamed
try {
  streamed = await buildStreamDiagnosisPromise(
    { streamVisualDecision: true },
    {
      onProgress: text => progress.push(text),
      streamDiagnoseRequester: async options => {
        for (const event of lifecycleEvents) {
          if (event === 'visual_model_prompt_ready') {
            options.onChunkReceived({
              data: `event: ${event}\ndata: ${JSON.stringify({
                event,
                imageIndex: 0,
                imageId: 'img_leaf_1',
                promptLength: 123,
                promptText: 'static prompt\n[Dynamic Task]\nactual runtime prompt',
                promptCacheStrategy: { enabled: true },
                promptDebugMeta: { promptCacheStaticPrefixHash: 'static_hash' },
                model: 'qwen3.5-flash'
              })}\n\n`
            })
            continue
          }
          const eventData = { event, imageCount: 2, displayText: `节点文案：${event}` }
          if (event === 'visual_model_complete') {
            eventData.modelBusinessData = [{ rawStructuredOutput: { normalized_organ: 'leaf' } }]
          }
          if (event === 'visual_decision_ready') {
            eventData.usage = {
              inputTokens: 1200,
              outputTokens: 80,
              totalTokens: 1280,
              cachedTokens: 900
            }
          }
          options.onChunkReceived({
            data: `event: ${event}\ndata: ${JSON.stringify(eventData)}\n\n`
          })
        }
        options.onChunkReceived({
          data: `event: done\ndata: ${JSON.stringify({
            event: 'done',
            data: expectedResult,
            diagnosisDebug: expectedDiagnosisDebug
          })}\n\n`
        })
        return { statusCode: 200, data: '' }
      }
    }
  )
} finally {
  console.log = originalConsoleLog
}
assert.deepEqual(streamed, expectedResult)
assert.equal(progress.length, lifecycleEvents.length - 1)
assert.equal(
  frontendLogs.some(args => args[0] === '[诊断 start][节点]'),
  true
)
assert.equal(
  frontendLogs.some(args => args[0] === '[诊断 start][分片]'),
  true
)
assert.equal(
  frontendLogs.some(args => args[0] === '[诊断 start][token 用量]'),
  true
)
assert.equal(
  frontendLogs.some(args => args[0] === '[诊断 start][模型业务数据]'),
  true
)
assert.deepEqual(frontendLogs.find(args => args[0] === '[诊断 start][模型调用prompt]')?.[1], {
  imageIndex: 0,
  imageId: 'img_leaf_1',
  model: 'qwen3.5-flash',
  modelIdentity: null,
  promptLength: 123,
  promptCacheStrategy: { enabled: true },
  promptDebugMeta: { promptCacheStaticPrefixHash: 'static_hash' },
  promptText: 'static prompt\n[Dynamic Task]\nactual runtime prompt'
})
assert.equal(
  frontendLogs.some(args => args[0] === '[诊断 start][完成响应]'),
  true
)
assert.deepEqual(
  frontendLogs.find(
    args => args[0] === '[诊断 start][token 用量]' && args[1]?.cacheCreationTokens === 30
  )?.[1],
  {
    inputTokens: 1200,
    outputTokens: 80,
    totalTokens: 1280,
    cachedTokens: 900,
    cacheCreationTokens: 30,
    cacheMissTokens: null,
    reasoningTokens: null,
    providerPromptTextTokens: null,
    providerPromptImageTokens: null
  }
)
assert.deepEqual(
  frontendLogs.find(args => args[0] === '[诊断 start][最终视觉证据数据]')?.[1],
  expectedDiagnosisDebug.finalVisualEvidenceData
)
assert.equal(progress[0], '节点文案：visual_preparing')
assert.equal(progress.at(-1), '节点文案：visual_extraction_complete')

const fallbackLogs = []
console.log = (...args) => fallbackLogs.push(args)
try {
  await buildStreamDiagnosisPromise(
    {},
    {
      streamDiagnoseRequester: async options => {
        options.onChunkReceived({
          data: `event: message\ndata: ${JSON.stringify({
            data: {
              event: 'visual_model_complete',
              data: {
                modelBusinessData: [{ rawStructuredOutput: { normalized_organ: 'leaf' } }]
              }
            }
          })}\n\n`
        })
        options.onChunkReceived({
          data: `event: message\ndata: ${JSON.stringify({
            data: {
              event: 'visual_decision_ready',
              data: {
                usage: {
                  input_tokens: 1200,
                  output_tokens: 80,
                  cached_input_tokens: 900,
                  cache_creation_input_tokens: 30,
                  cache_miss_input_tokens: 270
                }
              }
            }
          })}\n\n`
        })
        options.onChunkReceived({
          data: `event: done\ndata: ${JSON.stringify({
            event: 'done',
            data: {
              diagnosisSessionId: 'diag_fallback_1',
              visualAggregateSummary: { effectiveImageCount: 1 }
            }
          })}\n\n`
        })
        return { data: '' }
      }
    }
  )
} finally {
  console.log = originalConsoleLog
}
const fallbackTokenLogs = fallbackLogs.filter(args => args[0] === '[诊断 start][token 用量]')
assert.equal(fallbackTokenLogs.length >= 2, true)
assert.deepEqual(fallbackTokenLogs.at(-1)?.[1], {
  inputTokens: 1200,
  outputTokens: 80,
  totalTokens: 1280,
  cachedTokens: 900,
  cacheCreationTokens: 30,
  cacheMissTokens: 270,
  reasoningTokens: null,
  providerPromptTextTokens: null,
  providerPromptImageTokens: null
})
assert.equal(
  fallbackLogs.some(args => args[0] === '[诊断 start][token 用量缺失]'),
  false
)
assert.deepEqual(fallbackLogs.find(args => args[0] === '[诊断 start][模型业务数据]')?.[1], [
  { rawStructuredOutput: { normalized_organ: 'leaf' } }
])

const replyProgress = []
const replyResult = await buildStreamDiagnosisPromise(
  {},
  {
    onProgress: text => replyProgress.push(text),
    streamDiagnoseRequester: async options => {
      options.onChunkReceived({
        data: 'event: reply\ndata: {"event":"reply","content":"内部推理：叶片存在病斑","fullText":"完整原始模型输出"}\n\n'
      })
      options.onChunkReceived({
        data: `event: done\ndata: ${JSON.stringify({ event: 'done', data: expectedResult })}\n\n`
      })
      return { statusCode: 200, data: '' }
    }
  }
)
assert.deepEqual(replyResult, expectedResult)
assert.deepEqual(replyProgress, [])

const splitChunkProgress = []
const splitChunkText = `event: visual_model_started\ndata: ${JSON.stringify({
  event: 'visual_model_started',
  displayText: '正在查看叶片。'
})}\n\n`
const splitChunkBytes = new TextEncoder().encode(splitChunkText)
const splitChunkResult = await buildStreamDiagnosisPromise(
  {},
  {
    onProgress: text => splitChunkProgress.push(text),
    streamDiagnoseRequester: async options => {
      options.onChunkReceived({ data: splitChunkBytes.slice(0, 11).buffer })
      options.onChunkReceived({ data: splitChunkBytes.slice(11).buffer })
      options.onChunkReceived({
        data: `event: done\ndata: ${JSON.stringify({ event: 'done', data: expectedResult })}\n\n`
      })
      return { data: '' }
    }
  }
)
assert.deepEqual(splitChunkResult, expectedResult)
assert.deepEqual(splitChunkProgress, ['正在查看叶片。'])

const nestedEventProgress = []
const nestedEventResult = await buildStreamDiagnosisPromise(
  {},
  {
    onProgress: text => nestedEventProgress.push(text),
    streamDiagnoseRequester: async options => {
      options.onChunkReceived({
        data: `event: message\ndata: ${JSON.stringify({
          data: { event: 'visual_model_started', data: { displayText: '正在查看嵌套节点。' } }
        })}\n\n`
      })
      options.onChunkReceived({
        data: `event: message\ndata: ${JSON.stringify({
          data: { event: 'done', data: expectedResult }
        })}\n\n`
      })
      return { data: '' }
    }
  }
)
assert.deepEqual(nestedEventResult, expectedResult)
assert.deepEqual(nestedEventProgress, ['正在查看嵌套节点。'])

const bufferedObject = await buildStreamDiagnosisPromise(
  {},
  { streamDiagnoseRequester: async () => ({ data: { code: 200, data: expectedResult } }) }
)
assert.deepEqual(bufferedObject, expectedResult)

const bufferedJson = JSON.stringify({ code: 200, data: expectedResult })
const encoded = new TextEncoder().encode(bufferedJson)
const padded = new Uint8Array(encoded.byteLength + 4)
padded.set(encoded, 2)
const bufferedArrayView = padded.subarray(2, 2 + encoded.byteLength)
const bufferedArrayBuffer = await buildStreamDiagnosisPromise(
  {},
  { streamDiagnoseRequester: async () => ({ data: bufferedArrayView.buffer.slice(2, -2) }) }
)
assert.deepEqual(bufferedArrayBuffer, expectedResult)
const bufferedTypedArray = await buildStreamDiagnosisPromise(
  {},
  { streamDiagnoseRequester: async () => ({ data: bufferedArrayView }) }
)
assert.deepEqual(bufferedTypedArray, expectedResult)

let streamRequestCalls = 0
let replayCalls = 0
const noReplayResult = await requestDiagnoseStream(
  { images: [{ imageRef: 'cloud://leaf' }] },
  {
    onProgress: () => {},
    streamDiagnoseRequester: async ({ payload }) => {
      streamRequestCalls += 1
      assert.equal(payload.streamVisualDecision, true)
      return { data: new TextEncoder().encode(bufferedJson).buffer }
    },
    requestDiagnosisStart: async () => {
      replayCalls += 1
      return expectedResult
    },
    requestWithRetry: async task => task()
  }
)
assert.deepEqual(noReplayResult, expectedResult)
assert.equal(streamRequestCalls, 1)
assert.equal(replayCalls, 0)

await assert.rejects(
  () =>
    requestDiagnoseStream(
      {},
      {
        streamDiagnoseRequester: async () => ({
          data: { code: 501, businessCode: 'SSE_UNSUPPORTED', message: '当前请求不支持 SSE' }
        }),
        requestDiagnosisStart: async () => {
          replayCalls += 1
          return expectedResult
        },
        requestWithRetry: async task => task()
      }
    ),
  /当前请求不支持 SSE/
)
assert.equal(replayCalls, 0)

await assert.rejects(
  () =>
    buildStreamDiagnosisPromise(
      {},
      {
        streamDiagnoseRequester: async options => {
          options.onChunkReceived({
            data: 'event: error\ndata: {"event":"error","message":"视觉模型失败"}\n\n'
          })
          return { data: '' }
        }
      }
    ),
  /视觉模型失败/
)

console.log('diagnosis stream client tests passed')
