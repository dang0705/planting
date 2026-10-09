import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const apiDirectory = path.dirname(fileURLToPath(import.meta.url))
const registryPath = path.join(apiDirectory, 'route-registry.json')
const openapiPath = path.join(apiDirectory, 'openapi.p1.json')
const manifestPath = path.join(apiDirectory, 'manifest.json')
const registryText = fs.readFileSync(registryPath, 'utf8')
const registry = JSON.parse(registryText)
// 仅在登记结果读取时加载该合同，局部路由生成不依赖无关领域制品。
const diagnosisResultSchema = registry.routes.some(route => route.responseContract === 'DiagnosisResultResponse')
  ? JSON.parse(fs.readFileSync(path.join(apiDirectory, '../contracts/schemas/diagnosis-result.v1.schema.json'), 'utf8'))
  : null
const printableAsciiPattern = '^[\\x20-\\x7E]+$'

/** 仅为已冻结字段级请求合同提供组件引用；其他合同继续使用严格空对象骨架。 */
const requestSchemaRefByContract = {
  CreateDiagnosisSessionRequest: '#/components/schemas/CreateDiagnosisSessionRequest',
  DiagnosisAnswerRequest: '#/components/schemas/DiagnosisAnswerRequest',
  CreateUserPlantRequest: '#/components/schemas/CreateUserPlantRequest',
  CreateIdentitySessionRequest: '#/components/schemas/CreateIdentitySessionRequest',
  CreateGuestSessionRequest: '#/components/schemas/CreateGuestSessionRequest',
  BindAuthenticatedEphemeralCaseRequest: '#/components/schemas/BindAuthenticatedEphemeralCaseRequest',
  /** 临时植物案例创建：严格空对象（temporary-case/v1）。 */
  CreateTemporaryCaseRequest: '#/components/schemas/CreateTemporaryCaseRequest',
  /** 浇水建议（watering-advice/v1）。 */
  WateringAdviceRequest: '#/components/schemas/WateringAdviceRequest',
  /** 归档/恢复仅允许调用方提交最后读到的植物版本。 */
  UserPlantVersionRequest: '#/components/schemas/UserPlantVersionRequest',
}

const successSchemaRefByContract = {
  DiagnosisResultResponse: '#/components/schemas/DiagnosisResultResponse',
  CreateUserPlantResponse: '#/components/schemas/CreateUserPlantSuccess',
  IdentitySessionResponse: '#/components/schemas/CreateIdentitySessionSuccess',
  GuestSessionResponse: '#/components/schemas/CreateGuestSessionSuccess',
  BindAuthenticatedEphemeralCaseResponse: '#/components/schemas/BindAuthenticatedEphemeralCaseResponse',
  TemporaryCaseResponse: '#/components/schemas/TemporaryCaseSuccess',
  CareCapabilityResponse: '#/components/schemas/CareCapabilitySuccess',
}

const parametersByPath = (routePath) => [...routePath.matchAll(/\{([^}]+)\}/gu)].map((match) => ({
  name: match[1],
  in: 'path',
  required: true,
  schema: match[1] === 'ephemeralCaseRef'
    ? { $ref: '#/components/schemas/AuthenticatedEphemeralCaseRef' }
    : { type: 'string', minLength: 8, maxLength: 100 },
}))

