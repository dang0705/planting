import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

/**
 * Expected 来源：
 * - `docs/backend-v2/contracts/guest-session-claim.md` 的 guest-session-claim/v1；
 * - `docs/backend-v2/audits/P1-identity-semantics-2026-09-20.md` 的 P1-ID-09；
 * - P1 空库建表与事务原子性的退出条件。
 *
 * 测试层次：unit_real_data。这里只读取真实合同和 003 DDL，不连接数据库，
 * 因此不能替代后续 e2e_real_api / 真实 MySQL 事务验收。
 *
 * RED 形态：这些断言先固定外部 Expected，再由合同和 DDL 实现；不能从当前
 * SQL 结构反推成功答案。每个用例的 Break / Mutation 见对应注释。
 */

function readGuestClaimArtifacts(): { contract: string; schema: string } {
  const root = findProjectRoot();
  return {
    contract: fs.readFileSync(
      path.join(root, "docs/backend-v2/contracts/guest-session-claim.md"),
      "utf8",
    ),
    schema: fs.readFileSync(
      path.join(root, "docs/backend-v2/schema/003_user_plant.sql"),
      "utf8",
    ),
  };
}

function tableBody(schema: string, tableName: string): string {
  const pattern =
    "CREATE TABLE `" + tableName + "` ([\\s\\S]*?)\\) ENGINE=InnoDB";
  const match = schema.match(
    new RegExp(pattern, "u"),
  );
  const body = match?.[1];
  assert.ok(body, `DDL 缺少表：${tableName}`);
  return body;
}

test("游客认领只保留一个 claim_ref 事实源，成功事实和当前投影可回溯", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const command = tableBody(schema, "guest_claim_commands");
  const successFact = tableBody(schema, "guest_case_claims");
  const currentProjection = tableBody(schema, "guest_plant_cases");

  // Break：认领成功后由两张表各自生成 claim_ref，重放可能返回两个不同公开引用。
  // Mutation：在 guest_case_claims 重新加入 claim_ref 列，或删除成功事实与命令的链接。
  assert.match(contract, /唯一公开 `?claim_ref`? 事实源/u);
  assert.match(contract, /guest_claim_commands.*命令.*公开 `?claim_ref`?[\s\S]*guest_case_claims.*不可变成功事实[\s\S]*guest_plant_cases.*当前投影/u);
  assert.match(command, /UNIQUE KEY `uq_guest_claim_ref` \(`claim_ref`\)/u);
  assert.doesNotMatch(successFact, /`claim_ref`/u);
  assert.match(successFact, /`claim_command_internal_id` BIGINT UNSIGNED NOT NULL/u);
  assert.match(successFact, /UNIQUE KEY `uq_guest_case_claim_once` \(`guest_plant_case_internal_id`\)/u);
  assert.match(currentProjection, /`claimed_user_internal_id` BIGINT UNSIGNED NULL/u);
  assert.match(currentProjection, /`claimed_user_plant_internal_id` BIGINT UNSIGNED NULL/u);
});

test("成功事实必须同时匹配命令的案例、用户和最终目标", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const command = tableBody(schema, "guest_claim_commands");
  const successFact = tableBody(schema, "guest_case_claims");

  // Break：成功事实只按 command id 关联，命令的 case/user/target 被篡改后仍可落库。
  // Mutation：把复合外键改回单列 claim_command_internal_id，或删除成功链唯一键。
  assert.match(contract, /成功事实必须与命令的 `?guest case`?、`?user_id`? 和最终 `?user_plant_id`? 完全一致/u);
  assert.match(
    command,
    /UNIQUE KEY `uq_guest_claim_success_link` \(`id`, `guest_plant_case_internal_id`, `user_internal_id`, `target_user_plant_internal_id`\)/u,
  );
  assert.match(
    successFact,
    /FOREIGN KEY \(`claim_command_internal_id`, `guest_plant_case_internal_id`, `user_internal_id`, `user_plant_internal_id`\) REFERENCES `guest_claim_commands` \(`id`, `guest_plant_case_internal_id`, `user_internal_id`, `target_user_plant_internal_id`\)/u,
  );
});

test("成功事实的当前 owner 投影必须匹配同一案例的 claimed owner", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const projection = tableBody(schema, "guest_plant_cases");
  const successFact = tableBody(schema, "guest_case_claims");

  // Break：不可变成功事实写到用户 A，但 guest_plant_cases 的 claimed owner 写成用户 B。
  // Mutation：删掉 owner 复合唯一键或把成功事实外键改成只引用案例 id。
  assert.match(contract, /`?guest_plant_cases`? 的 claimed owner 只是可重建当前投影/u);
  assert.match(contract, /成功事实是唯一不可变事实源，当前投影不得独立生成认领结论/u);
  assert.match(
    projection,
    /UNIQUE KEY `uq_guest_case_claim_projection_owner` \(`id`, `claimed_user_internal_id`, `claimed_user_plant_internal_id`\)/u,
  );
  assert.match(
    successFact,
    /FOREIGN KEY \(`guest_plant_case_internal_id`, `user_internal_id`, `user_plant_internal_id`\) REFERENCES `guest_plant_cases` \(`id`, `claimed_user_internal_id`, `claimed_user_plant_internal_id`\)/u,
  );
});

