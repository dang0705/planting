/**
 * 校验 P1 植物分类人工裁决批次。
 *
 * 本模块只核对批次完整性和“提出准入”的必要条件；它不能替代分类学专家判断，
 * 也不会生成或发布 active release。
 */

const REVIEW_DECISIONS = new Set([
  "ADMIT_AS_ACCEPTED",
  "TRANSFORM_TO_ACCEPTED",
  "QUARANTINE",
]);

const MACHINE_CONFLICT_REASONS = new Set([
  "ICRA_EVIDENCE_MISSING",
  "WCVP_EXACT_MATCH_AMBIGUOUS",
  "WFO_EXACT_MATCH_AMBIGUOUS",
  "WCVP_EXACT_MATCH_MISSING",
  "WFO_EXACT_MATCH_MISSING",
  "WCVP_WFO_ACCEPTED_OR_RANK_CONFLICT",
  "WCVP_STATUS_UNSUPPORTED",
  "WCVP_ACCEPTED_TARGET_MISSING",
]);

function textEquals(left, right) {
  return typeof left === "string" && typeof right === "string" && left === right;
}

function lower(value) {
  return typeof value === "string" ? value.toLowerCase() : null;
}

function hasMachineConflict(evidence) {
  return (evidence.decisionReasons ?? []).some((reason) =>
    MACHINE_CONFLICT_REASONS.has(reason),
  );
}

function hasWcvpMatchProblem(evidence) {
  const reasons = new Set(evidence.decisionReasons ?? []);
  return [
    "WCVP_EXACT_MATCH_AMBIGUOUS",
    "WCVP_EXACT_MATCH_MISSING",
  ].some((reason) => reasons.has(reason));
}

function isSpecialRecord(evidence) {
  const name = typeof evidence.rawScientificName === "string"
    ? evidence.rawScientificName
    : "";
  const hasInfraspecificMarker = /\s(?:subsp\.|ssp\.|var\.|f\.)\s/i.test(name);
  return (
    evidence.parsedKind !== "species" ||
    evidence.cultivar !== null ||
    hasInfraspecificMarker
  );
}

function acceptedAuthorityTaxonId(evidence) {
  const wcvp = evidence.wcvp;
  if (!wcvp) return null;
  if (wcvp.taxonomicStatus === "Accepted") return wcvp.taxonId;
  if (wcvp.taxonomicStatus !== "Synonym") return null;
  const acceptedNode = Array.isArray(wcvp.parentChain)
    ? wcvp.parentChain[0]
    : null;
  return acceptedNode?.taxonId ?? null;
}

function authorityPairMatches(evidence) {
  const wcvp = evidence.wcvp;
  const wfo = evidence.wfo;
  return Boolean(
    wcvp &&
      wfo &&
      wfo.crossCheck === "MATCH" &&
      textEquals(wcvp.acceptedScientificName, wfo.acceptedScientificName) &&
      lower(wcvp.rank) === lower(wfo.rank) &&
      textEquals(wcvp.genus, wfo.genus) &&
      textEquals(wcvp.family, wfo.family),
  );
}

function requiredText(record, field, prefix, errors) {
  if (typeof record[field] !== "string" || record[field].trim() === "") {
    errors.push(`${prefix} 缺少 ${field}`);
  }
}

/**
 * @param {{batch: {reviews: Array<Record<string, unknown>>}, evidenceRecords: Array<Record<string, unknown>>, legacyRecords: Array<Record<string, unknown>>, startIndex: number, endIndex: number}} input
 * @returns {{valid: boolean, errors: string[]}}
 */
