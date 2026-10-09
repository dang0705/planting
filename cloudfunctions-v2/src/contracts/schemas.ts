import type { JSONSchemaType } from "ajv";

import type {
  CapabilitySnapshotDto,
  ClaimedGuestObjectKind,
  ClaimGuestSessionCommandDto,
  CreateUserPlantRequestDto,
  CreateUserPlantResponseDto,
  ErrorResponseDto,
  GuestClaimResultDto,
  GuestPrincipalDto,
  PublicAiActionRequestDto,
  ReserveAiQuotaCommandDto,
  RewardableDomainEventDto,
  ServicePrincipalDto,
  UserPrincipalDto,
} from "./types.js";
import { USER_PLANT_INITIAL_VERSION } from "./types.js";

const ISO_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const PUBLIC_REF_SUFFIX = "[A-Za-z0-9_-]{8,}";
const GUEST_CAPABILITIES = [
  "PLANT_IDENTIFICATION",
  "FIXED_DIAGNOSIS",
  "INDEPENDENT_WATERING",
  "SOIL_VISUAL_EVIDENCE",
] as const;
const USER_CAPABILITIES = [
  ...GUEST_CAPABILITIES,
  "USER_PLANT_CREATE",
  "POINTS_LEVEL_QUERY",
  "REWARDED_AI",
  "USER_AGENT_TEXT",
  "USER_DIAGNOSIS_TEXT",
  "USER_DIAGNOSIS_VISUAL",
] as const;
const CLAIMED_GUEST_OBJECT_KINDS: ClaimedGuestObjectKind[] = [
  "identification_candidate",
  "fixed_diagnosis_result",
  "independent_watering_advice",
  "soil_visual_evidence",
];

/** http-api/v1 的严格公开错误 Schema；额外内部字段一律拒绝。 */
export const errorResponseSchema: JSONSchemaType<ErrorResponseDto> = {
  type: "object",
  additionalProperties: false,
  required: ["error"],
  properties: {
    error: {
      type: "object",
      additionalProperties: false,
      required: ["type", "message"],
      properties: {
        type: {
          type: "string",
          enum: [
            "VALIDATION_FAILED",
            "PRINCIPAL_INVALID",
            "CAPABILITY_DENIED",
            "IDENTITY_BINDING_CONFLICT",
            "IDENTITY_LAST_BINDING_REQUIRED",
            "NOT_FOUND",
            "USER_PLANT_NOT_FOUND",
            "METHOD_NOT_ALLOWED",
            "GUEST_SESSION_EXPIRED",
            "PAYLOAD_TOO_LARGE",
            "UNSUPPORTED_MEDIA_TYPE",
            "IDEMPOTENCY_CONFLICT",
            "USER_PLANT_VERSION_CONFLICT",
            "CAPABILITY_SNAPSHOT_EXPIRED",
            "GUEST_SESSION_NOT_CLAIMABLE",
            "AI_QUOTA_INSUFFICIENT",
            "TEMPORARY_CASE_LIMIT_REACHED",
            "USER_PLANT_ARCHIVED",
            "CARE_PROPOSAL_NOT_CONFIRMABLE",
            "CARE_PLAN_VERSION_CONFLICT",
            "INTERNAL_ERROR",
            "SERVICE_UNAVAILABLE",
            "EPHEMERAL_CASE_NOT_BINDABLE",
          ],
        },
        message: { type: "string", minLength: 1, maxLength: 200 },
      },
    },
  },
};

/** 游客主体输入 Schema；additionalProperties=false 防止 user_id 等字段穿透。 */
export const guestPrincipalSchema: JSONSchemaType<GuestPrincipalDto> = {
  type: "object",
  additionalProperties: false,
  required: ["principalType", "guestSessionRef", "authProvider", "issuedAt", "expiresAt"],
  properties: {
    principalType: { type: "string", const: "guest" },
    guestSessionRef: { type: "string", pattern: `^gst_${PUBLIC_REF_SUFFIX}$` },
    authProvider: { type: "string", const: "server_issued_guest_token" },
    issuedAt: { type: "string", pattern: ISO_UTC_PATTERN },
    expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
  },
};

