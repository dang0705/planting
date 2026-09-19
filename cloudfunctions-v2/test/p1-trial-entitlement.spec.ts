import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

/**
 * Expected 来源：Canonical Master Plan、state-machines/v1 与 care-points-ai-quota/v1。
 * 测试层级：unit_real_data；读取真实 001/005 DDL，不连接数据库。
 * 覆盖试用时间锚点、终身一次和精确 24 小时窗口；不替代 P3 运行时或 P5 真实 MySQL 并发验收。
 */
test("24 小时试用必须从统一用户创建时间起算且不可重置", () => {
  const root = findProjectRoot();
  const identitySql = fs.readFileSync(
    path.join(root, "docs/backend-v2/schema/001_identity.sql"),
    "utf8",
  );
  const subscriptionSql = fs.readFileSync(
    path.join(root, "docs/backend-v2/schema/005_subscription.sql"),
    "utf8",
  );

  assert.match(
    identitySql,
    /UNIQUE KEY `uq_user_id_created_at` \(`id`, `created_at_ms`\)/u,
  );
  assert.match(subscriptionSql, /`starts_at_ms` BIGINT UNSIGNED NOT NULL/u);
  assert.match(subscriptionSql, /`expires_at_ms` BIGINT UNSIGNED NOT NULL/u);
  assert.doesNotMatch(subscriptionSql, /`activated_at_ms`/u);
  assert.match(
    subscriptionSql,
    /CONSTRAINT `fk_trial_user_created_at` FOREIGN KEY \(`user_internal_id`, `starts_at_ms`\) REFERENCES `users` \(`id`, `created_at_ms`\)/u,
  );
  assert.match(
    subscriptionSql,
    /CONSTRAINT `ck_trial_window` CHECK \(`expires_at_ms` = `starts_at_ms` \+ 86400000\)/u,
  );
  assert.match(
    subscriptionSql,
    /CONSTRAINT `ck_trial_status` CHECK \(`status` IN \('eligible', 'active', 'expired', 'denied'\)\)/u,
  );
  assert.match(
    subscriptionSql,
    /UNIQUE KEY `uq_trial_user_once` \(`user_internal_id`\)/u,
  );
});