test("新建目标、成功事实和案例投影必须在同一事务提交或全部回滚", () => {
  const { contract } = readGuestClaimArtifacts();

  // Break：创建 user_plant 成功后写 claim 失败，留下半认领；或只回滚命令不回滚 owner 投影。
  // Mutation：删除 ROLLBACK 条款、把成功事实移到事务外，或把“同一事务”改成最终一致。
  assert.match(contract, /认领事务原子性/u);
  assert.match(contract, /START TRANSACTION/u);
  assert.match(contract, /锁定 guest_sessions 和 guest_plant_cases[\s\S]*FOR UPDATE/u);
  assert.match(contract, /创建新用户植物、写入 guest_case_claims、更新 guest_plant_cases claimed owner 和命令完成状态必须在同一事务/u);
  assert.match(contract, /COMMIT/u);
  assert.match(contract, /ROLLBACK/u);
  assert.match(contract, /不得留下半绑定/u);
});

test("processing 命令必须具备可恢复租约和尝试次数不变量", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const command = tableBody(schema, "guest_claim_commands");

  // Break：worker 崩溃后 processing 永久卡住，或两个 worker 同时接管同一命令。
  // Mutation：删除 lease 过期检查、owner hash 或 attempt_count 约束。
  assert.match(contract, /processing lease/u);
  assert.match(contract, /租约未过期时只有持有者可以继续处理；租约过期后原子接管并递增 `?attempt_count`?/u);
  assert.match(command, /`processing_lease_owner_hash` CHAR\(64\) NULL/u);
  assert.match(command, /`processing_lease_expires_at_ms` BIGINT UNSIGNED NULL/u);
  assert.match(command, /`attempt_count` INT UNSIGNED NOT NULL DEFAULT 0/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_processing_lease`/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_processing_lease_time`/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_attempt_count`/u);
});

test("认领命令必须保存已验证 proof_version，且不能由客户端指定", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const command = tableBody(schema, "guest_claim_commands");

  // Break：只凭 guest_session_ref、设备或客户端 proof_version 认领，无法审计服务端实际验证的版本。
  // Mutation：把 proof_version 从命令表删除，或把它加入公开 ClaimGuestSessionCommand。
  assert.match(contract, /`?proof_version`? 由服务端从锁定会话的当前或宽限期证明校验结果写入命令/u);
  assert.match(contract, /`?ClaimGuestSessionCommand`? 不接受 `?proof_version`?/u);
  assert.match(command, /`proof_version` INT UNSIGNED NOT NULL/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_proof_version` CHECK \(`proof_version` > 0\)/u);
});

test("existing_user_plant 的请求目标和最终目标必须一致，new 目标只允许服务端产生最终目标", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const command = tableBody(schema, "guest_claim_commands");

  // Break：请求绑定已有植物 A，完成时却把案例投影到植物 B；或客户端直接提交新植物内部主键。
  // Mutation：删除请求/最终目标一致性 CHECK，或放宽 target_type 与 requested target 的互斥规则。
  assert.match(contract, /existing_user_plant 的 requested target 与最终 target 必须是同一 `?user_plant`?/u);
  assert.match(contract, /new_user_plant 的最终 target 只能由同一事务中新建并写回/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_requested_target`/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_target_consistency`/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_completed_target`/u);
});

test("失败命令可恢复但不会制造成功事实或阻断后续认领", () => {
  const { contract, schema } = readGuestClaimArtifacts();
  const command = tableBody(schema, "guest_claim_commands");
  const successFact = tableBody(schema, "guest_case_claims");

  // Break：可重试的内部失败永久占用案例，或失败命令错误产生 guest_case_claims。
  // Mutation：删除“失败不写成功事实”规则、删除 retryable lease recovery 或把 claim once 约束移到命令表。
  assert.match(contract, /可重试内部失败只保留 `?failed`? 命令和脱敏 `?failure_code`?；不得写入 `?guest_case_claims`?/u);
  assert.match(contract, /processing 租约过期或事务回滚时，原命令保留同一 `?claim_ref`?、`?request_hash`? 和 `?proof_version`?，可重新取得租约/u);
  assert.match(contract, /失败命令不会永久阻断后续认领/u);
  assert.match(command, /`failure_code` VARCHAR\(64\) NULL/u);
  assert.match(command, /CONSTRAINT `ck_guest_claim_failure_code`/u);
  assert.match(successFact, /UNIQUE KEY `uq_guest_case_claim_once` \(`guest_plant_case_internal_id`\)/u);
});
