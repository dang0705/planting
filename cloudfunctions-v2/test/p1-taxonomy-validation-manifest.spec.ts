/* oxlint-disable no-magic-numbers -- 审计夹具中的 SHA 长度、下标和记录数就是合同 Expected。 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

/**
 * Expected 来源：Master Plan 5.3 的 `plant-identity-validation-manifest/v1`、
 * 全部旧身份终态处置及输入/证据/裁决/转换 SHA-256 要求。测试层次：unit_real_data。
 *
 * 真实路径：已校验批次裁决 + 权威回放 + 遗留展示字段 → 单一验证清单。
 * 测试用内存夹具替换 200 条真实记录和大体积官方制品，不证明线上来源或发布。
 */
describe("P1 植物身份验证清单合并", () => {
  async function loadMerger(): Promise<{
    buildPlantIdentityValidationManifest: (input: Record<string, unknown>) => {
      manifestVersion: string;
      summary: Record<string, number>;
      records: Array<Record<string, unknown>>;
      contentSha256: string;
    };
  }> {
    const projectRoot = findProjectRoot();
    return import(
      pathToFileURL(
        path.join(
          projectRoot,
          "docs/backend-v2/audits/taxonomy-validation-manifest.mjs",
        ),
      ).href,
    ) as Promise<{
      buildPlantIdentityValidationManifest: (input: Record<string, unknown>) => {
        manifestVersion: string;
        summary: Record<string, number>;
        records: Array<Record<string, unknown>>;
        contentSha256: string;
      };
    }>;
  }

  test("代理审核建议在人工批准前保持隔离且不能进入种子", async () => {
    const { buildPlantIdentityValidationManifest } = await loadMerger();
    const evidenceRecords = [
      {
        sourceRecordId: "1",
        sourceLine: 1,
        sourceLineSha256: "a".repeat(64),
        rawScientificName: "Epipremnum aureum",
        parsedKind: "species",
        decisionReasons: ["HUMAN_REVIEW_REQUIRED"],
        wcvp: {
          taxonId: "101",
          scientificNameId: "ipni:101",
          taxonomicStatus: "Accepted",
          acceptedScientificName: "Epipremnum aureum",
          rank: "Species",
          genus: "Epipremnum",
          family: "Araceae",
          parentChain: [{ taxonId: "101", scientificName: "Epipremnum aureum", rank: "Species" }],
        },
        wfo: {
          taxonId: "wfo-101",
          scientificNameId: "wfo-101",
          taxonomicStatus: "Accepted",
          acceptedScientificName: "Epipremnum aureum",
          rank: "species",
          genus: "Epipremnum",
          family: "Araceae",
          parentChain: [],
          crossCheck: "MATCH",
        },
        cultivar: null,
      },
      {
        sourceRecordId: "2",
        sourceLine: 2,
        sourceLineSha256: "b".repeat(64),
        rawScientificName: "Lithops spp.",
        parsedKind: "species_group",
        decisionReasons: ["HUMAN_REVIEW_REQUIRED"],
        wcvp: null,
        wfo: null,
        cultivar: null,
      },
    ];
    const legacyRecords = [
      {
        sourceRecordId: 1,
        legacyReference: {
          displayNameZh: "绿萝",
          scientificName: "Epipremnum aureum",
          familyNameCanonical: "Araceae",
          genusName: "Epipremnum",
          legacyRowSha256: "a".repeat(64),
        },
      },
      {
        sourceRecordId: 2,
        legacyReference: {
          displayNameZh: "生石花",
          scientificName: "Lithops spp.",
          familyNameCanonical: "Aizoaceae",
          genusName: "Lithops",
          legacyRowSha256: "b".repeat(64),
        },
      },
    ];
    const reviews = [
      {
        manifestIndex: 0,
        sourceRecordId: "1",
        sourceLineSha256: "a".repeat(64),
        rawScientificName: "Epipremnum aureum",
        legacyDisplayNameZh: "绿萝",
        reviewDecision: "ADMIT_AS_ACCEPTED",
        acceptedScientificName: "Epipremnum aureum",
        authoritySource: "WCVP",
        authorityTaxonId: "101",
        rank: "species",
        genus: "Epipremnum",
        family: "Araceae",
        decisionReasons: ["双源一致"],
        evidenceChecks: {
          wcvpExactUnambiguous: true,
          wfoCrossCheckMatch: true,
          legacyGenusMatches: true,
          legacyFamilyMatches: true,
          specialRankOrCultivar: false,
          unresolvedConflict: false,
        },
        reviewerAgent: "reviewer-a",
        reviewedAt: "2026-09-20T03:00:00+08:00",
      },
      {
        manifestIndex: 1,
        sourceRecordId: "2",
        sourceLineSha256: "b".repeat(64),
        rawScientificName: "Lithops spp.",
        legacyDisplayNameZh: "生石花",
        reviewDecision: "QUARANTINE",
        acceptedScientificName: null,
        authoritySource: null,
        authorityTaxonId: null,
        rank: null,
        genus: null,
        family: null,
        decisionReasons: ["物种组不是单一 taxon"],
        evidenceChecks: {
          wcvpExactUnambiguous: false,
          wfoCrossCheckMatch: false,
          legacyGenusMatches: false,
          legacyFamilyMatches: false,
          specialRankOrCultivar: true,
          unresolvedConflict: false,
        },
        reviewerAgent: "reviewer-a",
        reviewedAt: "2026-09-20T03:00:00+08:00",
      },
    ];

    const result = buildPlantIdentityValidationManifest({
      sourceSnapshotSha256: "c".repeat(64),
      authorityEvidenceManifestSha256: "d".repeat(64),
      evidenceRecords,
      legacyRecords,
      validatedReviews: reviews,
      generatedAt: "2026-09-20T03:10:00+08:00",
    });

    expect(result.manifestVersion).toBe("plant-identity-validation-manifest/v1");
    expect(result.summary).toMatchObject({
      total: 2,
      recommendedReuseAsIs: 1,
      transform: 0,
      quarantine: 2,
      seedEligible: 0,
    });
    expect(result.records.map((record) => record.terminalDisposition)).toEqual([
      "QUARANTINE",
      "QUARANTINE",
    ]);
    expect(result.records[0]).toMatchObject({
      recommendedDisposition: "REUSE_AS_IS",
      humanApprovalStatus: "PENDING",
    });
    expect(result.contentSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  test("与具体建议绑定的人工批准才允许形成可入种子的终态", async () => {
    const { buildPlantIdentityValidationManifest } = await loadMerger();
    const evidenceRecord = {
      sourceRecordId: "1",
      sourceLine: 1,
      sourceLineSha256: "a".repeat(64),
      rawScientificName: "Epipremnum aureum",
      parsedKind: "species",
      decisionReasons: ["HUMAN_REVIEW_REQUIRED"],
      wcvp: {
        taxonId: "101",
        scientificNameId: "ipni:101",
        taxonomicStatus: "Accepted",
        acceptedScientificName: "Epipremnum aureum",
        rank: "Species",
        genus: "Epipremnum",
        family: "Araceae",
        parentChain: [],
      },
      wfo: {
        acceptedScientificName: "Epipremnum aureum",
        rank: "species",
        genus: "Epipremnum",
        family: "Araceae",
        crossCheck: "MATCH",
      },
      cultivar: null,
    };
    const legacyRecord = {
      sourceRecordId: 1,
      legacyReference: {
        displayNameZh: "绿萝",
        scientificName: "Epipremnum aureum",
        familyNameCanonical: "Araceae",
        genusName: "Epipremnum",
        legacyRowSha256: "a".repeat(64),
      },
    };
    const review = {
      manifestIndex: 0,
      sourceRecordId: "1",
      sourceLineSha256: "a".repeat(64),
      rawScientificName: "Epipremnum aureum",
      legacyDisplayNameZh: "绿萝",
      reviewDecision: "ADMIT_AS_ACCEPTED",
      acceptedScientificName: "Epipremnum aureum",
      authoritySource: "WCVP",
      authorityTaxonId: "101",
      rank: "species",
      genus: "Epipremnum",
      family: "Araceae",
      decisionReasons: ["双源一致"],
      evidenceChecks: {
        wcvpExactUnambiguous: true,
        wfoCrossCheckMatch: true,
        legacyGenusMatches: true,
        legacyFamilyMatches: true,
        specialRankOrCultivar: false,
        unresolvedConflict: false,
      },
      reviewerAgent: "reviewer-a",
      reviewedAt: "2026-09-20T03:00:00+08:00",
    };
    const result = buildPlantIdentityValidationManifest({
      sourceSnapshotSha256: "c".repeat(64),
      authorityEvidenceManifestSha256: "d".repeat(64),
      evidenceRecords: [evidenceRecord],
      legacyRecords: [legacyRecord],
      validatedReviews: [review],
      humanApprovals: [
        {
          sourceRecordId: "1",
          approvedDisposition: "REUSE_AS_IS",
          reviewerRef: "human:product-owner",
          reviewedAt: "2026-09-20T03:20:00+08:00",
        },
      ],
      generatedAt: "2026-09-20T03:21:00+08:00",
    });

    expect(result.summary).toMatchObject({ reuseAsIs: 1, seedEligible: 1 });
    expect(result.records[0]).toMatchObject({
      terminalDisposition: "REUSE_AS_IS",
      humanApprovalStatus: "APPROVED",
    });
  });

  test("缺失裁决、重复 sourceRecordId 或非连续下标必须拒绝合并", async () => {
    const { buildPlantIdentityValidationManifest } = await loadMerger();

    expect(() =>
      buildPlantIdentityValidationManifest({
        sourceSnapshotSha256: "c".repeat(64),
        authorityEvidenceManifestSha256: "d".repeat(64),
        evidenceRecords: [{ sourceRecordId: "1" }, { sourceRecordId: "2" }],
        legacyRecords: [],
        validatedReviews: [
          { manifestIndex: 1, sourceRecordId: "1" },
          { manifestIndex: 1, sourceRecordId: "1" },
        ],
        generatedAt: "2026-09-20T03:10:00+08:00",
      }),
    ).toThrow(/连续|重复|缺失/);
  });

  test("仓库内分片清单覆盖 200 条且人类批准前全部保持隔离", () => {
    const projectRoot = findProjectRoot();
    const manifestPath = path.join(
      projectRoot,
      "docs/backend-v2/audits/plant-identity-validation-manifest-v1.json",
    );
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
      manifestVersion: string;
      reviewPolicy: { agentRecommendationIsHumanApproval: boolean };
      recordShards: Array<{
        ref: string;
        sha256: string;
        startIndex: number;
        endIndex: number;
        recordCount: number;
      }>;
      humanApprovals: unknown[];
      summary: Record<string, number>;
      releaseStatus: string;
    };
    const allReviews: Array<Record<string, unknown>> = [];

    for (const shard of manifest.recordShards) {
      const shardBytes = fs.readFileSync(path.join(projectRoot, shard.ref));
      expect(createHash("sha256").update(shardBytes).digest("hex")).toBe(shard.sha256);
      const reviews = (JSON.parse(shardBytes.toString("utf8")) as {
        reviews: Array<Record<string, unknown>>;
      }).reviews;
      expect(reviews).toHaveLength(shard.recordCount);
      expect(reviews[0]?.manifestIndex).toBe(shard.startIndex);
      expect(reviews.at(-1)?.manifestIndex).toBe(shard.endIndex);
      allReviews.push(...reviews);
    }

    const ids = allReviews.map((review) => String(review.sourceRecordId));
    const decisions = allReviews.reduce<Record<string, number>>((counts, review) => {
      const decision = String(review.reviewDecision);
      counts[decision] = (counts[decision] ?? 0) + 1;
      return counts;
    }, {});
    expect(manifest.manifestVersion).toBe("plant-identity-validation-manifest/v1");
    expect(allReviews).toHaveLength(200);
    expect(new Set(ids).size).toBe(200);
    expect(decisions).toEqual({
      ADMIT_AS_ACCEPTED: 113,
      TRANSFORM_TO_ACCEPTED: 7,
      QUARANTINE: 80,
    });
    expect(manifest.reviewPolicy.agentRecommendationIsHumanApproval).toBe(false);
    expect(manifest.humanApprovals).toEqual([]);
    expect(manifest.summary).toMatchObject({
      total: 200,
      quarantine: 200,
      seedEligible: 0,
      humanApprovalPending: 120,
    });
    expect(manifest.releaseStatus).toBe("STOP_PENDING_HUMAN_APPROVAL");
  });
});
