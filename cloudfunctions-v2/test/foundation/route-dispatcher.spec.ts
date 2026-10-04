import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, test } from 'vitest'

import {
  createRouteDispatcher,
  type FrozenRoute,
  type RouteBinding,
  type RoutePathParameters
} from '../../src/foundation/http/route-dispatcher.js'

const okStatus = 200
const badRequestStatus = 400
const notFoundStatus = 404
const methodNotAllowedStatus = 405
const ephemeralPort = 0

const publishedPlantRoute: FrozenRoute = {
  method: 'GET',
  path: '/api/v2/plant-knowledge/plants/{plantIdentityRef}',
  operationId: 'getPublishedPlant',
  security: 'public'
}

let server: Server | undefined

/** 在随机端口启动只挂载分发器的真实 Node HTTP 服务。 */
async function startDispatcher(bindings: readonly RouteBinding[]): Promise<string> {
  const dispatch = createRouteDispatcher(bindings)
  server = createServer((request, response) => {
    dispatch(request, response).catch(() => undefined)
  })
  await new Promise<void>(resolve => server?.listen(ephemeralPort, '127.0.0.1', resolve))
  const address = server.address() as AddressInfo
  return `http://127.0.0.1:${String(address.port)}`
}

/** 记录处理器收到的路径参数，并返回固定成功正文。 */
function recordingBinding(received: RoutePathParameters[]): RouteBinding {
  return {
    route: publishedPlantRoute,
    handler: async (_request, response, pathParameters) => {
      received.push(pathParameters)
      response.writeHead(okStatus, { 'content-type': 'application/json; charset=utf-8' })
      response.end(JSON.stringify({ data: { handled: true } }))
    }
  }
}

afterEach(async () => {
  await new Promise<void>(resolve => {
    if (!server) {
      resolve()
      return
    }
    server.close(() => resolve())
  })
  server = undefined
})

/**
 * Expected 来源：http-api/v1 §3 错误目录（NOT_FOUND=路由不存在 404、METHOD_NOT_ALLOWED=路由存在但方法
 * 不支持 405、VALIDATION_FAILED 400）与 route-registry.json 的冻结 method/path/security；
 * AGENTS.md §4「禁止重新制造万能路由」。
 * 层次：L1 / unit_fake。真实经过 node:http 与分发器；处理器为记录型替身，不覆盖请求链与数据库。
 */
describe('冻结路由分发器', () => {
  test('精确匹配冻结路径模板并把单段路径参数交给处理器', async () => {
    const received: RoutePathParameters[] = []
    const baseUrl = await startDispatcher([recordingBinding(received)])

    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/pid_monstera_001?x=1`)

    expect(response.status).toBe(okStatus)
    expect(await response.json()).toEqual({ data: { handled: true } })
    expect(received).toEqual([{ plantIdentityRef: 'pid_monstera_001' }])
  })

  test('未登记路径统一返回 404 NOT_FOUND，且不调用任何处理器', async () => {
    const received: RoutePathParameters[] = []
    const baseUrl = await startDispatcher([recordingBinding(received)])

    for (const unknownPath of [
      '/api/v2/plant-knowledge/plants',
      '/api/v2/plant-knowledge/plants/pid_a/extra',
      '/api/v2/user-plants/upl_001',
      '/'
    ]) {
      const response = await fetch(`${baseUrl}${unknownPath}`)
      expect(response.status).toBe(notFoundStatus)
      expect(await response.json()).toEqual({
        error: { type: 'NOT_FOUND', message: '请求路由不存在' }
      })
    }
    expect(received).toEqual([])
  })

  test('路径存在但方法未登记时返回 405 METHOD_NOT_ALLOWED', async () => {
    const received: RoutePathParameters[] = []
    const baseUrl = await startDispatcher([recordingBinding(received)])

    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/pid_monstera_001`, {
      method: 'POST',
      body: '{}'
    })

    expect(response.status).toBe(methodNotAllowedStatus)
    expect(await response.json()).toEqual({
      error: { type: 'METHOD_NOT_ALLOWED', message: '请求方法不受支持' }
    })
    expect(received).toEqual([])
  })

  test('路径参数编码非法时返回 400 VALIDATION_FAILED', async () => {
    const received: RoutePathParameters[] = []
    const baseUrl = await startDispatcher([recordingBinding(received)])

    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/%E0%A4%A`)

    expect(response.status).toBe(badRequestStatus)
    expect(await response.json()).toEqual({
      error: { type: 'VALIDATION_FAILED', message: '请求参数不合法' }
    })
    expect(received).toEqual([])
  })

  test('处理器抛出异常时只返回泛化 500，不泄露异常文本', async () => {
    const baseUrl = await startDispatcher([
      {
        route: publishedPlantRoute,
        handler: async () => {
          throw new Error('SELECT secret FROM users password=hunter2')
        }
      }
    ])

    const response = await fetch(`${baseUrl}/api/v2/plant-knowledge/plants/pid_monstera_001`)
    const text = await response.text()

    expect(response.status).toBe(Number('500'))
    expect(JSON.parse(text)).toEqual({
      error: { type: 'INTERNAL_ERROR', message: '服务暂时不可用' }
    })
    expect(text).not.toContain('hunter2')
  })

  test('同一 method + path 重复绑定或模板非法时在创建阶段失败关闭', () => {
    const noop: RouteBinding['handler'] = async () => undefined
    expect(() =>
      createRouteDispatcher([
        { route: publishedPlantRoute, handler: noop },
        { route: publishedPlantRoute, handler: noop }
      ])
    ).toThrow()
    expect(() =>
      createRouteDispatcher([
        { route: { ...publishedPlantRoute, path: 'api/v2/no-leading-slash' }, handler: noop }
      ])
    ).toThrow()
    expect(() =>
      createRouteDispatcher([
        { route: { ...publishedPlantRoute, path: '/api/v2/plants/{}' }, handler: noop }
      ])
    ).toThrow()
  })
})
