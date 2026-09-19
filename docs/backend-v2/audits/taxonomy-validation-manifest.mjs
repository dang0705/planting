import { createHash } from "node:crypto";

import { validateReviewBatch } from "./taxonomy-review-validator.mjs";

const RECOMMENDATION_TO_DISPOSITION = Object.freeze({
  ADMIT_AS_ACCEPTED: "REUSE_AS_IS",
  TRANSFORM_TO_ACCEPTED: "TRANSFORM",
  QUARANTINE: "QUARANTINE",
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function sha256Json(value) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)))
    .digest("hex");
}

function requireSha256(value, label) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error(`${label} 必须是 64 位小写 SHA-256`);
  }
}

/**
 * 把四批代理审核建议合并为唯一验证清单。
 *
 * 代理只能提出准入或转换建议；需要人工批准的记录在批准前继续保持 QUARANTINE，
 * 因而不会提前进入种子或 active release。
 */
export function buildPlantIdentityValidationManifest(input) {
  const {
    sourceSnapshotSha256,
    authorityEvidenceManifestSha256,
    evidenceRecords,
    legacyRecords,
    validatedReviews,
    humanApprovals = [],
    reviewArtifacts = [],
    generatedAt,
  } = input;

  requireSha256(sourceSnapshotSha256, "遗留输入快照");
  requireSha256(authorityEvidenceManifestSha256, "权威证据清单");
  if (!Array.isArray(evidenceRecords) || evidenceRecords.length === 0) {
    throw new Error("权威回放记录缺失");
  }
  if (!Array.isArray(validatedReviews)) throw new Error("裁决清单缺失");

  const validation = validateReviewBatch({
    batch: { reviews: validatedReviews },
    evidenceRecords,
    legacyRecords,
    startIndex: 0,
    endIndex: evidenceRecords.length - 1,
  });
  if (!validation.valid) {
    throw new Error(`裁决清单不完整、非连续、重复或缺失：${validation.errors.join("；")}`);
  }

  const approvalsById = new Map();
  for (const approval of humanApprovals) {
    const sourceId = String(approval.sourceRecordId ?? "");
    if (approvalsById.has(sourceId)) {
      throw new Error(`人工批准 sourceRecordId=${sourceId} 重复`);
    }
    if (
      typeof approval.reviewerRef !== "string" ||
      approval.reviewerRef.trim() === "" ||
      typeof approval.reviewedAt !== "string" ||
      approval.reviewedAt.trim() === ""
    ) {
      throw new Error(`人工批准 sourceRecordId=${sourceId} 缺少审核主体或时间`);
    }
    approvalsById.set(sourceId, approval);
  }

  const legacyById = new Map(
    legacyRecords.map((record) => [String(record.sourceRecordId), record]),
  );
  const records = validatedReviews.map((review, index) => {
    const evidence = evidenceRecords[index];
    const sourceId = String(review.sourceRecordId);
    const legacy = legacyById.get(sourceId);
    const recommendedDisposition = RECOMMENDATION_TO_DISPOSITION[review.reviewDecision];
    if (!recommendedDisposition) {
      throw new Error(`sourceRecordId=${sourceId} 的审核建议非法`);
    }
    const recommendationSha256 = sha256Json(review);
    const approval = approvalsById.get(sourceId) ?? null;
    let terminalDisposition = "QUARANTINE";
    let humanApprovalStatus = recommendedDisposition === "QUARANTINE"
      ? "NOT_REQUIRED_FOR_QUARANTINE"
      : "PENDING";

    if (approval) {
      if (recommendedDisposition === "QUARANTINE") {
        throw new Error(`sourceRecordId=${sourceId} 已隔离，不接受准入批准`);
      }
      if (approval.approvedDisposition !== recommendedDisposition) {
        throw new Error(`sourceRecordId=${sourceId} 的人工批准与代理建议不一致`);
      }
      terminalDisposition = recommendedDisposition;
      humanApprovalStatus = "APPROVED";
    }

    return {
      manifestIndex: index,
      sourceRecordId: sourceId,
      sourceLineSha256: evidence.sourceLineSha256,
      recommendedDisposition,
      terminalDisposition,
      humanApprovalStatus,
      humanApproval: approval
        ? {
            approvedDisposition: approval.approvedDisposition,
            reviewerRef: approval.reviewerRef,
            reviewedAt: approval.reviewedAt,
            boundRecommendationSha256: recommendationSha256,
          }
        : null,
      authorityEvidenceManifestIndex: index,
      authorityEvidenceRecordSha256: sha256Json(evidence),
      recommendationSha256,
    };
  });

  for (const sourceId of approvalsById.keys()) {
    if (!records.some((record) => record.sourceRecordId === sourceId)) {
      throw new Error(`人工批准引用了不存在的 sourceRecordId=${sourceId}`);
    }
  }

  const summary = {
    total: records.length,
    recommendedReuseAsIs: records.filter(
      (record) => record.recommendedDisposition === "REUSE_AS_IS",
    ).length,
    recommendedTransform: records.filter(
      (record) => record.recommendedDisposition === "TRANSFORM",
    ).length,
    recommendedQuarantine: records.filter(
      (record) => record.recommendedDisposition === "QUARANTINE",
    ).length,
    reuseAsIs: records.filter((record) => record.terminalDisposition === "REUSE_AS_IS")
      .length,
    transform: records.filter((record) => record.terminalDisposition === "TRANSFORM")
      .length,
    quarantine: records.filter((record) => record.terminalDisposition === "QUARANTINE")
      .length,
    seedEligible: records.filter((record) =>
      ["REUSE_AS_IS", "TRANSFORM"].includes(record.terminalDisposition),
    ).length,
    humanApprovalPending: records.filter(
      (record) => record.humanApprovalStatus === "PENDING",
    ).length,
  };

  const manifestWithoutHash = {
    manifestVersion: "plant-identity-validation-manifest/v1",
    generatedAt,
    sourceSnapshotSha256,
    authorityEvidenceManifestSha256,
    reviewPolicy: "docs/backend-v2/audits/taxonomy-review/README.md",
    reviewArtifacts,
    summary,
    records,
  };
  return {
    ...manifestWithoutHash,
    contentSha256: sha256Json(manifestWithoutHash),
  };
}