const paths = {}
for (const route of registry.routes) {
  const method = route.method.toLowerCase()
  const isWrite = ['post', 'patch', 'delete', 'put'].includes(method)
  const isAnswer = route.operationId === 'answerDiagnosisQuestion'
  const isCreate = route.operationId === 'createDiagnosisSession'
  const successSchemaRef = isCreate ? '#/components/schemas/DiagnosisSessionCreationResponse' : isAnswer ? '#/components/schemas/DiagnosisSessionAnswerResponse' : successSchemaRefByContract[route.responseContract]
  const operation = {
    operationId: route.operationId,
    summary: `${route.owner} 域：${route.operationId}`,
    tags: [route.owner],
    'x-owner': route.owner,
    'x-phase': route.phase,
    'x-security': route.security,
    ...(route.requiredScope ? { 'x-required-scope': route.requiredScope } : {}),
    'x-request-contract': route.requestContract,
    'x-response-contract': route.responseContract,
    ...(isCreate ? { 'x-response-variant': 'fixed_question_package' } : {}),
    ...(isAnswer ? { 'x-response-variant': 'answers_recorded' } : {}),
    'x-idempotency': route.idempotency,
    'x-errors': route.errors,
    parameters: parametersByPath(route.path),
    responses: {
      '200': {
        description: isCreate ? '创建已锁定的V1黄叶或萎蔫题包；虫害由独立动态选题承接' : isAnswer ? '整包答案已记录；首次与重放相同，不代表诊断完成' : '成功；具体 data 结构由 x-response-contract 指向的合同冻结',
        content: {
          'application/json': {
            schema: { $ref: successSchemaRef ?? '#/components/schemas/SuccessEnvelope' },
          },
        },
      },
      default: {
        description: '稳定公开错误',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
      },
    },
  }
  if (isWrite && route.requestContract !== 'EmptyRequest' && route.requestContract !== 'RawPaymentCallback') {
    const requestSchemaRef = requestSchemaRefByContract[route.requestContract]
    operation.requestBody = {
      required: true,
      content: {
        'application/json': {
          schema: requestSchemaRef
            ? { $ref: requestSchemaRef }
            : { type: 'object', additionalProperties: false },
        },
      },
    }
  }
  if (route.idempotency.startsWith('required_header')) {
    operation.parameters.push({ $ref: '#/components/parameters/IdempotencyKey' })
  }
  if (route.security === 'authenticated') operation.security = [{ userBearer: [] }]
  if (route.security === 'guest_or_authenticated') operation.security = [{ guestBearer: [] }, { userBearer: [] }]
  if (route.security === 'service') {
    operation.security = [{ serviceSignature: [] }]
    for (const parameterName of [
      'ServiceKeyId',
      'ServiceTimestamp',
      'ServiceNonce',
      'ServiceBodySha256',
      'ServiceScope',
      'ServiceSignature',
    ]) {
      operation.parameters.push({ $ref: `#/components/parameters/${parameterName}` })
    }
  }
  paths[route.path] ??= {}
  paths[route.path][method] = operation
}

const errorTypes = [
  'EPHEMERAL_CASE_NOT_BINDABLE',
  'VALIDATION_FAILED', 'PRINCIPAL_INVALID', 'CAPABILITY_DENIED',
  'IDENTITY_BINDING_CONFLICT', 'IDENTITY_LAST_BINDING_REQUIRED', 'NOT_FOUND',
  'USER_PLANT_NOT_FOUND', 'METHOD_NOT_ALLOWED', 'GUEST_SESSION_EXPIRED',
  'PAYLOAD_TOO_LARGE', 'UNSUPPORTED_MEDIA_TYPE', 'IDEMPOTENCY_CONFLICT',
  'USER_PLANT_VERSION_CONFLICT', 'CAPABILITY_SNAPSHOT_EXPIRED',
  'GUEST_SESSION_NOT_CLAIMABLE', 'AI_QUOTA_INSUFFICIENT', 'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE', 'RATE_LIMITED', 'TEMPORARY_CASE_LIMIT_REACHED',
]