export function validateReviewBatch(input) {
  const { batch, evidenceRecords, legacyRecords, startIndex, endIndex } = input;
  const errors = [];
  const reviews = Array.isArray(batch?.reviews) ? batch.reviews : [];
  const expectedCount = endIndex - startIndex + 1;
  const legacyById = new Map(
    legacyRecords.map((record) => [String(record.sourceRecordId), record]),
  );

  if (reviews.length !== expectedCount) {
    errors.push(`批次应有 ${expectedCount} 条，实际 ${reviews.length} 条`);
  }

  const seenIndexes = new Set();
  const seenIds = new Set();
  for (let offset = 0; offset < reviews.length; offset += 1) {
    const review = reviews[offset];
    const expectedIndex = startIndex + offset;
    const prefix = `第 ${offset + 1} 条`;
    const evidence = evidenceRecords[expectedIndex];
    const sourceId = String(review.sourceRecordId ?? "");
    const legacy = legacyById.get(sourceId);

    if (review.manifestIndex !== expectedIndex) {
      errors.push(`${prefix} manifest 下标应为 ${expectedIndex}`);
    }
    if (seenIndexes.has(review.manifestIndex)) {
      errors.push(`${prefix} manifest 下标重复`);
    }
    seenIndexes.add(review.manifestIndex);
    if (seenIds.has(sourceId)) errors.push(`${prefix} sourceRecordId 重复`);
    seenIds.add(sourceId);

    if (!evidence) {
      errors.push(`${prefix} 找不到权威回放记录`);
      continue;
    }
    if (sourceId !== String(evidence.sourceRecordId)) {
      errors.push(`${prefix} sourceRecordId 与权威回放不一致`);
    }
    if (review.sourceLineSha256 !== evidence.sourceLineSha256) {
      errors.push(`${prefix} 来源行 SHA 与权威回放不一致`);
    }
    if (review.rawScientificName !== evidence.rawScientificName) {
      errors.push(`${prefix} 原始学名与权威回放不一致`);
    }
    if (!legacy) {
      errors.push(`${prefix} 找不到遗留参考记录`);
      continue;
    }
    if (review.legacyDisplayNameZh !== legacy.legacyReference?.displayNameZh) {
      errors.push(`${prefix} 中文展示名与遗留参考不一致`);
    }
    if (legacy.legacyReference?.legacyRowSha256 !== evidence.sourceLineSha256) {
      errors.push(`${prefix} 遗留行 SHA 与权威回放不一致`);
    }

    if (!REVIEW_DECISIONS.has(review.reviewDecision)) {
      errors.push(`${prefix} reviewDecision 非法`);
    }
    if (!Array.isArray(review.decisionReasons) || review.decisionReasons.length === 0) {
      errors.push(`${prefix} 必须给出具体裁决原因`);
    }
    requiredText(review, "reviewerAgent", prefix, errors);
    requiredText(review, "reviewedAt", prefix, errors);
    const checks = review.evidenceChecks;
    if (!checks || typeof checks !== "object") {
      errors.push(`${prefix} 缺少逐项 evidenceChecks`);
      continue;
    }

    const wcvp = evidence.wcvp;
    const expectedPairMatch = authorityPairMatches(evidence);
    const expectedLegacyGenusMatch = Boolean(
      wcvp && textEquals(legacy.legacyReference?.genusName, wcvp.genus),
    );
    const expectedLegacyFamilyMatch = Boolean(
      wcvp && textEquals(legacy.legacyReference?.familyNameCanonical, wcvp.family),
    );
    const expectedSpecial = isSpecialRecord(evidence);
    const expectedConflict = hasMachineConflict(evidence) || Boolean(legacy.duplicateGroup);

    if (checks.wcvpExactUnambiguous !== Boolean(wcvp && !hasWcvpMatchProblem(evidence))) {
      errors.push(`${prefix} WCVP 唯一匹配检查与原始证据不一致`);
    }
    if (checks.wfoCrossCheckMatch !== expectedPairMatch) {
      errors.push(`${prefix} WFO 交叉核对检查与原始证据不一致`);
    }
    if (checks.legacyGenusMatches !== expectedLegacyGenusMatch) {
      errors.push(`${prefix} 遗留属名检查与原始证据不一致`);
    }
    if (checks.legacyFamilyMatches !== expectedLegacyFamilyMatch) {
      errors.push(`${prefix} 遗留科名检查与原始证据不一致`);
    }
    if (checks.specialRankOrCultivar !== expectedSpecial) {
      errors.push(`${prefix} 特殊等级或栽培品种检查与原始证据不一致`);
    }
    if (checks.unresolvedConflict !== expectedConflict) {
      errors.push(`${prefix} 未裁决冲突检查与原始证据不一致`);
    }

    if (review.reviewDecision === "QUARANTINE") continue;

    if (expectedSpecial) errors.push(`${prefix} 特殊等级或栽培品种不能直接准入`);
    if (hasMachineConflict(evidence)) errors.push(`${prefix} 存在歧义或来源冲突，不能准入`);
    if (legacy.duplicateGroup) errors.push(`${prefix} 重复科学名尚未裁决，不能准入`);
    if (!expectedPairMatch) errors.push(`${prefix} WCVP/WFO 未形成一致证据，不能准入`);
    if (!wcvp) {
      errors.push(`${prefix} 缺少 WCVP 权威记录`);
      continue;
    }
    if (
      review.authoritySource !== "WCVP" ||
      review.authorityTaxonId !== acceptedAuthorityTaxonId(evidence)
    ) {
      errors.push(`${prefix} 权威来源或稳定标识与 WCVP 不一致`);
    }
    if (
      review.acceptedScientificName !== wcvp.acceptedScientificName ||
      lower(review.rank) !== lower(wcvp.rank) ||
      review.genus !== wcvp.genus ||
      review.family !== wcvp.family
    ) {
      errors.push(`${prefix} 提议准入字段与 WCVP 接受名事实不一致`);
    }

    if (review.reviewDecision === "ADMIT_AS_ACCEPTED") {
      if (wcvp.taxonomicStatus !== "Accepted") {
        errors.push(`${prefix} 非 Accepted 记录不能按接受名直接准入`);
      }
      if (!expectedLegacyGenusMatch || !expectedLegacyFamilyMatch) {
        errors.push(`${prefix} 遗留属或科不一致，只能转换或隔离`);
      }
    }

    if (review.reviewDecision === "TRANSFORM_TO_ACCEPTED") {
      if (wcvp.taxonomicStatus !== "Synonym") {
        errors.push(`${prefix} 只有权威异名记录可提出转换`);
      }
      if (wcvp.acceptedScientificName === evidence.rawScientificName) {
        errors.push(`${prefix} 异名转换前后名称不能相同`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
