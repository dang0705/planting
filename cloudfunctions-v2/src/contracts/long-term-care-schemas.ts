import type { JSONSchemaType } from "ajv";

import type {
  CarePlanDto,
  CareSummaryResponseDto,
  CatalogBindingResponseDto,
  CompleteCarePlanRequestDto,
  ConfirmCareProposalRequestDto,
  CreateCareFactRequestDto,
  PutCatalogBindingRequestDto,
  CareConfirmationResponseDto,
  CareFactResponseDto,
  CarePlanListResponseDto,
  CarePlanResponseDto,
} from "./long-term-care-types.js";

/** 带 Z 的 ISO 8601 UTC 时刻格式（与 schemas.ts 同一既有合同）。 */
const ISO_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
const utc = { type: "string", pattern: ISO_UTC_PATTERN } as const;
const nullableUtc = { type: "string", pattern: ISO_UTC_PATTERN, nullable: true } as const;
/** 公开引用：前缀 + 高熵后缀（与 64 字符 SQL 容量一致）。 */
const ref = (prefix: string) => ({ type: "string", pattern: `^${prefix}_[A-Za-z0-9_-]{8,60}$` }) as const;
/** 浇入水量：0～10000 毫升整数或 null（long-term-care/v1 §3）。 */
const amountMl = { type: "integer", minimum: 0, maximum: 10000, nullable: true } as const;
const calendar = {
  type: "object", additionalProperties: false, required: ["title", "startAt", "endAt", "notes"],
  properties: { title: { type: "string", minLength: 1, maxLength: 80 }, startAt: utc, endAt: utc, notes: { type: "string", minLength: 1, maxLength: 200 } },
} as const;
const confirmationPlan = {
  type: "object", additionalProperties: false, required: ["planRef", "planType", "scheduledAt", "status", "calendar"],
  properties: { planRef: ref("cpl"), planType: { const: "check_soil" }, scheduledAt: utc, status: { const: "planned" }, calendar },
} as const;

