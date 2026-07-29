import assert from 'node:assert/strict'

const { buildStreamDiagnosisPromise, buildVisualProgressText, requestDiagnoseStream } =
  await import('../../../../../src/http-functions/diagnose/client-stream.js')

const lifecycleEvents = [
  'visual_preparing',
  'visual_session_created',
  'visual_input_ready',
  'visual_model_started',
  'visual_model_response_started',
  'visual_model_complete',
  'visual_decision_ready',
  'visual_persisted',
  'visual_extraction_complete'
]

for (const event of lifecycleEvents) {
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
assert.equal(responseStartedProgressText, '正在整理照片检查结果。')
assert.doesNotMatch(responseStartedProgressText, /normalized_organ|leaf|提示词/)

const decisionProgressText = buildVisualProgressText('visual_decision_ready', {
  decision: {
    counts: { symptomCandidates: 2, outOfPoolSymptomCandidates: 1 },
    symptomCandidates: [{ symptomCn: '不应展示的模型标签' }]
  }
})
assert.equal(decisionProgressText, '照片检查完成，发现 3 处可见异常。')
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
const progress = []
const streamed = await buildStreamDiagnosisPromise(
  { streamVisualDecision: true },
  {
    onProgress: text => progress.push(text),
    streamDiagnoseRequester: async options => {
      for (const event of lifecycleEvents) {
        options.onChunkReceived({
          data: `event: ${event}\ndata: ${JSON.stringify({ event, imageCount: 2 })}\n\n`
        })
      }
      options.onChunkReceived({
        data: `event: done\ndata: ${JSON.stringify({ event: 'done', data: expectedResult })}\n\n`
      })
      return { statusCode: 200, data: '' }
    }
  }
)
assert.deepEqual(streamed, expectedResult)
assert.equal(progress.length, lifecycleEvents.length)

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