/** 登录主体 Schema 不允许平台主体标识进入业务合同。 */
export const userPrincipalSchema: JSONSchemaType<UserPrincipalDto> = {
  type: "object",
  additionalProperties: false,
  required: [
    "principalType",
    "user_id",
    "sessionVersion",
    "authenticatedVia",
    "issuedAt",
    "expiresAt",
  ],
  properties: {
    principalType: { type: "string", const: "user" },
    user_id: { type: "string", pattern: `^usr_${PUBLIC_REF_SUFFIX}$` },
    sessionVersion: { type: "integer", minimum: 1 },
    authenticatedVia: {
      type: "string",
      enum: ["wechat", "douyin", "xiaohongshu", "phone"],
    },
    issuedAt: { type: "string", pattern: ISO_UTC_PATTERN },
    expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
  },
};

/** 服务主体 Schema；每个服务只能声明其注册表中的最小 scope，未知或跨服务 scope 拒绝。 */
export const servicePrincipalSchema: JSONSchemaType<ServicePrincipalDto> = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["principalType", "service", "scopes", "issuedAt", "expiresAt"],
      properties: {
        principalType: { type: "string", const: "service" },
        service: { type: "string", const: "cloudbase_agent" },
        scopes: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          uniqueItems: true,
          items: {
            type: "string",
            enum: [
              "identity.resolve",
              "user-plant.context.read",
              "user-plant.agent-context.read",
              "subscription.ai-quota.reserve",
              "subscription.ai-quota.settle",
              "subscription.ai-quota.release",
            ],
          },
        },
        issuedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["principalType", "service", "scopes", "issuedAt", "expiresAt"],
      properties: {
        principalType: { type: "string", const: "service" },
        service: { type: "string", const: "scheduler" },
        scopes: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          uniqueItems: true,
          items: {
            type: "string",
            enum: [
              "plant-knowledge.enrichment.lease",
              "plant-knowledge.enrichment.submit",
            ],
          },
        },
        issuedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["principalType", "service", "scopes", "issuedAt", "expiresAt"],
      properties: {
        principalType: { type: "string", const: "service" },
        service: { type: "string", const: "payment_callback" },
        scopes: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          uniqueItems: true,
          items: { type: "string", const: "subscription.payment-callback.receive" },
        },
        issuedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["principalType", "service", "scopes", "issuedAt", "expiresAt"],
      properties: {
        principalType: { type: "string", const: "service" },
        service: { type: "string", const: "outbox_dispatcher" },
        scopes: {
          type: "array",
          minItems: 1,
          maxItems: 1,
          uniqueItems: true,
          items: { type: "string", const: "subscription.reward-event.consume" },
        },
        issuedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
      },
    },
  ],
};

/**
 * 内部能力快照 Schema。游客分支禁止 user_id 且植物上限固定为 0；
 * 登录分支必须携带统一用户公开引用。两种形状严格互斥。
 */
