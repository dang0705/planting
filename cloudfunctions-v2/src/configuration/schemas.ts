import type { JSONSchemaType } from "ajv";

import type { AiBudgetPolicyRelease, ProviderConfigRelease } from "./types.js";

const ISO_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const SHA256_PATTERN = "^[a-f0-9]{64}$";
const VERSION_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._/-]{0,99}$";
const POLICY_REF_PATTERN = "^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$";

/** AI 月预算的结构合同；阈值之间的顺序由独立领域语义校验负责。 */
export const aiBudgetPolicyReleaseSchema: JSONSchemaType<AiBudgetPolicyRelease> = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion",
    "policyCode",
    "releaseVersion",
    "currency",
    "monthlyBudgetCny",
    "warningThresholdCny",
    "restrictThresholdCny",
    "contentSha256",
    "effectiveAt",
  ],
  properties: {
    contractVersion: { type: "string", const: "ai-budget-policy/v1" },
    policyCode: { type: "string", const: "subscription.ai_budget" },
    releaseVersion: { type: "string", pattern: VERSION_PATTERN },
    currency: { type: "string", const: "CNY" },
    monthlyBudgetCny: { type: "integer", minimum: 1 },
    warningThresholdCny: { type: "integer", minimum: 1 },
    restrictThresholdCny: { type: "integer", minimum: 1 },
    contentSha256: { type: "string", pattern: SHA256_PATTERN },
    effectiveAt: { type: "string", pattern: ISO_UTC_PATTERN },
  },
};

/** Provider 配置发布的严格白名单 Schema；额外 apiKey/secret 等属性会直接失败。 */
export const providerConfigReleaseSchema: JSONSchemaType<ProviderConfigRelease> = {
  type: "object",
  additionalProperties: false,
  required: [
    "contractVersion",
    "providerCode",
    "capabilityCodes",
    "releaseVersion",
    "configurationSha256",
    "endpointProfile",
    "credentialRef",
    "connectTimeoutMs",
    "readTimeoutMs",
    "totalDeadlineMs",
    "maxAttempts",
    "backoffPolicy",
    "rateLimitPolicy",
    "circuitBreakerPolicy",
    "costPolicy",
    "fallbackChain",
    "outputContractVersion",
    "auditRetentionDays",
    "releaseStatus",
    "effectiveAt",
  ],
  properties: {
    contractVersion: { type: "string", const: "provider-config-release/v1" },
    providerCode: {
      type: "string",
      enum: [
        "baidu_plant",
        "taxonomy_authority",
        "bailian_qwen_diagnosis",
        "bailian_qwen_enrichment",
        "qweather",
        "wechat_pay",
        "platform_notification",
        "cloudbase_storage",
        "cloudbase_cms",
        "cloudbase_agent",
        "cloudbase_mysql",
        "cloudbase_auth",
      ],
    },
    capabilityCodes: {
      type: "array",
      minItems: 1,
      uniqueItems: true,
      items: { type: "string", pattern: POLICY_REF_PATTERN },
    },
    releaseVersion: { type: "string", pattern: VERSION_PATTERN },
    configurationSha256: { type: "string", pattern: SHA256_PATTERN },
    endpointProfile: { type: "string", minLength: 1, maxLength: 191 },
    credentialRef: {
      type: "string",
      pattern: "^cloudbase-secret://[A-Za-z0-9][A-Za-z0-9._/-]{0,170}$",
    },
    connectTimeoutMs: { type: "integer", minimum: 1, maximum: 60_000 },
    readTimeoutMs: { type: "integer", minimum: 1, maximum: 120_000 },
    totalDeadlineMs: { type: "integer", minimum: 1, maximum: 120_000 },
    maxAttempts: { type: "integer", minimum: 1, maximum: 5 },
    backoffPolicy: { type: "string", pattern: POLICY_REF_PATTERN },
    rateLimitPolicy: { type: "string", pattern: POLICY_REF_PATTERN },
    circuitBreakerPolicy: { type: "string", pattern: POLICY_REF_PATTERN },
    costPolicy: { type: "string", pattern: POLICY_REF_PATTERN },
    fallbackChain: {
      type: "array",
      uniqueItems: true,
      items: { type: "string", pattern: POLICY_REF_PATTERN },
    },
    outputContractVersion: { type: "string", pattern: VERSION_PATTERN },
    auditRetentionDays: { type: "integer", minimum: 1, maximum: 3650 },
    releaseStatus: {
      type: "string",
      enum: ["draft", "verified", "active", "retired"],
    },
    effectiveAt: { type: "string", pattern: ISO_UTC_PATTERN },
    expiresAt: { type: "string", pattern: ISO_UTC_PATTERN, nullable: true },
  },
};
