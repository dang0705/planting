/* data_mode=unit_fake; test_kind=unit_logic */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Module = require('node:module')
const originalLoad = Module._load

const sourceQuestionStartPath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/slim-question-start-http-entry.js')
const sourcePackagePath =
  require.resolve('../../../../../cloudfunctions/diagnose-http/app/slim-question-package-http-entry.js')
const generatedQuestionStartPath =
  require.resolve('../../../../../cloudfunctions/diagnosis-question-start-http/app.js')
const generatedPackagePath =
  require.resolve('../../../../../cloudfunctions/diagnosis-answer-http/package-app.js')

function loadSourceEntry(modulePath) {
  delete require.cache[modulePath]
  Module._load = function loadWithoutIdentityResolution(request, parent, isMain) {
    if (
      request === './slim-http-identity' &&
      /slim-(?:question-start|package-answer)-http-entry\.js$/.test(parent?.filename || '')
    ) {
      return {
        resolveSlimHttpIdentity: async () => {
          throw new Error('前置条件用例不应解析身份')
        }
      }
    }
    return originalLoad.call(this, request, parent, isMain)
  }
  try {
    return require(modulePath)
  } finally {
    Module._load = originalLoad
    delete require.cache[modulePath]
  }
}

function normalizeResponse(response) {
  return {
    statusCode: response?.statusCode,
    headers: response?.headers || {},
    body: JSON.parse(response?.body || '{}')
  }
}

async function assertEntryCases(label, sourceEntry, generatedEntry, cases) {
  for (const testCase of cases) {
    const [sourceResponse, generatedResponse] = await Promise.all([
      sourceEntry.main(testCase.event, testCase.context),
      generatedEntry.main(testCase.event, testCase.context)
    ])
    const source = normalizeResponse(sourceResponse)
    const generated = normalizeResponse(generatedResponse)
    assert.equal(source.statusCode, testCase.statusCode, `${label}: ${testCase.name} 状态码变化`)
    assert.deepEqual(
      generated,
      source,
      `${label}: ${testCase.name} 的已生成入口与源码入口响应不一致`
    )
  }
}

const sourceQuestionStart = loadSourceEntry(sourceQuestionStartPath)
const sourcePackage = loadSourceEntry(sourcePackagePath)
delete require.cache[generatedQuestionStartPath]
delete require.cache[generatedPackagePath]
const generatedQuestionStart = require(generatedQuestionStartPath)
const generatedPackage = require(generatedPackagePath)

try {
  await assertEntryCases('question start', sourceQuestionStart, generatedQuestionStart, [
    {
      name: '未知路径',
      event: { body: {} },
      context: { httpContext: { path: '/diagnosis/answer', httpMethod: 'POST' } },
      statusCode: 404
    },
    {
      name: '错误方法',
      event: { body: { symptomClassKey: 'yellowing_mode' } },
      context: { httpContext: { path: '/diagnosis/question/start', httpMethod: 'GET' } },
      statusCode: 405
    },
    {
      name: '不属于专用入口的模式',
      event: { body: { symptomClassKey: 'other_mode' } },
      context: { httpContext: { path: '/diagnosis/question/start', httpMethod: 'POST' } },
      statusCode: 400
    }
  ])

  await assertEntryCases('package answer', sourcePackage, generatedPackage, [
    {
      name: '未知路径',
      event: { body: {} },
      context: { httpContext: { path: '/diagnosis/result', httpMethod: 'POST' } },
      statusCode: 404
    },
    {
      name: '错误方法',
      event: { body: {} },
      context: { httpContext: { path: '/diagnosis/answer', httpMethod: 'GET' } },
      statusCode: 405
    },
    {
      name: '不属于专用入口的模式',
      event: { body: {} },
      context: { httpContext: { path: '/diagnosis/answer', httpMethod: 'POST' } },
      statusCode: 400
    }
  ])
} finally {
  delete require.cache[generatedQuestionStartPath]
  delete require.cache[generatedPackagePath]
}

console.log('diagnosis split entry artifact contract passed')
