import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

// Expected 来源：plant-taxonomy/v1 与 P1-taxonomy-admission-audit 的 8 项硬门缺口。
// 测试层次：unit_real_data；读取真实 DDL，不连接数据库、不把 200 条隔离候选视为准入种子。
describe("P1 植物分类身份 DDL 准入硬门", () => {
  const projectRoot = findProjectRoot();
  const sql = fs.readFileSync(
    path.join(projectRoot, "docs/backend-v2/schema/002_plant_knowledge.sql"),
    "utf8",
  );

  test("分类证据、裁决、身份映射和发布清单均有独立事实表", () => {
    for (const table of [
      "plant_taxon_authority_evidence",
      "plant_taxon_reviews",
      "plant_taxon_relation_evidence",
      "plant_identity_taxa",
      "plant_identity_alias_evidence",
      "plant_knowledge_release_items",
      "active_plant_knowledge_releases",
    ]) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
  });

  test("分类等级、审核状态、关系类型和 spp 负例由数据库约束", () => {
    for (const constraint of [
      "ck_taxon_rank",
      "ck_taxon_review_status",
      "ck_taxon_species_not_placeholder",
      "ck_taxon_relation_type",
      "ck_identity_taxon_role",
      "ck_alias_release_status",
    ]) {
      expect(sql).toContain(`CONSTRAINT \`${constraint}\``);
    }
  });

  test("权威键、原始证据、accepted/synonym 和完整父链摘要不能靠名称猜测", () => {
    expect(sql).toContain(
      "UNIQUE KEY `uq_taxon_authority` (`authority_source`, `authority_taxon_id`)",
    );
    expect(sql).toContain("CONSTRAINT `ck_taxon_authority_source`");
    expect(sql).toContain("('POWO', 'WCVP', 'WFO', 'RHS_ICRA')");
    expect(sql).toContain("CONSTRAINT `fk_taxon_authority_evidence_binding`");
    expect(sql).toContain("CONSTRAINT `ck_taxon_name_type`");
    expect(sql).toContain("`parent_chain_sha256` CHAR(64) NOT NULL");
  });

  test("spp、物种组、栽培品种与杂交均走受控等级和隔离准入路径", () => {
    expect(sql).toContain("'hybrid', 'cultivar', 'species_group'");
    expect(sql).toContain("CONSTRAINT `ck_taxon_spp_rank`");
    expect(sql).toContain("`admission_status` VARCHAR(24) NOT NULL");
    expect(sql).toContain(
      "CONSTRAINT `ck_knowledge_release_item_admission_status` CHECK (`admission_status` = 'ACTIVE')",
    );
  });

  test("active 指针和发布明细均绑定不可变版本及 SHA", () => {
    expect(sql).toContain("`release_item_sha256` CHAR(64) NOT NULL");
    expect(sql).toContain("`active_release_version` VARCHAR(64) NOT NULL");
    expect(sql).toContain("`active_artifact_sha256` CHAR(64) NOT NULL");
    expect(sql).toContain("UNIQUE KEY `uq_active_knowledge_release` (`release_kind`)");
  });

  test("200 条遗留候选保持隔离，且空库 DDL 仅作为可重放静态合同", () => {
    const admissionManifest = JSON.parse(
      fs.readFileSync(
        path.join(
          projectRoot,
          "docs/backend-v2/audits/P1-taxonomy-admission-manifest.json",
        ),
        "utf8",
      ),
    ) as {
      summary: { admitted: number; quarantined: number; rejectedFromTaxonomySeed: number };
      ddlStaticContract?: { status: string; actualMySqlVerification: string };
    };
    const schemaManifest = JSON.parse(
      fs.readFileSync(path.join(projectRoot, "docs/backend-v2/schema/manifest.json"), "utf8"),
    ) as { files: Array<{ file: string; sha256: string }> };
    const taxonomyDdl = schemaManifest.files.find(
      (entry) => entry.file === "002_plant_knowledge.sql",
    );

    expect(admissionManifest.summary).toMatchObject({
      admitted: 0,
      quarantined: 200,
      rejectedFromTaxonomySeed: 0,
    });
    expect(admissionManifest.ddlStaticContract).toEqual({
      status: "STATIC_CONTRACT_PASS_NOT_ADMISSION",
      actualMySqlVerification: "NOT_RUN_IN_THIS_TICKET",
    });
    expect(taxonomyDdl).toBeDefined();
    expect(createHash("sha256").update(sql).digest("hex")).toBe(taxonomyDdl?.sha256);
    expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|ALTER|DROP)\b/iu);
  });
});