/** 品种绑定请求：只允许目录引用。 */
export const putCatalogBindingRequestSchema: JSONSchemaType<PutCatalogBindingRequestDto> = {
  type: "object", additionalProperties: false, required: ["catalogTaxonRef"],
  properties: { catalogTaxonRef: { type: "string", minLength: 1, maxLength: 512, pattern: "\\S" } },
};
/** 品种绑定公开结果。 */
export const catalogBindingResponseSchema = {
  type: "object", additionalProperties: false, required: ["catalogTaxonRef", "boundAt"],
  properties: { catalogTaxonRef: { type: "string", minLength: 1, maxLength: 512 }, boundAt: utc },
} as unknown as JSONSchemaType<CatalogBindingResponseDto>;
/** 记录浇水请求：只 watering。 */
export const createCareFactRequestSchema = {
  type: "object", additionalProperties: false, required: ["factType", "occurredAt"],
  properties: { factType: { const: "watering" }, occurredAt: utc, amountMl },
} as unknown as JSONSchemaType<CreateCareFactRequestDto>;
/** 浇水事实公开结果。 */
export const careFactResponseSchema = {
  type: "object", additionalProperties: false, required: ["factRef", "factType", "occurredAt", "amountMl"],
  properties: { factRef: ref("cft"), factType: { const: "watering" }, occurredAt: utc, amountMl },
} as unknown as JSONSchemaType<CareFactResponseDto>;
/** 养护计划公开投影。 */
export const carePlanSchema = {
  type: "object", additionalProperties: false, required: ["planRef", "planType", "scheduledAt", "status", "sourceProposalRef", "completedFactRef", "calendar"],
  properties: {
    planRef: ref("cpl"), planType: { const: "check_soil" }, scheduledAt: utc, status: { enum: ["planned", "completed", "cancelled", "expired"] },
    sourceProposalRef: ref("cpr"), completedFactRef: { ...ref("cft"), nullable: true }, calendar,
  },
} as unknown as JSONSchemaType<CarePlanDto>;
/** 计划列表公开结果。 */
export const carePlanListResponseSchema = {
  type: "object", additionalProperties: false, required: ["items", "nextCursor"],
  properties: { items: { type: "array", maxItems: 50, items: carePlanSchema }, nextCursor: { type: "string", minLength: 1, maxLength: 200, nullable: true } },
} as unknown as JSONSchemaType<CarePlanListResponseDto>;
/** 确认建议请求：严格三选一。 */
export const confirmCareProposalRequestSchema = {
  oneOf: [
    { type: "object", additionalProperties: false, required: ["decision"], properties: { decision: { const: "schedule_check" }, scheduledAt: utc } },
    { type: "object", additionalProperties: false, required: ["decision", "occurredAt"], properties: { decision: { const: "record_watering" }, occurredAt: utc, amountMl } },
    { type: "object", additionalProperties: false, required: ["decision"], properties: { decision: { const: "dismiss" } } },
  ],
} as unknown as JSONSchemaType<ConfirmCareProposalRequestDto>;
/** 确认建议公开结果。 */
export const careConfirmationResponseSchema = {
  type: "object", additionalProperties: false, required: ["proposalRef", "proposalStatus", "plan", "factRef"],
  properties: { proposalRef: ref("cpr"), proposalStatus: { enum: ["confirmed", "dismissed"] }, plan: { ...confirmationPlan, nullable: true }, factRef: { ...ref("cft"), nullable: true } },
} as unknown as JSONSchemaType<CareConfirmationResponseDto>;
/** 完成计划请求：skipped 不得附带盆土或浇水。 */
export const completeCarePlanRequestSchema = {
  type: "object", additionalProperties: false, required: ["version", "outcome"],
  properties: {
    version: { type: "integer", minimum: 1, maximum: 4294967295 }, outcome: { enum: ["done", "skipped"] },
    soil: { type: "object", additionalProperties: false, required: ["state", "scope"], properties: { state: { enum: ["wet", "moist", "dry", "uncertain"] }, scope: { enum: ["surface", "root_zone"] } } },
    watering: { type: "object", additionalProperties: false, required: ["occurredAt"], properties: { occurredAt: utc, amountMl } },
  },
  if: { properties: { outcome: { const: "skipped" } }, required: ["outcome"] },
  // 跳过时出现 soil / watering 即不合法（{ not: {} } 永远不通过）。
  then: { properties: { soil: { not: {} }, watering: { not: {} } } },
} as unknown as JSONSchemaType<CompleteCarePlanRequestDto>;
/** 完成计划公开结果。 */
export const carePlanResponseSchema = {
  type: "object", additionalProperties: false, required: ["planRef", "status", "version", "factRef", "calendar"],
  properties: { planRef: ref("cpl"), status: { enum: ["completed", "cancelled"] }, version: { type: "integer", minimum: 1 }, factRef: { ...ref("cft"), nullable: true }, calendar },
} as unknown as JSONSchemaType<CarePlanResponseDto>;
/** 养护摘要公开结果。 */
export const careSummaryResponseSchema = {
  type: "object", additionalProperties: false, required: ["lastWatering", "latestWateringAdvice", "nextPlan", "profileReadiness"],
  properties: {
    lastWatering: { type: "object", nullable: true, additionalProperties: false, required: ["factRef", "occurredAt", "amountMl"], properties: { factRef: ref("cft"), occurredAt: utc, amountMl } },
    latestWateringAdvice: {
      type: "object", nullable: true, additionalProperties: false, required: ["resultRef", "generatedAt", "status", "action", "checkWindow", "proposal"],
      properties: {
        resultRef: ref("cres"), generatedAt: utc, status: { enum: ["ready", "insufficient_evidence", "temporarily_unavailable"] }, action: { type: "string", minLength: 1 },
        checkWindow: { type: "object", nullable: true },
        proposal: { type: "object", nullable: true, additionalProperties: false, required: ["proposalRef", "status", "validUntil"],
          properties: { proposalRef: ref("cpr"), status: { enum: ["proposed", "confirmed", "dismissed", "expired"] }, validUntil: nullableUtc } },
      },
    },
    nextPlan: { ...confirmationPlan, nullable: true },
    profileReadiness: { type: "object", additionalProperties: false, required: ["hasMeasuredPot", "hasCatalogBinding"], properties: { hasMeasuredPot: { type: "boolean" }, hasCatalogBinding: { type: "boolean" } } },
  },
} as unknown as JSONSchemaType<CareSummaryResponseDto>;
