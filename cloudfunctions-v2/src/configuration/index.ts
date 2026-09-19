import { createHash } from "node:crypto";

import Ajv, { type ValidateFunction } from "ajv";

import { aiBudgetPolicyReleaseSchema, providerConfigReleaseSchema } from "./schemas.js";
import type {
  AiBudgetPolicyRelease,
  ConfigurationReleaseRef,
  ConfigurationSemanticValidation,
  ConfigurationSnapshot,
  ConfigurationSnapshotInput,
  ProviderConfigRelease,
} from "./types.js";

export type * from "./types.js";
export { aiBudgetPolicyReleaseSchema, providerConfigReleaseSchema } from "./schemas.js";

/** 创建进程级复用的配置合同校验器；调用方必须先校验 unknown 再进入配置仓库。 */
export function createConfigurationValidators(): {
  /** AI 月预算发布的 JSON 结构校验器；必须先校验 unknown，再把输入交给配置领域。 */
  aiBudgetPolicy: ValidateFunction<AiBudgetPolicyRelease>;
  /** Provider 运行配置发布的严格白名单校验器；额外字段（尤其明文凭证）会被拒绝。 */
  providerConfigRelease: ValidateFunction<ProviderConfigRelease>;
} {
  const ajv = new Ajv({ allErrors: true, strict: true });
  return {
    aiBudgetPolicy: ajv.compile(aiBudgetPolicyReleaseSchema),
    providerConfigRelease: ajv.compile(providerConfigReleaseSchema),
  };
}

/** 结构校验之后执行 AI 预算阈值的跨字段业务约束。 */
export function validateAiBudgetPolicySemantics(
  policy: AiBudgetPolicyRelease,
): ConfigurationSemanticValidation {
  if (
    policy.warningThresholdCny >= policy.restrictThresholdCny ||
    policy.restrictThresholdCny > policy.monthlyBudgetCny
  ) {
    return { valid: false, reason: "AI_BUDGET_THRESHOLD_ORDER_INVALID" };
  }
  return { valid: true };
}

/** 按作用域、版本和 SHA 排序，确保同一发布集合在任何节点产生完全相同的快照。 */
function normalizeReleaseRefs(
  releases: readonly ConfigurationReleaseRef[],
): Readonly<ConfigurationReleaseRef>[] {
  return releases
    .map((release) => Object.freeze({ ...release }))
    .sort((left, right) => {
      const leftKey = `${left.scopeCode}\u0000${left.releaseVersion}\u0000${left.sha256}`;
      const rightKey = `${right.scopeCode}\u0000${right.releaseVersion}\u0000${right.sha256}`;
      return leftKey.localeCompare(rightKey, "en");
    });
}

/**
 * 构造一次请求使用的不可变配置快照。
 * 哈希只覆盖业务策略、Provider 配置和捕获时间，不包含用户数据、凭证或追踪标识。
 */
export function createConfigurationSnapshot(
  input: ConfigurationSnapshotInput,
): Readonly<ConfigurationSnapshot> {
  const policyReleases = Object.freeze(normalizeReleaseRefs(input.policyReleases));
  const providerReleases = Object.freeze(normalizeReleaseRefs(input.providerReleases));
  const canonicalContent = JSON.stringify({
    capturedAt: input.capturedAt,
    policyReleases,
    providerReleases,
  });
  const snapshotSha256 = createHash("sha256").update(canonicalContent).digest("hex");

  return Object.freeze({
    policyReleases,
    providerReleases,
    capturedAt: input.capturedAt,
    snapshotSha256,
  });
}
