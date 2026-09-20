import { describe, expect, test } from "vitest";

import { createPublicContractValidators } from "../src/contracts/index.js";

const validators = createPublicContractValidators();

describe("P1 公开 DTO 与 AJV Schema", () => {
  // Expected：http-api/v1；公开错误只允许 error.type/message，拒绝内部 code、trace 和额外 ok 字段。
  test("公开错误响应严格拒绝内部字段", () => {
    const errorResponse = {
      error: { type: "VALIDATION_FAILED", message: "请求内容不完整" },
    };

    expect(validators.errorResponse(errorResponse)).toBe(true);
    expect(validators.errorResponse({ ...errorResponse, ok: false })).toBe(false);
    expect(
      validators.errorResponse({
        error: { ...errorResponse.error, code: "INTERNAL_VALIDATION_0042" },
      }),
    ).toBe(false);
  });

  // Expected：identity 绑定合同；绑定冲突和最后登录入口保护必须是稳定公开错误，且不能暴露原绑定用户。
  test("身份绑定错误使用稳定且脱敏的公开类别", () => {
    expect(
      validators.errorResponse({
        error: { type: "IDENTITY_BINDING_CONFLICT", message: "该平台身份无法绑定" },
      }),
    ).toBe(true);
    expect(
      validators.errorResponse({
        error: { type: "IDENTITY_LAST_BINDING_REQUIRED", message: "请至少保留一个登录方式" },
      }),
    ).toBe(true);
    expect(
      validators.errorResponse({
        error: {
          type: "IDENTITY_BINDING_CONFLICT",
          message: "该身份已绑定 usr_01J8Z3H4R57V4G2QPG6C5W8K9M",
          ownerUserId: "usr_01J8Z3H4R57V4G2QPG6C5W8K9M",
        },
      }),
    ).toBe(false);
  });

  // Expected：principal-capability/v1；游客主体不得携带统一用户或任意额外字段。
  test("游客主体只接受匿名会话合同字段", () => {
    expect(
      validators.guestPrincipal({
        principalType: "guest",
        guestSessionRef: "gst_01J8Z3H4R57V4G2QPG6C5W8K9M",
        authProvider: "cloudbase_anonymous",
        issuedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-21T10:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      validators.guestPrincipal({
        principalType: "guest",
        guestSessionRef: "gst_01J8Z3H4R57V4G2QPG6C5W8K9M",
        authProvider: "cloudbase_anonymous",
        issuedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-21T10:00:00.000Z",
        user_id: "usr_forbidden",
      }),
    ).toBe(false);
  });

  // Expected：principal-capability/v1；服务主体只能携带该已注册服务拥有的最小 scope。
  test("内部服务 scope 按服务白名单拒绝未知或跨服务权限", () => {
    expect(
      validators.servicePrincipal({
        principalType: "service",
        service: "cloudbase_agent",
        scopes: ["user-plant.agent-context.read"],
        issuedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-20T10:05:00.000Z",
      }),
    ).toBe(true);

    expect(
      validators.servicePrincipal({
        principalType: "service",
        service: "payment_callback",
        scopes: ["subscription.ai-quota.reserve"],
        issuedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-20T10:05:00.000Z",
      }),
    ).toBe(false);

    expect(
      validators.servicePrincipal({
        principalType: "service",
        service: "scheduler",
        scopes: ["ALL_INTERNAL_CAPABILITIES"],
        issuedAt: "2026-09-20T10:00:00.000Z",
        expiresAt: "2026-09-20T10:05:00.000Z",
      }),
    ).toBe(false);
  });

  // Expected：user-plant/v1；确认态必须有规范身份，暂未识别态不得夹带确认身份。
  test("用户植物身份状态与确认身份引用保持一致", () => {
    expect(
      validators.userPlant({
        user_plant_id: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
        lifecycle: "active",
        identityStatus: "confirmed",
        confirmedIdentityRef: "pid_01J8Z3H4R57V4G2QPG6C5W8K9M",
        version: 1,
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBe(true);

    expect(
      validators.userPlant({
        user_plant_id: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
        lifecycle: "active",
        identityStatus: "confirmed",
        version: 1,
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBe(false);

    expect(
      validators.userPlant({
        user_plant_id: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
        lifecycle: "active",
        identityStatus: "unidentified",
        confirmedIdentityRef: "pid_forbidden",
        version: 1,
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBe(false);

    expect(
      validators.userPlant({
        user_plant_id: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
        user_id: "usr_01J8Z3H4R57V4G2QPG6C5W8K9M",
        lifecycle: "active",
        identityStatus: "confirmed",
        confirmedIdentityRef: "pid_01J8Z3H4R57V4G2QPG6C5W8K9M",
        version: 1,
        createdAt: "2026-09-20T10:00:00.000Z",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }),
    ).toBe(false);
  });

  // Expected：guest-session-claim/v1；new 与 existing 两种目标互斥，且拒绝额外字段。
  test("游客案例认领目标是严格的互斥联合", () => {
    const base = {
      guestSessionRef: "gst_01J8Z3H4R57V4G2QPG6C5W8K9M",
      guestPlantCaseRef: "gpc_01J8Z3H4R57V4G2QPG6C5W8K9M",
      idempotencyKey: "claim-20260920-0001",
    };

    expect(validators.claimGuestSession({ ...base, target: { type: "new_user_plant" } })).toBe(true);
    expect(
      validators.claimGuestSession({
        ...base,
        target: {
          type: "existing_user_plant",
          user_plant_id: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
        },
      }),
    ).toBe(true);
    expect(
      validators.claimGuestSession({
        ...base,
        target: { type: "existing_user_plant" },
      }),
    ).toBe(false);
    expect(
      validators.claimGuestSession({
        ...base,
        target: { type: "new_user_plant", user_plant_id: "upl_forbidden" },
      }),
    ).toBe(false);
  });

  // Expected：guest-session-claim/v1；认领结果只能公开 command 的 claimRef、目标用户植物公开引用、
  // 白名单对象类别摘要和重放标志，不能透出数据库内部键、user_id、proof、租约或请求哈希。
  test("游客认领结果严格脱敏且可表达同键重放", () => {
    const result = {
      claimRef: "gcl_01J8Z3H4R57V4G2QPG6C5W8K9M",
      userPlantId: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
      claimedObjectKinds: ["identification_candidate", "fixed_diagnosis_result"],
      replayed: false,
    };

    expect(validators.guestClaimResult(result)).toBe(true);
    expect(validators.guestClaimResult({ ...result, replayed: true })).toBe(true);

    for (const internalField of [
      "claim_command_internal_id",
      "guest_plant_case_internal_id",
      "user_internal_id",
      "user_id",
      "proof_version",
      "processing_lease_owner_hash",
      "processing_lease_expires_at_ms",
      "request_hash",
    ]) {
      expect(validators.guestClaimResult({ ...result, [internalField]: "forbidden" })).toBe(false);
    }
  });

  // Expected：reward-events/v1；生产域只能发送事实，不能提交奖励分值。
  test("奖励事件拒绝客户端或生产域注入分值", () => {
    const event = {
      eventId: "evt_01J8Z3H4R57V4G2QPG6C5W8K9M",
      eventType: "care.soil_check_completed.v1",
      eventVersion: 1,
      producerDomain: "care",
      userRef: "usr_01J8Z3H4R57V4G2QPG6C5W8K9M",
      userPlantRef: "upl_01J8Z3H4R57V4G2QPG6C5W8K9M",
      aggregateRef: "cpl_01J8Z3H4R57V4G2QPG6C5W8K9M",
      occurrenceRef: "occ_01J8Z3H4R57V4G2QPG6C5W8K9M",
      policyVersion: "care-points/2026-09-20",
      occurredAt: "2026-09-20T10:00:00.000Z",
      payload: { decision: "defer_watering" },
      payloadHash: "a".repeat(64),
    };

    expect(validators.rewardableDomainEvent(event)).toBe(true);
    expect(validators.rewardableDomainEvent({ ...event, points: 999_999 })).toBe(false);
  });

  // Expected：care-points-ai-quota/v1；公开动作只描述产品意图，预算必须由服务端策略计算。
  test("公开 AI 动作拒绝客户端注入预算和成本策略", () => {
    const action = {
      productActionId: "act_01J8Z3H4R57V4G2QPG6C5W8K9M",
      capability: "USER_DIAGNOSIS_VISUAL",
    };

    expect(validators.publicAiAction(action)).toBe(true);
    expect(validators.publicAiAction({ ...action, estimatedAmount: 80 })).toBe(false);
    expect(validators.publicAiAction({ ...action, costPolicyVersion: "client-forged" })).toBe(false);
  });

  // Expected：care-points-ai-quota/v1；内部预占命令接受服务端计算的正整数预算。
  test("内部 AI 额度预占命令只接受正整数预算和受控能力", () => {
    const command = {
      productActionId: "act_01J8Z3H4R57V4G2QPG6C5W8K9M",
      costPolicyVersion: "ai-cost/2026-09-20",
      capability: "USER_DIAGNOSIS_VISUAL",
      estimatedAmount: 80,
      idempotencyKey: "diagnosis-20260920-0001",
    };

    expect(validators.reserveAiQuota(command)).toBe(true);
    expect(validators.reserveAiQuota({ ...command, estimatedAmount: 0 })).toBe(false);
    expect(validators.reserveAiQuota({ ...command, estimatedAmount: 1.5 })).toBe(false);
    expect(validators.reserveAiQuota({ ...command, settledAmount: 1 })).toBe(false);
  });
});
