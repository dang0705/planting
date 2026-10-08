import type { JSONSchemaType } from "ajv";

import type { CreateTemporaryCaseRequestDto, TemporaryCaseResponseDto } from "./types.js";

/** 带 Z 的 ISO 8601 UTC 时刻格式（与 schemas.ts 同一既有合同）。 */
const ISO_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
/** 既有临时案例引用的高熵后缀；与 guest_plant_case_ref / ephemeral_plant_case_ref 的 VARCHAR(64) 容量一致。 */
const CASE_REF_SUFFIX = "[A-Za-z0-9_-]{8,60}";

/** 创建临时植物案例请求：严格空对象，任何字段一律拒绝（temporary-case/v1 §1）。 */
export const createTemporaryCaseRequestSchema: JSONSchemaType<CreateTemporaryCaseRequestDto> = {
  type: "object",
  additionalProperties: false,
  maxProperties: 0,
  required: [],
  properties: {},
};

/** 临时案例公开数据：前缀与 ownerKind 必须一致，禁止额外字段。 */
export const temporaryCaseResponseSchema = {
  oneOf: [
    {
      type: "object",
      additionalProperties: false,
      required: ["caseRef", "ownerKind", "expiresAt"],
      properties: {
        caseRef: { type: "string", pattern: `^gpc_${CASE_REF_SUFFIX}$` },
        ownerKind: { type: "string", const: "guest" },
        expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
      },
    },
    {
      type: "object",
      additionalProperties: false,
      required: ["caseRef", "ownerKind", "expiresAt"],
      properties: {
        caseRef: { type: "string", pattern: `^epc_${CASE_REF_SUFFIX}$` },
        ownerKind: { type: "string", const: "authenticated" },
        expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
      },
    },
  ],
} as unknown as JSONSchemaType<TemporaryCaseResponseDto>;
