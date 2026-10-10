import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, test } from 'vitest'

import {
  createVisualRouteBindings,
  type VisualRouteDependencies
} from '../../../src/diagnosis/visual/http/visual-routes.js'
import { createRouteDispatcher } from '../../../src/foundation/http/route-dispatcher.js'
import { PublicRequestError } from '../../../src/foundation/http/request-chain.js'
import { closeTestServer, listenTestServer } from '../../e2e/support/http-test-server.js'
import { ownerPrincipal } from './support/visual-fakes.js'

/**
 * Expected 来源：diagnosis-visual-api.md §1（只限登录用户：无凭证 401、游客 403）、§2（五个接口、方法与路径、
 * POST 需 Idempotency-Key、发起诊断返回 202）、§2.2（客户端不能提交模型/提示词/上下文/价格字段，额外字段 400；图片最多 3 张）
 * 与 schemas/diagnosis-visual-api.v1.schema.json（请求与响应结构）。
 * 测试层次：unit_fake（真实 node:http 与路由分发，用例为内存假实现）。
 */
const accepted = {
  status: 202,
  body: { data: { visualDiagnosisRef: 'vds_fixture00000001', status: 'processing', createdAt: '2026-10-11T08:00:00.000Z' } }
}
let server: Server | undefined
afterEach(async () => closeTestServer(server))

async function start(overrides: Partial<VisualRouteDependencies> = {}) {
  const calls: Record<string, unknown[]> = { create: [], register: [], get: [], list: [], targets: [] }
  const deps: VisualRouteDependencies = {
    resolvePrincipal: async command => {
      if (command.bearerToken === 'guest.token-000000001') {
        return { principalType: 'guest', guestSessionRef: 'gss_x', authProvider: 'server_issued_guest_token' } as never
      }
      return ownerPrincipal
    },
    now: () => Date.UTC(2026, 9, 11),
    writeAudit: () => undefined,
    getUploadTargets: async input => {
      calls.targets!.push(input)
      return { targets: Array.from({ length: input.count }, () => ({ cloudPath: `diagnosis/${ownerPrincipal.user_id}/visual/202610/${'c'.repeat(32)}`, allowedMimeTypes: ['image/jpeg'], maxImageBytes: 1000 })) }
    },
    registerImages: async input => {
      calls.register!.push(input)
      return { status: 200, body: { data: { images: [{ imageRef: 'dvi_fixture00000001', status: 'registered' }] } } }
    },
    createDiagnosis: async input => {
      calls.create!.push(input)
      return accepted
    },
    getDiagnosis: async input => {
      calls.get!.push(input)
      return accepted.body.data as never
    },
    listDiagnoses: async input => {
      calls.list!.push(input)
      return { items: [] }
    },
    ...overrides
  }
  const dispatch = createRouteDispatcher(createVisualRouteBindings(deps))
  server = createServer((request, response) => {
    dispatch(request, response).catch(() => undefined)
  })
  const base = await listenTestServer(server)
  const call = async (method: string, path: string, options: { bearer?: string | null; body?: unknown; key?: string } = {}) => {
    const headers: Record<string, string> = {}
    if (options.bearer !== null) {
      headers.authorization = `Bearer ${options.bearer ?? 'user-token-00000001'}`
    }
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json'
    }
    if (options.key !== undefined) {
      headers['idempotency-key'] = options.key
    }
    const response = await fetch(`${base}${path}`, {
      method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
    })
    return { status: response.status, json: (await response.json()) as Record<string, any> }
  }
  return { call, calls }
}

const body = { subject: { userPlantRef: 'upl_visual_active_0001' }, imageRefs: ['dvi_owned_00000001'], userQuestionZh: '叶子发黄' }

