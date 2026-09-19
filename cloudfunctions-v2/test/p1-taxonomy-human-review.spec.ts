/* oxlint-disable no-magic-numbers -- 审计夹具中的 SHA 长度、下标和边界值就是合同 Expected。 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

type EvidenceRecord = {
  sourceRecordId: string;
  sourceLineSha256: string;
  rawScientificName: string;
  parsedKind: string;
  decisionReasons: string[];
  wcvp: {
    taxonId: string;
    taxonomicStatus: string;
    acceptedScientificName: string;
    rank: string;
    genus: string;
    family: string;
    parentChain?: Array<{ taxonId: string; scientificName: string; rank: string }>;
  } | null;
  wfo: {
    acceptedScientificName: string;
    rank: string;
    genus: string;
    family: string;
    crossCheck: string;
  } | null;
  cultivar: unknown;
};

type LegacyRecord = {
  sourceRecordId: number;
  legacyReference: {
    displayNameZh: string;
    scientificName: string;
    familyNameCanonical: string;
    genusName: string;
    legacyRowSha256: string;
  };
  duplicateGroup?: string;
};

type ReviewRecord = Record<string, unknown>;

/**
 * Expected 来源：plant-taxonomy/v1 的人工审核与 release 准入谓词，以及
 * taxonomy-review/README.md 的批次并行边界。测试层次：unit_real_data。
 *
 * 真实路径：权威回放记录 + 遗留展示字段 + 人工裁决批次 → 一致性校验。
 * 这里使用最小内存夹具替换 200 条真实制品；不证明真实分类裁决正确，也不发布 release。
 */
