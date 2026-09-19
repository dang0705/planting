import { describe, expect, test } from "vitest";

import {
  createConfigurationSnapshot,
  createConfigurationValidators,
  validateAiBudgetPolicySemantics,
} from "../src/configuration/index.js";
import type { AiBudgetPolicyRelease } from "../src/configuration/index.js";

// Expected 来源：configuration-provider-architecture/v1 与已冻结的 AI 月预算 500/400/450。
// 测试层次：unit_fake；验证类型化发布合同与确定性快照，不访问数据库或 CloudBase。
describe("P1 类型化配置发布与请求级快照", () => {
  const validators = createConfigurationValidators();

  test("AI 预算策略必须满足告警小于限制且限制不超过月预算", () => {
    const validPolicy = {
      contractVersion: "ai-budget-policy/v1",
      policyCode: "subscription.ai_budget",
      releaseVersion: "ai-budget/2026-09-20.1",
      currency: "CNY",
      monthlyBudgetCny: 500,
      warningThresholdCny: 400,
      restrictThresholdCny: 450,
      contentSha256: "a".repeat(64),
      effectiveAt: "2026-09-20T00:00:00.000Z",
    } satisfies AiBudgetPolicyRelease;

    expect(validators.aiBudgetPolicy(validPolicy)).toBe(true);
    expect(validateAiBudgetPolicySemantics(validPolicy)).toEqual({ valid: true });
    expect(
      validateAiBudgetPolicySemantics({
        ...validPolicy,
        warningThresholdCny: 480,
        restrictThresholdCny: 450,
      }),
    ).toEqual({ valid: false, reason: "AI_BUDGET_THRESHOLD_ORDER_INVALID" });
  });

  test("Provider 配置只保存 credential_ref，拒绝任何明文密钥字段", () => {
    const providerRelease = {
      contractVersion: "provider-config-release/v1",
      providerCode: "bailian_qwen_diagnosis",
      capabilityCodes: ["diagnosis.visual"],
      releaseVersion: "bailian-diagnosis/2026-09-20.1",
      configurationSha256: "b".repeat(64),
      endpointProfile: "cn-beijing/default",
      credentialRef: "cloudbase-secret://bailian-diagnosis",
      connectTimeoutMs: 3_000,
      readTimeoutMs: 45_000,
      totalDeadlineMs: 60_000,
      maxAttempts: 2,
      backoffPolicy: "bounded-exponential/v1",
      rateLimitPolicy: "bailian-diagnosis-rate/v1",
      circuitBreakerPolicy: "bailian-diagnosis-breaker/v1",
      costPolicy: "ai-cost/2026-09-20.1",
      fallbackChain: [],
      outputContractVersion: "diagnosis-model-output/v1",
      auditRetentionDays: 90,
      releaseStatus: "verified",
      effectiveAt: "2026-09-20T00:00:00.000Z",
    };

    expect(validators.providerConfigRelease(providerRelease)).toBe(true);
    expect(
      validators.providerConfigRelease({
        ...providerRelease,
        apiKey: "forbidden-plaintext",
      }),
    ).toBe(false);
  });

  test("同一组发布无论输入顺序如何都形成相同且深度冻结的请求快照", () => {
    const first = createConfigurationSnapshot({
      policyReleases: [
        { scopeCode: "subscription.ai_budget", releaseVersion: "v2", sha256: "b".repeat(64) },
        { scopeCode: "identity.guest", releaseVersion: "v1", sha256: "a".repeat(64) },
      ],
      providerReleases: [
        { scopeCode: "qweather.forecast", releaseVersion: "v3", sha256: "c".repeat(64) },
      ],
      capturedAt: "2026-09-20T00:00:00.000Z",
    });
    const second = createConfigurationSnapshot({
      policyReleases: [...first.policyReleases].reverse(),
      providerReleases: [...first.providerReleases],
      capturedAt: first.capturedAt,
    });

    expect(first.snapshotSha256).toBe(second.snapshotSha256);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.policyReleases)).toBe(true);
    expect(Object.isFrozen(first.policyReleases[0])).toBe(true);
  });
});
