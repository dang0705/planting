import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import Ajv2020 from 'ajv/dist/2020.js'
import { describe, expect, test } from 'vitest'

import { findProjectRoot } from '../support/project-root.js'

/**
 * Expected 来源：ClickUp z8v0kmvhnb「视觉诊断 1/4：生成式诊断接口合同」票面与用户 2026-10-11 裁定——
 * 只限登录用户（游客不可用）；每次最多 3 张图；上传/登记图片 → 发起诊断（Idempotency-Key）→ 取结果 → 按历史回放；
 * 余额不足在模型调用前返回 AI_QUOTA_INSUFFICIENT；非植物、图片不可用、模型失败释放预占不扣点；
 * 点数 = ceil(costMicros/800)（care-points-and-ai-quota.md）；qwen3.7-flash ≤32K 档价格 0.2/0.8 元/百万 tokens。
 * 测试层次：unit_real_data（读取真实合同制品、路由登记、OpenAPI 与配置目录；不实现、不调用接口）。
 * 未覆盖：运行时实现、额度事务、图片压缩、真实模型调用。
 */
const root = findProjectRoot()
const contractDir = path.join(root, 'docs/backend-v2/contracts')
const schemaPath = path.join(contractDir, 'schemas/diagnosis-visual-api.v1.schema.json')
const resultSchemaPath = path.join(contractDir, 'schemas/diagnosis-result.v2.schema.json')

function compile(defName: string) {
  assert.ok(fs.existsSync(schemaPath), `缺少视觉诊断接口 Schema：${schemaPath}`)
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8')) as object
  const resultSchema = JSON.parse(fs.readFileSync(resultSchemaPath, 'utf8')) as object
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  ajv.addSchema(resultSchema)
  ajv.addSchema(schema)
  const validate = ajv.getSchema(
    `https://qinghuazhi.local/contracts/diagnosis-visual-api.v1.schema.json#/$defs/${defName}`
  )
  assert.ok(validate, `Schema 缺少定义 ${defName}`)
  return validate
}

const imageRef = (n: number) => `dvi_${'a'.repeat(20)}${n}`

describe('生成式视觉诊断接口合同 v1：请求', () => {
  test('发起诊断：1～3 张已登记图片，归属于用户植物或登录用户临时案例二选一', () => {
    const validate = compile('CreateVisualDiagnosisRequest')
    expect(
      validate({ subject: { userPlantRef: 'upl_abcdefgh12' }, imageRefs: [imageRef(1)] })
    ).toBe(true)
    expect(
      validate({
        subject: { ephemeralCaseRef: 'epc_abcdefgh12' },
        imageRefs: [imageRef(1), imageRef(2), imageRef(3)],
        userQuestionZh: '叶子发黄'
      })
    ).toBe(true)
  })

  test.each([
    ['没有图片', { subject: { userPlantRef: 'upl_abcdefgh12' }, imageRefs: [] }],
    [
      '超过 3 张',
      { subject: { userPlantRef: 'upl_abcdefgh12' }, imageRefs: [1, 2, 3, 4].map(imageRef) }
    ],
    [
      '重复图片',
      { subject: { userPlantRef: 'upl_abcdefgh12' }, imageRefs: [imageRef(1), imageRef(1)] }
    ],
    [
      '同时给出两种归属',
      {
        subject: { userPlantRef: 'upl_abcdefgh12', ephemeralCaseRef: 'epc_abcdefgh12' },
        imageRefs: [imageRef(1)]
      }
    ],
    [
      '客户端夹带模型或提示词',
      { subject: { userPlantRef: 'upl_abcdefgh12' }, imageRefs: [imageRef(1)], model: 'x' }
    ],
    [
      '用户描述过长',
      {
        subject: { userPlantRef: 'upl_abcdefgh12' },
        imageRefs: [imageRef(1)],
        userQuestionZh: '长'.repeat(201)
      }
    ]
  ])('拒绝非法发起请求：%s', (_name, body) => {
    expect(compile('CreateVisualDiagnosisRequest')(body)).toBe(false)
  })

  test('登记图片请求：1～3 个云存储文件，且不接受客户端声明的尺寸或像素', () => {
    const validate = compile('RegisterVisualDiagnosisImagesRequest')
    expect(validate({ files: [{ fileId: 'cloud://env.bucket/diagnosis/usr_x/a.jpg' }] })).toBe(true)
    expect(validate({ files: [] })).toBe(false)
    expect(validate({ files: [{ fileId: 'cloud://env.bucket/a.jpg', width: 4000 }] })).toBe(false)
  })
})

describe('生成式视觉诊断接口合同 v1：响应', () => {
  test('完成时返回 diagnosis-result/v2 结果与本次扣点；释放时扣点为 0', () => {
    const validate = compile('VisualDiagnosisSessionResponse')
    const processing = {
      visualDiagnosisRef: 'vds_abcdefgh12',
      status: 'processing',
      createdAt: '2026-10-11T01:00:00Z'
    }
    expect(validate(processing)).toBe(true)
    const released = {
      visualDiagnosisRef: 'vds_abcdefgh12',
      status: 'released_no_charge',
      createdAt: '2026-10-11T01:00:00Z',
      releaseReason: 'image_unusable',
      chargedPoints: 0
    }
    expect(validate(released)).toBe(true)
    expect(validate({ ...released, chargedPoints: 3 })).toBe(false)
  })

  test('响应不得暴露内部字段', () => {
    const validate = compile('VisualDiagnosisSessionResponse')
    for (const field of [
      'userId',
      'promptText',
      'rawModelOutput',
      'reservationRef',
      'costMicros',
      'modelCode'
    ]) {
      expect(
        validate({
          visualDiagnosisRef: 'vds_abcdefgh12',
          status: 'processing',
          createdAt: '2026-10-11T01:00:00Z',
          [field]: 'x'
        })
      ).toBe(false)
    }
  })
})

