import type { JSONSchemaType } from "ajv";

import type {
  CreateGuestSessionRequestDto,
  CreateGuestSessionResponseDto,
  CreateIdentitySessionRequestDto,
  CreateIdentitySessionResponseDto,
} from "./types.js";

/** 带 Z 的 ISO 8601 UTC 时刻格式（与 schemas.ts 同一既有合同）。 */
const ISO_UTC_PATTERN = "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{3})?Z$";
/** 抖音 anonymousCode 长度上限；与登录 code 同一有界输入约束，防止超长输入进入 Provider。 */
const ANONYMOUS_CODE_MAX_LENGTH = 512;

/** 微信登录请求只允许一次性 code，额外字段一律拒绝。 */
export const createIdentitySessionRequestSchema: JSONSchemaType<CreateIdentitySessionRequestDto> = {
  type: "object",
  additionalProperties: false,
  required: ["platform", "code"],
  properties: {
    platform: { type: "string", enum: ["wechat", "douyin", "xiaohongshu"] },
    code: { type: "string", minLength: 1 },
    guestToken: { type: "string", minLength: 1, nullable: true },
  },
  // 微信以 wx.login 静默登录，不走游客；携带游客令牌视为非法请求。
  if: { properties: { platform: { const: "wechat" } }, required: ["platform"] },
  then: { not: { properties: { guestToken: { type: "string" } }, required: ["guestToken"] } },
};

/** 首次登录公开数据只允许 Bearer 与绝对失效时间。 */
export const createIdentitySessionResponseSchema: JSONSchemaType<CreateIdentitySessionResponseDto> = {
  type: "object",
  additionalProperties: false,
  required: ["accessToken", "expiresAt"],
  properties: {
    accessToken: { type: "string", minLength: 1 },
    expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
  },
};

/**
 * 游客签发请求（guest-token/v1 §1，用户 2026-10-08 冻结）：只允许抖音、小红书；
 * anonymousCode 仅抖音可带，作为防刷信号，其他字段一律拒绝。
 */
export const createGuestSessionRequestSchema: JSONSchemaType<CreateGuestSessionRequestDto> = {
  type: "object",
  additionalProperties: false,
  required: ["platform"],
  properties: {
    platform: { type: "string", enum: ["douyin", "xiaohongshu"] },
    anonymousCode: { type: "string", minLength: 1, maxLength: ANONYMOUS_CODE_MAX_LENGTH, nullable: true },
  },
  // 小红书没有匿名信号，携带 anonymousCode 视为非法请求。
  if: { properties: { platform: { const: "xiaohongshu" } }, required: ["platform"] },
  then: { not: { properties: { anonymousCode: { type: "string" } }, required: ["anonymousCode"] } },
};

/** 游客签发公开数据：一次性令牌、公开引用与绝对失效时刻，不含任何摘要或来源信息。 */
export const createGuestSessionResponseSchema: JSONSchemaType<CreateGuestSessionResponseDto> = {
  type: "object",
  additionalProperties: false,
  required: ["guestToken", "guestSessionRef", "expiresAt"],
  properties: {
    guestToken: { type: "string", pattern: "^[A-Za-z0-9_-]{43}$" },
    guestSessionRef: { type: "string", pattern: "^gst_[A-Za-z0-9_-]{8,}$" },
    expiresAt: { type: "string", pattern: ISO_UTC_PATTERN },
  },
};