describe('POST /api/v2/diagnosis/visual/sessions', () => {
  test('登录用户发起诊断返回 202 与处理中状态', async () => {
    const { call, calls } = await start()
    const result = await call('POST', '/api/v2/diagnosis/visual/sessions', { body, key: 'idem-key-0001' })
    expect(result).toEqual({ status: 202, json: { data: accepted.body.data } })
    expect(calls.create![0]).toMatchObject({ principal: ownerPrincipal, request: body, idempotencyKey: 'idem-key-0001' })
  })

  test('无凭证 401；游客 403；缺幂等键、额外字段、超过 3 张图均 400', async () => {
    const { call, calls } = await start()
    expect((await call('POST', '/api/v2/diagnosis/visual/sessions', { body, key: 'idem-key-0001', bearer: null })).status).toBe(401)
    expect(await call('POST', '/api/v2/diagnosis/visual/sessions', { body, key: 'idem-key-0001', bearer: 'guest.token-000000001' }))
      .toMatchObject({ status: 403, json: { error: { type: 'CAPABILITY_DENIED' } } })
    expect((await call('POST', '/api/v2/diagnosis/visual/sessions', { body })).status).toBe(400)
    expect((await call('POST', '/api/v2/diagnosis/visual/sessions', { body: { ...body, modelCode: 'qwen' }, key: 'idem-key-0001' })).status).toBe(400)
    expect((await call('POST', '/api/v2/diagnosis/visual/sessions', {
      body: { ...body, imageRefs: ['dvi_a0000001', 'dvi_b0000001', 'dvi_c0000001', 'dvi_d0000001'] },
      key: 'idem-key-0001'
    })).status).toBe(400)
    expect(calls.create).toEqual([])
  })

  test('用例返回的公开错误快照原样透传（例如额度不足 409）', async () => {
    const { call } = await start({
      createDiagnosis: async () => ({ status: 409, body: { error: { type: 'AI_QUOTA_INSUFFICIENT', message: 'AI 点数不足' } } })
    })
    expect(await call('POST', '/api/v2/diagnosis/visual/sessions', { body, key: 'idem-key-0001' }))
      .toEqual({ status: 409, json: { error: { type: 'AI_QUOTA_INSUFFICIENT', message: 'AI 点数不足' } } })
  })
})

describe('其余视觉诊断接口', () => {
  test('GET 上传路径：count 1～3，越界 400', async () => {
    const { call } = await start()
    const ok = await call('GET', '/api/v2/diagnosis/visual/upload-targets?count=2')
    expect(ok.status).toBe(200)
    expect(ok.json.data.targets).toHaveLength(2)
    expect((await call('GET', '/api/v2/diagnosis/visual/upload-targets?count=4')).status).toBe(400)
    expect((await call('GET', '/api/v2/diagnosis/visual/upload-targets')).status).toBe(400)
  })

  test('POST 登记图片：需幂等键，返回 registered', async () => {
    const { call } = await start()
    const files = { files: [{ fileId: `cloud://env.bucket/diagnosis/${ownerPrincipal.user_id}/visual/202610/${'a'.repeat(32)}.jpg` }] }
    expect(await call('POST', '/api/v2/diagnosis/visual/images', { body: files, key: 'idem-key-0002' }))
      .toEqual({ status: 200, json: { data: { images: [{ imageRef: 'dvi_fixture00000001', status: 'registered' }] } } })
    expect((await call('POST', '/api/v2/diagnosis/visual/images', { body: files })).status).toBe(400)
  })

  test('GET 单个诊断与历史列表；引用格式不合法 404；用例的公开错误透传', async () => {
    const { call, calls } = await start()
    expect(await call('GET', '/api/v2/diagnosis/visual/sessions/vds_fixture00000001')).toEqual({ status: 200, json: { data: accepted.body.data } })
    expect((await call('GET', '/api/v2/diagnosis/visual/sessions/not-a-ref')).status).toBe(404)
    expect(await call('GET', '/api/v2/diagnosis/visual/sessions?userPlantRef=upl_visual_active_0001')).toEqual({ status: 200, json: { data: { items: [] } } })
    expect(calls.list![0]).toMatchObject({ userPlantRef: 'upl_visual_active_0001', cursor: null })
    const { call: failing } = await start({ getDiagnosis: async () => { throw new PublicRequestError(404, 'NOT_FOUND', '诊断不存在') } })
    expect((await failing('GET', '/api/v2/diagnosis/visual/sessions/vds_fixture00000002')).status).toBe(404)
  })

  test('响应不合合同时失败关闭（500），不把非法结构返回给前端', async () => {
    const { call } = await start({ getDiagnosis: async () => ({ visualDiagnosisRef: 'vds_fixture00000001', status: 'processing', createdAt: 'x', userId: 'usr_leak' }) as never })
    const result = await call('GET', '/api/v2/diagnosis/visual/sessions/vds_fixture00000001')
    expect(result.status).toBe(500)
    expect(JSON.stringify(result.json)).not.toContain('usr_leak')
  })
})