export const capabilitySnapshotSchema: JSONSchemaType<CapabilitySnapshotDto> = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: [
        "contractVersion",
        "snapshotRef",
        "subjectType",
        "tier",
        "allowedCapabilities",
        "rewardedAiScopes",
        "activeUserPlantLimit",
        "generatedAt",
        "validUntil",
        "policyVersion",
      ],
      properties: {
        contractVersion: { type: "string", const: "capability-snapshot/v1" },
        snapshotRef: { type: "string", pattern: `^cps_${PUBLIC_REF_SUFFIX}$` },
        subjectType: { type: "string", const: "guest" },
        tier: { type: "string", const: "guest" },
        allowedCapabilities: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", enum: [...GUEST_CAPABILITIES] },
        },
        rewardedAiScopes: {
          type: "array",
          maxItems: 0,
          uniqueItems: true,
          items: {
            type: "string",
            enum: ["USER_AGENT_TEXT", "USER_DIAGNOSIS_TEXT", "USER_DIAGNOSIS_VISUAL"],
          },
        },
        activeUserPlantLimit: { type: "integer", const: 0 },
        generatedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        validUntil: { type: "string", pattern: ISO_UTC_PATTERN },
        policyVersion: { type: "string", minLength: 1, maxLength: 100 },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: [
        "contractVersion",
        "snapshotRef",
        "subjectType",
        "user_id",
        "tier",
        "allowedCapabilities",
        "rewardedAiScopes",
        "activeUserPlantLimit",
        "generatedAt",
        "validUntil",
        "policyVersion",
      ],
      properties: {
        contractVersion: { type: "string", const: "capability-snapshot/v1" },
        snapshotRef: { type: "string", pattern: `^cps_${PUBLIC_REF_SUFFIX}$` },
        subjectType: { type: "string", const: "user" },
        user_id: { type: "string", pattern: `^usr_${PUBLIC_REF_SUFFIX}$` },
        tier: { type: "string", enum: ["free", "trial", "member"] },
        allowedCapabilities: {
          type: "array",
          uniqueItems: true,
          items: { type: "string", enum: [...USER_CAPABILITIES] },
        },
        rewardedAiScopes: {
          type: "array",
          uniqueItems: true,
          items: {
            type: "string",
            enum: ["USER_AGENT_TEXT", "USER_DIAGNOSIS_TEXT", "USER_DIAGNOSIS_VISUAL"],
          },
        },
        activeUserPlantLimit: { type: "integer", minimum: 0 },
        generatedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        validUntil: { type: "string", pattern: ISO_UTC_PATTERN },
        policyVersion: { type: "string", minLength: 1, maxLength: 100 },
      },
    },
  ],
};

/** 用户植物公开投影 Schema；用 oneOf 锁定确认身份与当前状态的一致性。 */
export { userPlantSchema } from "./user-plant-schema.js";

/** 登录与游客签发请求/响应 Schema 拆分至独立文件（schemas.ts 500 行上限）。 */
export {
  createGuestSessionRequestSchema,
  createGuestSessionResponseSchema,
  createIdentitySessionRequestSchema,
  createIdentitySessionResponseSchema,
} from "./identity-session-schemas.js";

/** 创建用户植物请求 Schema；任何客户端业务字段或放错位置的幂等键都必须拒绝。 */
export const createUserPlantRequestSchema: JSONSchemaType<CreateUserPlantRequestDto> = {
  type: "object",
  additionalProperties: false,
  maxProperties: 0,
  required: [],
  properties: {},
};

/** 创建用户植物响应 Schema；固定为 active、暂未识别和初始版本。 */
export const createUserPlantResponseSchema: JSONSchemaType<CreateUserPlantResponseDto> = {
  type: "object",
  additionalProperties: false,
  required: [
    "user_plant_id",
    "lifecycle",
    "identityStatus",
    "version",
    "createdAt",
    "updatedAt",
  ],
  properties: {
    user_plant_id: { type: "string", pattern: `^upl_${PUBLIC_REF_SUFFIX}$` },
    lifecycle: { type: "string", const: "active" },
    identityStatus: { type: "string", const: "unidentified" },
    version: { type: "integer", const: USER_PLANT_INITIAL_VERSION },
    createdAt: { type: "string", pattern: ISO_UTC_PATTERN },
    updatedAt: { type: "string", pattern: ISO_UTC_PATTERN },
  },
};

/** 游客案例认领命令 Schema；target 的两种形状严格互斥。 */
export const claimGuestSessionCommandSchema: JSONSchemaType<ClaimGuestSessionCommandDto> = {
  type: "object",
  additionalProperties: false,
  required: ["guestSessionRef", "guestPlantCaseRef", "guestToken", "target"],
  properties: {
    guestSessionRef: { type: "string", pattern: `^gst_${PUBLIC_REF_SUFFIX}$` },
    guestPlantCaseRef: { type: "string", pattern: `^gpc_${PUBLIC_REF_SUFFIX}$` },
    guestToken: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
    target: {
      oneOf: [
        {
          type: "object",
          additionalProperties: false,
          required: ["type"],
          properties: { type: { type: "string", const: "new_user_plant" } },
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "user_plant_id"],
          properties: {
            type: { type: "string", const: "existing_user_plant" },
            user_plant_id: { type: "string", pattern: `^upl_${PUBLIC_REF_SUFFIX}$` },
          },
        },
      ],
    },
  },
};

