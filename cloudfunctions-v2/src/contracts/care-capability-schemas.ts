import type { JSONSchemaType } from "ajv";

import type { CareCapabilityResponseDto } from "./care-capability-types.js";

/** 带 Z 的 ISO 8601 UTC 时刻格式（与 schemas.ts 同一既有合同）。 */
const ISO_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
/** 当地日期 YYYY-MM-DD。 */
const LOCAL_DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
/** 非负闭区间。 */
const range = {
  type: "object", additionalProperties: false, required: ["min", "max"], nullable: true,
  properties: { min: { type: "number", minimum: 0 }, max: { type: "number", minimum: 0 } },
};
const nullableUtc = { type: "string", pattern: ISO_UTC_PATTERN, nullable: true };
const nullableDate = { type: "string", pattern: LOCAL_DATE_PATTERN, nullable: true };

/** CareCapabilityResponse 严格 Schema：只允许合同外壳与浇水详情字段。 */
export const careCapabilityResponseSchema = {
  type: "object",
  additionalProperties: false,
  required: ["resultRef", "result"],
  properties: {
    resultRef: { type: "string", pattern: "^cres_[A-Za-z0-9_-]{8,60}$" },
    result: {
      type: "object",
      additionalProperties: false,
      required: ["capabilityType", "contractVersion", "status", "confidence", "evidenceSummary", "recommendedActions", "generatedAt", "validUntil", "detailsSchemaVersion", "details"],
      properties: {
        capabilityType: { type: "string", const: "watering" },
        contractVersion: { type: "string", const: "care-capability-result/v1" },
        status: { type: "string", enum: ["ready", "insufficient_evidence", "temporarily_unavailable"] },
        confidence: { type: "string", enum: ["low", "medium", "high"] },
        evidenceSummary: { type: "array", items: { type: "string" } },
        recommendedActions: { type: "array", items: { type: "string" } },
        generatedAt: { type: "string", pattern: ISO_UTC_PATTERN },
        validUntil: nullableUtc,
        detailsSchemaVersion: { type: "string", const: "watering-assessment/v1" },
        details: {
          type: "object",
          additionalProperties: false,
          required: ["action", "soilState", "soilScope", "dryingWindowState", "checkWindow", "amountMl", "netDeficitMl", "missingEvidence"],
          properties: {
            action: { type: "string", enum: ["temporarily_unavailable", "pause_watering", "review_drainage", "water_allowed", "check_later", "check_now", "priority_check", "insufficient_evidence"] },
            soilState: { type: "string", enum: ["wet", "waterlogged", "target_dry", "unknown"] },
            soilScope: { type: "string", enum: ["surface", "root_zone", null], nullable: true },
            dryingWindowState: { type: "string", enum: ["before", "within", "overdue", "uncertain", null], nullable: true },
            checkWindow: {
              type: "object", additionalProperties: false, nullable: true,
              required: ["purpose", "earliestAt", "latestAt", "coverageEndAt", "timezone", "earliestDate", "latestDate"],
              properties: {
                purpose: { type: "string", const: "soil_check" },
                earliestAt: nullableUtc, latestAt: nullableUtc,
                coverageEndAt: { type: "string", pattern: ISO_UTC_PATTERN },
                timezone: { type: "string", minLength: 1, nullable: true },
                earliestDate: nullableDate, latestDate: nullableDate,
              },
            },
            amountMl: range,
            netDeficitMl: range,
            missingEvidence: { type: "array", items: { type: "string" } },
          },
        },
      },
    },
  },
} as unknown as JSONSchemaType<CareCapabilityResponseDto>;