describe("P1 植物分类人工裁决批次校验", () => {
  async function loadValidator(): Promise<{
    validateReviewBatch: (input: {
      batch: { reviews: ReviewRecord[] };
      evidenceRecords: EvidenceRecord[];
      legacyRecords: LegacyRecord[];
      startIndex: number;
      endIndex: number;
    }) => { valid: boolean; errors: string[] };
  }> {
    const projectRoot = findProjectRoot();
    return import(
      pathToFileURL(
        path.join(
          projectRoot,
          "docs/backend-v2/audits/taxonomy-review-validator.mjs",
        ),
      ).href,
    ) as Promise<{
      validateReviewBatch: (input: {
        batch: { reviews: ReviewRecord[] };
        evidenceRecords: EvidenceRecord[];
        legacyRecords: LegacyRecord[];
        startIndex: number;
        endIndex: number;
      }) => { valid: boolean; errors: string[] };
    }>;
  }

  function acceptedEvidence(): EvidenceRecord {
    return {
      sourceRecordId: "1",
      sourceLineSha256: "a".repeat(64),
      rawScientificName: "Epipremnum aureum",
      parsedKind: "species",
      decisionReasons: ["HUMAN_REVIEW_REQUIRED"],
      wcvp: {
        taxonId: "70476",
        taxonomicStatus: "Accepted",
        acceptedScientificName: "Epipremnum aureum",
        rank: "Species",
        genus: "Epipremnum",
        family: "Araceae",
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
  }

  function legacyRecord(): LegacyRecord {
    return {
      sourceRecordId: 1,
      legacyReference: {
        displayNameZh: "绿萝",
        scientificName: "Epipremnum aureum",
        familyNameCanonical: "Araceae",
        genusName: "Epipremnum",
        legacyRowSha256: "a".repeat(64),
      },
    };
  }

  function acceptedReview(): ReviewRecord {
    return {
      manifestIndex: 0,
      sourceRecordId: "1",
      sourceLineSha256: "a".repeat(64),
      rawScientificName: "Epipremnum aureum",
      legacyDisplayNameZh: "绿萝",
      reviewDecision: "ADMIT_AS_ACCEPTED",
      acceptedScientificName: "Epipremnum aureum",
      authoritySource: "WCVP",
      authorityTaxonId: "70476",
      rank: "species",
      genus: "Epipremnum",
      family: "Araceae",
      decisionReasons: ["WCVP_WFO_ACCEPTED_MATCH"],
      evidenceChecks: {
        wcvpExactUnambiguous: true,
        wfoCrossCheckMatch: true,
        legacyGenusMatches: true,
        legacyFamilyMatches: true,
        specialRankOrCultivar: false,
        unresolvedConflict: false,
      },
      reviewerAgent: "fixture-reviewer",
      reviewedAt: "2026-09-20T03:00:00+08:00",
    };
  }

  test("双源一致且无风险的接受名裁决通过", async () => {
    const { validateReviewBatch } = await loadValidator();
    const result = validateReviewBatch({
      batch: { reviews: [acceptedReview()] },
      evidenceRecords: [acceptedEvidence()],
      legacyRecords: [legacyRecord()],
      startIndex: 0,
      endIndex: 0,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test("缺失、歧义或重复组不能伪装成准入", async () => {
    const { validateReviewBatch } = await loadValidator();
    const evidence = acceptedEvidence();
    evidence.decisionReasons.push("WCVP_EXACT_MATCH_AMBIGUOUS");
    const legacy = legacyRecord();
    legacy.duplicateGroup = "D01";

    const result = validateReviewBatch({
      batch: { reviews: [acceptedReview()] },
      evidenceRecords: [evidence],
      legacyRecords: [legacy],
      startIndex: 0,
      endIndex: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/歧义|重复/);
  });

  test("批次缺项、错位或修改来源 SHA 必须失败", async () => {
    const { validateReviewBatch } = await loadValidator();
    const review = acceptedReview();
    review.manifestIndex = 1;
    review.sourceLineSha256 = "b".repeat(64);

    const result = validateReviewBatch({
      batch: { reviews: [review] },
      evidenceRecords: [acceptedEvidence()],
      legacyRecords: [legacyRecord()],
      startIndex: 0,
      endIndex: 0,
    });

    expect(result.valid).toBe(false);
    expect(result.errors.join("\n")).toMatch(/下标|SHA/);
  });

  test("异名转换必须绑定接受名稳定标识而不是异名稳定标识", async () => {
    const { validateReviewBatch } = await loadValidator();
    const evidence = acceptedEvidence();
    evidence.rawScientificName = "Pothos aureus";
    evidence.wcvp = {
      taxonId: "synonym-102",
      taxonomicStatus: "Synonym",
      acceptedScientificName: "Epipremnum aureum",
      rank: "Species",
      genus: "Epipremnum",
      family: "Araceae",
      parentChain: [
        { taxonId: "accepted-101", scientificName: "Epipremnum aureum", rank: "Species" },
      ],
    };
    const review = acceptedReview();
    review.rawScientificName = "Pothos aureus";
    review.reviewDecision = "TRANSFORM_TO_ACCEPTED";
    review.authorityTaxonId = "accepted-101";
    review.evidenceChecks = {
      ...(review.evidenceChecks as Record<string, unknown>),
      legacyGenusMatches: true,
      legacyFamilyMatches: true,
    };

    const result = validateReviewBatch({
      batch: { reviews: [review] },
      evidenceRecords: [evidence],
      legacyRecords: [legacyRecord()],
      startIndex: 0,
      endIndex: 0,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });

  test("种下等级即使解析器归为 species 也必须被识别为特殊等级", async () => {
    const { validateReviewBatch } = await loadValidator();
    const evidence = acceptedEvidence();
    evidence.rawScientificName = "Capsicum annuum var. grossum";
    const review = acceptedReview();
    review.rawScientificName = evidence.rawScientificName;
    review.reviewDecision = "QUARANTINE";
    review.acceptedScientificName = null;
    review.authoritySource = null;
    review.authorityTaxonId = null;
    review.rank = null;
    review.genus = null;
    review.family = null;
    review.evidenceChecks = {
      ...(review.evidenceChecks as Record<string, unknown>),
      specialRankOrCultivar: true,
    };

    const result = validateReviewBatch({
      batch: { reviews: [review] },
      evidenceRecords: [evidence],
      legacyRecords: [legacyRecord()],
      startIndex: 0,
      endIndex: 0,
    });

    expect(result).toEqual({ valid: true, errors: [] });
  });
});