describe('生成式视觉诊断接口合同 v1：路由、注册表与成本策略', () => {
  const routes = (
    JSON.parse(
      fs.readFileSync(path.join(root, 'docs/backend-v2/api/route-registry.json'), 'utf8')
    ) as {
      routes: {
        method: string
        path: string
        operationId: string
        security: string
        idempotency: string
        errors: string[]
      }[]
    }
  ).routes

  const expected: Record<string, { method: string; path: string; idempotency: string }> = {
    getVisualDiagnosisUploadTargets: {
      method: 'GET',
      path: '/api/v2/diagnosis/visual/upload-targets',
      idempotency: 'not_applicable'
    },
    registerVisualDiagnosisImages: {
      method: 'POST',
      path: '/api/v2/diagnosis/visual/images',
      idempotency: 'required_header'
    },
    createVisualDiagnosis: {
      method: 'POST',
      path: '/api/v2/diagnosis/visual/sessions',
      idempotency: 'required_header'
    },
    getVisualDiagnosis: {
      method: 'GET',
      path: '/api/v2/diagnosis/visual/sessions/{visualDiagnosisRef}',
      idempotency: 'not_applicable'
    },
    listVisualDiagnoses: {
      method: 'GET',
      path: '/api/v2/diagnosis/visual/sessions',
      idempotency: 'not_applicable'
    }
  }

  test.each(Object.entries(expected))('路由 %s 只限登录用户', (operationId, shape) => {
    const route = routes.find(item => item.operationId === operationId)
    expect(route).toMatchObject({ ...shape, security: 'authenticated' })
    expect(route?.errors).toContain('PRINCIPAL_INVALID')
    expect(route?.errors).toContain('CAPABILITY_DENIED')
  })

  test('发起诊断在额度不足时返回 AI_QUOTA_INSUFFICIENT，并有幂等冲突错误', () => {
    const route = routes.find(item => item.operationId === 'createVisualDiagnosis')
    expect(route?.errors).toEqual(
      expect.arrayContaining([
        'AI_QUOTA_INSUFFICIENT',
        'IDEMPOTENCY_CONFLICT',
        'USER_PLANT_NOT_FOUND'
      ])
    )
  })

  test('OpenAPI 已登记全部视觉诊断路由', () => {
    const openapi = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/backend-v2/api/openapi.p1.json'), 'utf8')
    ) as {
      paths: Record<string, Record<string, { operationId?: string }>>
    }
    for (const [operationId, shape] of Object.entries(expected)) {
      expect(openapi.paths[shape.path]?.[shape.method.toLowerCase()]?.operationId).toBe(operationId)
    }
  })

  test('合同正文与 Schema 登记在合同注册表且哈希一致', () => {
    const contract = fs.readFileSync(path.join(contractDir, 'diagnosis-visual-api.md'), 'utf8')
    expect(contract).toContain('合同版本：`diagnosis-visual-api/v1`')
    expect(contract).toContain('游客不能使用')
    const registry = JSON.parse(
      fs.readFileSync(path.join(contractDir, 'contract-registry.json'), 'utf8')
    ) as {
      contracts: { id: string; file: string; sha256: string }[]
    }
    for (const id of ['diagnosis-visual-api', 'diagnosis-visual-api-schema']) {
      const entry = registry.contracts.find(item => item.id === id)
      assert.ok(entry, `注册表缺少 ${id}`)
      expect(entry.sha256).toBe(
        createHash('sha256')
          .update(fs.readFileSync(path.join(contractDir, entry.file)))
          .digest('hex')
      )
    }
  })

  test('USER_DIAGNOSIS_VISUAL 成本策略建议值：上限与点数按价目快照与 ceil(costMicros/800) 计算', () => {
    const catalog = JSON.parse(
      fs.readFileSync(
        path.join(root, 'docs/backend-v2/architecture/configuration-variable-catalog.json'),
        'utf8'
      )
    ) as { variables: { id: string; proposedValue?: Record<string, unknown> }[] }
    const item = catalog.variables.find(
      variable => variable.id === 'subscription.ai_action.diagnosis_visual_multi'
    )
    const policy = item?.proposedValue as {
      maxInputTokens: number
      maxOutputTokens: number
      maxImages: number
      maxModelLoops: number
      maxCostMicros: number
      estimatedPoints: number
      inputMicrosPerToken: number
      outputMicrosPerToken: number
      priceSnapshotRef: string
    }
    expect(policy).toMatchObject({
      maxInputTokens: 28800,
      maxOutputTokens: 4000,
      maxImages: 3,
      maxModelLoops: 2
    })
    expect(policy.maxCostMicros).toBe(
      policy.maxModelLoops *
        (policy.maxInputTokens * policy.inputMicrosPerToken +
          policy.maxOutputTokens * policy.outputMicrosPerToken)
    )
    expect(policy.maxCostMicros).toBe(17920)
    expect(policy.estimatedPoints).toBe(Math.ceil(policy.maxCostMicros / 800))
    expect(policy.estimatedPoints).toBe(23)
    expect(policy.priceSnapshotRef).toBe(
      'docs/backend-v2/diagnosis-eval/qwen3.7-flash-price-snapshot-2026-10-10.json'
    )
  })
})