/** 游客认领结果 Schema；只允许认领公开引用、目标植物、对象类别摘要与重放标志。 */
export const guestClaimResultSchema: JSONSchemaType<GuestClaimResultDto> = {
  type: "object",
  additionalProperties: false,
  required: ["claimRef", "userPlantId", "claimedObjectKinds", "replayed"],
  properties: {
    claimRef: { type: "string", pattern: `^gcl_${PUBLIC_REF_SUFFIX}$` },
    userPlantId: { type: "string", pattern: `^upl_${PUBLIC_REF_SUFFIX}$` },
    claimedObjectKinds: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", enum: CLAIMED_GUEST_OBJECT_KINDS },
    },
    replayed: { type: "boolean" },
  },
};

/** 奖励事件 Schema；顶层白名单确保 points/amount 等分值字段不能注入。 */
export const rewardableDomainEventSchema: JSONSchemaType<RewardableDomainEventDto> = {
  type: "object",
  additionalProperties: false,
  required: [
    "eventId",
    "eventType",
    "eventVersion",
    "producerDomain",
    "userRef",
    "aggregateRef",
    "occurrenceRef",
    "producerPolicyVersion",
    "occurredAt",
    "payload",
    "payloadHash",
  ],
  properties: {
    eventId: { type: "string", pattern: `^evt_${PUBLIC_REF_SUFFIX}$` },
    eventType: {
      type: "string",
      enum: [
        "user_plant.profile_completed.v1",
        "care.soil_check_completed.v1",
        "care.fertilizing_check_completed.v1",
        "diagnosis.fixed_package_completed.v1",
        "knowledge.contribution_released.v1",
      ],
    },
    eventVersion: { type: "integer", const: 1 },
    producerDomain: {
      type: "string",
      enum: ["user-plant", "care", "diagnosis", "plant-knowledge"],
    },
    userRef: { type: "string", pattern: `^usr_${PUBLIC_REF_SUFFIX}$` },
    userPlantRef: {
      type: "string",
      pattern: `^upl_${PUBLIC_REF_SUFFIX}$`,
      nullable: true,
    },
    aggregateRef: { type: "string", minLength: 8, maxLength: 100 },
    occurrenceRef: { type: "string", minLength: 8, maxLength: 100 },
    producerPolicyVersion: { type: "string", minLength: 1, maxLength: 100 },
    occurredAt: { type: "string", pattern: ISO_UTC_PATTERN },
    payload: { type: "object", required: [], additionalProperties: true },
    payloadHash: { type: "string", pattern: "^[a-f0-9]{64}$" },
  },
};

/** 公开 AI 动作 Schema；客户端不能注入成本策略或点数。 */
export const publicAiActionRequestSchema: JSONSchemaType<PublicAiActionRequestDto> = {
  type: "object",
  additionalProperties: false,
  required: ["productActionId", "capability"],
  properties: {
    productActionId: { type: "string", minLength: 8, maxLength: 100 },
    capability: {
      type: "string",
      enum: ["USER_AGENT_TEXT", "USER_DIAGNOSIS_TEXT", "USER_DIAGNOSIS_VISUAL"],
    },
  },
};

/** 内部 AI 额度预占命令 Schema；只接受服务端计算的正整数预算。 */
export const reserveAiQuotaCommandSchema: JSONSchemaType<ReserveAiQuotaCommandDto> = {
  type: "object",
  additionalProperties: false,
  required: [
    "productActionId",
    "costPolicyVersion",
    "capability",
    "estimatedAmount",
    "idempotencyKey",
  ],
  properties: {
    productActionId: { type: "string", minLength: 8, maxLength: 100 },
    costPolicyVersion: { type: "string", minLength: 1, maxLength: 100 },
    capability: {
      type: "string",
      enum: ["USER_AGENT_TEXT", "USER_DIAGNOSIS_TEXT", "USER_DIAGNOSIS_VISUAL"],
    },
    estimatedAmount: { type: "integer", minimum: 1 },
    idempotencyKey: { type: "string", minLength: 8, maxLength: 128 },
  },
};