const openapi = {
  openapi: '3.1.0',
  info: {
    title: '青花植后端 v2 P1 API 骨架',
    version: 'p1',
    description: '仅冻结具体路由、owner、安全级别和合同引用；完整字段与示例在 P6 发布。',
  },
  servers: [{ url: '/', description: 'CloudBase HTTP Gateway 根相对路径' }],
  paths,
  components: {
    securitySchemes: {
      guestBearer: { type: 'http', scheme: 'bearer', bearerFormat: 'CloudBase anonymous token' },
      userBearer: { type: 'http', scheme: 'bearer', bearerFormat: '青花植自签不透明用户会话令牌' },
      serviceSignature: { type: 'apiKey', in: 'header', name: 'X-QHZ-Signature' },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key', in: 'header', required: true,
        schema: { type: 'string', minLength: 8, maxLength: 128, pattern: printableAsciiPattern },
        description: '同一主体、方法、规范化路径和业务动作范围内的幂等键。',
      },
      ServiceKeyId: serviceHeaderParameter('X-QHZ-Key-Id', '当前允许的内部服务签名密钥版本。'),
      ServiceTimestamp: serviceHeaderParameter('X-QHZ-Timestamp', '签名使用的十进制 UTC 秒时间戳。'),
      ServiceNonce: serviceHeaderParameter('X-QHZ-Nonce', '同一内部服务在有效窗口内不可重复使用的随机值。'),
      ServiceBodySha256: serviceHeaderParameter('X-QHZ-Body-Sha256', '原始请求正文的 SHA-256 十六进制摘要。'),
      ServiceScope: serviceHeaderParameter('X-QHZ-Scope', '必须与路由登记的唯一 requiredScope 完全一致。'),
      ServiceSignature: serviceHeaderParameter('X-QHZ-Signature', '规范化签名明文的 HMAC-SHA-256 base64url 结果。'),
    },
    schemas: {
      // 已登录临时案例显式选择已有本人植物或新建植物；公开投影不包含案例状态或命令引用。
      AuthenticatedEphemeralCaseRef: {
        type: 'string', minLength: 12, maxLength: 64, pattern: '^epc_[A-Za-z0-9_-]{8,60}$',
      },
      BoundExistingUserPlantRef: {
        type: 'string', minLength: 12, maxLength: 64, pattern: '^upl_[A-Za-z0-9_-]{8,60}$',
      },
      BindAuthenticatedEphemeralCaseRequest: {
        type: 'object', additionalProperties: false, required: ['target'],
        properties: {
          target: {
            oneOf: [
              {
                type: 'object', additionalProperties: false, required: ['type', 'user_plant_id'],
                properties: {
                  type: { const: 'existing_user_plant' },
                  user_plant_id: { $ref: '#/components/schemas/BoundExistingUserPlantRef' },
                },
              },
              {
                type: 'object', additionalProperties: false, required: ['type'],
                properties: { type: { const: 'new_user_plant' } },
              },
            ],
          },
        },
      },
      BindAuthenticatedEphemeralCaseResponse: {
        type: 'object', additionalProperties: false, required: ['data'],
        properties: {
          data: {
            type: 'object', additionalProperties: false, required: ['user_plant_id'],
            properties: { user_plant_id: { $ref: '#/components/schemas/BoundExistingUserPlantRef' } },
          },
        },
      },
      ...(diagnosisResultSchema ? {
        DiagnosisResult: diagnosisResultSchema,
        DiagnosisResultResponse: {type:'object',additionalProperties:false,required:['data'],properties:{data:{$ref:'#/components/schemas/DiagnosisResult'}}},
      } : {}),
      CreateDiagnosisSessionRequest: {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "userPlantRef",
    "mode"
  ],
  "properties": {
    "userPlantRef": {
      "type": "string",
      "maxLength": 64,
      "pattern": "^upl_[A-Za-z0-9_-]{8,}$"
    },
    "mode": {
      "enum": [
        "yellow_leaf",
        "wilting_droop"
      ]
    }
  }
},
      DiagnosisSessionCreationResponse: {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "diagnosisSessionRef",
        "mode",
        "questionPackage"
      ],
      "properties": {
        "diagnosisSessionRef": {
          "type": "string",
          "minLength": 8,
          "maxLength": 100
        },
        "mode": {
          "enum": [
            "yellow_leaf",
            "wilting_droop"
          ]
        },
        "questionPackage": {
          "type": "object",
          "additionalProperties": false,
          "required": [
            "questionCount",
            "questions"
          ],
          "properties": {
            "questionCount": {
              "type": "integer",
              "minimum": 1
            },
            "questions": {
              "type": "array",
              "items": {
                "type": "object",
                "additionalProperties": false,
                "required": [
                  "questionKey",
                  "text",
                  "inputKind",
                  "options"
                ],
                "properties": {
                  "questionKey": {
                    "type": "string",
                    "minLength": 1
                  },
                  "text": {
                    "type": "string",
                    "minLength": 1
                  },
                  "inputKind": {
                    "enum": [
                      "choice",
                      "care_behavior_timeline",
                      "air_environment"
                    ]
                  },
                  "helpText": {
                    "type": "string",
                    "minLength": 1
                  },
                  "whyThisQuestion": {
                    "type": "string",
                    "minLength": 1
                  },
                  "options": {
                    "type": "array",
                    "items": {
                      "type": "object",
                      "additionalProperties": false,
                      "required": [
                        "optionKey",
                        "text"
                      ],
                      "properties": {
                        "optionKey": {
                          "type": "string",
                          "minLength": 1
                        },
                        "text": {
                          "type": "string",
                          "minLength": 1
                        },
                        "description": {
                          "type": "string",
                          "minLength": 1
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
},
      DiagnosisAnswerRequest: {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "userPlantRef",
    "requestMode",
    "answers"
  ],
  "properties": {
    "userPlantRef": {
      "type": "string",
      "maxLength": 64,
      "pattern": "^upl_[A-Za-z0-9_-]{8,}$"
    },
    "requestMode": {
      "type": "string",
      "enum": [
        "answer_submit"
      ]
    },
    "answers": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": [
          "questionKey",
          "optionKey"
        ],
        "properties": {
          "questionKey": {
            "type": "string",
            "minLength": 1
          },
          "optionKey": {
            "type": "string",
            "minLength": 1
          }
        }
      }
    },
    "airEnvironmentByQuestionId": {
      "type": "object",
      "description": "复合证据继续按服务端题包与对应领域合同校验"
    },
    "airEnvironmentSnapshotsByQuestionId": {
      "type": "object",
      "description": "复合证据继续按服务端题包与对应领域合同校验"
    },
    "careBehaviorTimeline": {
      "type": "object",
      "description": "复合证据继续按服务端题包与对应领域合同校验"
    },
    "care_behavior_timeline": {
      "type": "object",
      "description": "复合证据继续按服务端题包与对应领域合同校验"
    }
  },
  "description": "长期用户植物答案提交；不允许客户端题包或用户身份",
  "x-source-contract": "cloudfunctions-v2/models/diagnosis/answer-http-contract.md"
},
      DiagnosisSessionAnswerResponse: {
  "type": "object",
  "additionalProperties": false,
  "required": [
    "data"
  ],
  "properties": {
    "data": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "diagnosisSessionRef",
        "answersRecorded"
      ],
      "properties": {
        "diagnosisSessionRef": {
          "type": "string",
          "minLength": 8,
          "maxLength": 100
        },
        "answersRecorded": {
          "type": "boolean",
          "enum": [
            true
          ]
        }
      }
    }
  },
  "description": "DiagnosisSessionResponse在答案提交操作中的确认分支；不表示诊断结果已生成",
  "x-source-contract": "cloudfunctions-v2/models/diagnosis/answer-http-contract.md"
},
      SuccessEnvelope: {
        type: 'object', additionalProperties: false, required: ['data'],
        properties: { data: {} },
      },
      CreateUserPlantRequest: {
        type: 'object',
        additionalProperties: false,
        maxProperties: 0,
        properties: {},
      },
      CreateIdentitySessionRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['platform', 'code'],
        properties: {
          platform: {
            type: 'string',
            enum: ['wechat', 'douyin', 'xiaohongshu'],
            description: '登录平台；只决定调用哪个受控 Provider，不能替代平台验真（用户 2026-10-09 冻结）。',
          },
          code: {
            type: 'string',
            minLength: 1,
            description: '平台登录接口返回的一次性短时凭证；不得提交平台主体或应用范围。',
          },
          guestToken: {
            type: 'string',
            minLength: 1,
            description: '抖音/小红书游客先前签发的游客令牌，仅标记认领资格；微信携带视为非法。',
          },
        },
        if: { properties: { platform: { const: 'wechat' } }, required: ['platform'] },
        then: { not: { required: ['guestToken'] } },
      },
      CreateGuestSessionRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['platform'],
        properties: {
          platform: {
            type: 'string',
            enum: ['douyin', 'xiaohongshu'],
            description: '申请平台；微信以 wx.login 静默登录，不走游客（guest-token/v1）。',
          },
          anonymousCode: {
            type: 'string',
            minLength: 1,
            maxLength: 512,
            description: '仅抖音：tt.login 返回的 anonymousCode，服务端只存其摘要作防刷键。',
          },
        },
        if: { properties: { platform: { const: 'xiaohongshu' } }, required: ['platform'] },
        then: { not: { required: ['anonymousCode'] } },
      },
      CreateGuestSessionData: {
        type: 'object',
        additionalProperties: false,
        required: ['guestToken', 'guestSessionRef', 'expiresAt'],
        properties: {
          guestToken: {
            type: 'string',
            pattern: '^[A-Za-z0-9_-]{43}$',
            description: '只在本响应出现一次的游客令牌；后续以 Bearer guest.<token> 携带。',
          },
          guestSessionRef: { type: 'string', pattern: '^gst_[A-Za-z0-9_-]{8,}$' },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateGuestSessionSuccess: {
        type: 'object',
        additionalProperties: false,
        required: ['data'],
        properties: { data: { $ref: '#/components/schemas/CreateGuestSessionData' } },
      },
      CreateIdentitySessionData: {
        type: 'object',
        additionalProperties: false,
        required: ['accessToken', 'expiresAt'],
        properties: {
          accessToken: {
            type: 'string',
            minLength: 1,
            description: '仅首次登录成功响应披露的青花植自签高熵会话 Bearer。',
          },
          expiresAt: { type: 'string', format: 'date-time' },
        },
      },
      CreateIdentitySessionSuccess: {
        type: 'object',
        additionalProperties: false,
        required: ['data'],
        properties: { data: { $ref: '#/components/schemas/CreateIdentitySessionData' } },
      },
      UserPlantVersionRequest: {
        type: 'object',
        additionalProperties: false,
        required: ['expectedVersion'],
        properties: {
          expectedVersion: {
            type: 'integer',
            minimum: 1,
            maximum: Number.MAX_SAFE_INTEGER,
            description: '调用方最后读到的用户植物版本，必须是正安全整数。',
          },
        },
      },
      CreateUserPlantResponse: {
        type: 'object',
        additionalProperties: false,
        required: ['user_plant_id', 'lifecycle', 'identityStatus', 'version', 'createdAt', 'updatedAt'],
        properties: {
          user_plant_id: { type: 'string', pattern: '^upl_[A-Za-z0-9_-]{8,}$' },
          lifecycle: { type: 'string', const: 'active' },
          identityStatus: { type: 'string', const: 'unidentified' },
          version: { type: 'integer', const: 1 },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
      // temporary-case/v1：浇水、诊断、识别共用的临时案例；归属只来自已验证主体。
      CreateTemporaryCaseRequest: {
        type: 'object', additionalProperties: false, maxProperties: 0, properties: {},
      },
      TemporaryCaseData: {
        oneOf: [
          {
            type: 'object', additionalProperties: false, required: ['caseRef', 'ownerKind', 'expiresAt'],
            properties: {
              caseRef: { type: 'string', pattern: '^gpc_[A-Za-z0-9_-]{8,60}$', description: '游客临时案例公开引用。' },
              ownerKind: { const: 'guest' },
              expiresAt: { type: 'string', format: 'date-time', description: '等于所属游客会话 expiresAt，带 Z 的 UTC。' },
            },
          },
          {
            type: 'object', additionalProperties: false, required: ['caseRef', 'ownerKind', 'expiresAt'],
            properties: {
              caseRef: { type: 'string', pattern: '^epc_[A-Za-z0-9_-]{8,60}$', description: '登录用户临时案例公开引用。' },
              ownerKind: { const: 'authenticated' },
              expiresAt: { type: 'string', format: 'date-time', description: '创建时刻 + 已发布案例有效期，带 Z 的 UTC。' },
            },
          },
        ],
      },
      // watering-advice/v1：本阶段 target 只支持 temporary_case（user_plant 返回 VALIDATION_FAILED）。
      WateringAdviceRequest: {
        type: 'object', additionalProperties: false, required: ['target', 'location', 'window'],
        properties: {
          target: { oneOf: [
            { type: 'object', additionalProperties: false, required: ['kind', 'caseRef'], properties: { kind: { const: 'temporary_case' }, caseRef: { type: 'string', minLength: 1, maxLength: 512 } } },
            { type: 'object', additionalProperties: false, required: ['kind', 'userPlantRef'], properties: { kind: { const: 'user_plant' }, userPlantRef: { type: 'string', minLength: 1, maxLength: 512 } } },
          ] },
          catalogTaxonRef: { type: 'string', minLength: 1, maxLength: 512, description: '临时案例必填；读取 Tropicals 浇水基线。' },
          location: { type: 'object', additionalProperties: false, required: ['latitude', 'longitude'],
            properties: { latitude: { type: 'number', minimum: -90, maximum: 90 }, longitude: { type: 'number', minimum: -180, maximum: 180 } },
            description: '服务端保存前四舍五入到 0.01°。' },
          window: { type: 'object', additionalProperties: false, required: ['orientation', 'glassLayers'], properties: {
            orientation: { enum: ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] },
            azimuthDeg: { type: 'number', minimum: 0, exclusiveMaximum: 360 },
            glassLayers: { enum: ['single', 'double', 'none', null] },
          } },
          lightReading: { type: ['object', 'null'], additionalProperties: false, required: ['lux', 'measuredAt', 'source'],
            properties: { lux: { type: 'number', minimum: 0 }, measuredAt: { type: 'string', format: 'date-time' }, source: { enum: ['meter', 'camera_estimate'] } } },
          soil: { type: ['object', 'null'], additionalProperties: false, required: ['state', 'scope', 'observedAt'],
            properties: { state: { enum: ['wet', 'moist', 'dry', 'uncertain'] }, scope: { enum: ['surface', 'root_zone'] }, observedAt: { type: 'string', format: 'date-time' } } },
          lastWatering: { type: ['object', 'null'], additionalProperties: false, required: ['wateredAt'], properties: { wateredAt: { type: 'string', format: 'date-time' } } },
          pot: { type: ['object', 'null'], additionalProperties: false, required: ['isInnerPot', 'innerTopDiameterCm', 'innerBottomDiameterCm', 'innerHeightCm', 'hasDrainageHole'],
            properties: { isInnerPot: { type: ['boolean', 'null'] }, innerTopDiameterCm: { type: ['number', 'null'] }, innerBottomDiameterCm: { type: ['number', 'null'] }, innerHeightCm: { type: ['number', 'null'] }, hasDrainageHole: { type: ['boolean', 'null'] } } },
          substrateMaterials: { type: 'array', items: { enum: ['general', 'coco', 'ceramsite', 'peat', 'perlite', 'bark', 'sphagnum', 'gritty', 'coarse_sand'] } },
          indoorClimate: { type: ['object', 'null'], additionalProperties: false, required: ['temperatureC', 'relativeHumidityPercent', 'measuredAt'],
            properties: { temperatureC: { type: 'number' }, relativeHumidityPercent: { type: 'number', minimum: 0, maximum: 100 }, measuredAt: { type: 'string', format: 'date-time' } } },
        },
      },
      CareCapabilitySuccess: {
        type: 'object', additionalProperties: false, required: ['data'],
        properties: { data: { type: 'object', additionalProperties: false, required: ['resultRef', 'result'], properties: {
          resultRef: { type: 'string', pattern: '^cres_[A-Za-z0-9_-]{8,60}$', description: '已追加保存、可读回的计算结果引用。' },
          result: { type: 'object', description: 'care-capability-result/v1（详情 watering-assessment/v1）；不含输入快照、策略版本、摘要或内部引用。',
            required: ['capabilityType', 'contractVersion', 'status', 'confidence', 'evidenceSummary', 'recommendedActions', 'generatedAt', 'validUntil', 'detailsSchemaVersion', 'details'],
            properties: {
              capabilityType: { const: 'watering' }, contractVersion: { const: 'care-capability-result/v1' },
              status: { enum: ['ready', 'insufficient_evidence', 'temporarily_unavailable'] }, confidence: { enum: ['low', 'medium', 'high'] },
              detailsSchemaVersion: { const: 'watering-assessment/v1' },
            } },
        } } },
      },
      TemporaryCaseSuccess: {
        type: 'object', additionalProperties: false, required: ['data'],
        properties: { data: { $ref: '#/components/schemas/TemporaryCaseData' } },
      },
      CreateUserPlantSuccess: {
        type: 'object',
        additionalProperties: false,
        required: ['data'],
        properties: { data: { $ref: '#/components/schemas/CreateUserPlantResponse' } },
      },
      ErrorResponse: {
        type: 'object', additionalProperties: false, required: ['error'],
        properties: {
          error: {
            type: 'object', additionalProperties: false, required: ['type', 'message'],
            properties: {
              type: { type: 'string', enum: errorTypes },
              message: { type: 'string', minLength: 1, maxLength: 200 },
            },
          },
        },
      },
    },
  },
}

function serviceHeaderParameter(name, description) {
  return {
    name,
    in: 'header',
    required: true,
    schema: { type: 'string', minLength: 1, maxLength: 512 },
    description,
  }
}

/** 虫害创建使用条件资产字段和独立安全题目分支；固定症状形状保持原合同。 */
const creationRequest = openapi.components.schemas.CreateDiagnosisSessionRequest
creationRequest.properties.mode.enum.push('specific_pest_visual')
creationRequest.properties.assetRef = { type: 'string', minLength: 1, maxLength: 64, pattern: '\\S' }
creationRequest.allOf = [{
  if: { properties: { mode: { const: 'specific_pest_visual' } } },
  then: { required: ['assetRef'] },
  else: { not: { required: ['assetRef'] } },
}]
const creationResponse = openapi.components.schemas.DiagnosisSessionCreationResponse
const fixedCreationData = creationResponse.properties.data
const pestCreationData = structuredClone(fixedCreationData)
pestCreationData.properties.mode = { const: 'specific_pest_visual' }
const pestQuestions = pestCreationData.properties.questionPackage.properties.questions
pestQuestions.minItems = 1
pestQuestions.items.required.push('riskLevel', 'riskNotice', 'safetyInstructions', 'requiresExplicitConsent', 'skipOptionEnabled')
Object.assign(pestQuestions.items.properties, {
  riskLevel: { enum: ['low', 'medium', 'high'] },
  riskNotice: { type: 'string', minLength: 1, pattern: '\\S' },
  safetyInstructions: { type: 'array', minItems: 1, items: { type: 'string', minLength: 1, pattern: '\\S' } },
  requiresExplicitConsent: { type: 'boolean' },
  skipOptionEnabled: { const: true },
})
creationResponse.properties.data = { oneOf: [fixedCreationData, pestCreationData] }

const openapiText = `${JSON.stringify(openapi, null, 2)}\n`
fs.writeFileSync(openapiPath, openapiText)
const manifest = {
  version: 'api-skeleton/p1',
  generatedAt: registry.generatedAt,
  source: 'route-registry.json',
  files: {
    'route-registry.json': createHash('sha256').update(registryText).digest('hex'),
    'openapi.p1.json': createHash('sha256').update(openapiText).digest('hex'),
  },
}
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
