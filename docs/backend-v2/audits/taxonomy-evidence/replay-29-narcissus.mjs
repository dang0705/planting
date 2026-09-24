#!/usr/bin/env node
/**
 * P1 来源记录 29 分类证据的离线回放器。
 *
 * 该工具只读取调用者显式提供的 WCVP/WFO 制品、解出表和此审计证据 JSON，并将验证摘要写到
 * stdout；不访问网络，不自动使用 /tmp，不写入仓库、CMS、MySQL、seed、manifest 或 active。
 * 即使所有来源校验通过，结果也只是“证据回放通过”，不会替负责人批准分类身份或中文名。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const TARGET_SCIENTIFIC_NAME = "Narcissus tazetta subsp. chinensis";
const TARGET_RANK = "subspecies";
const WCVP_REQUIRED_COLUMNS = 18;
const WFO_TAXON_REQUIRED_COLUMNS = 11;
const WFO_NAME_REQUIRED_COLUMNS = 15;
const WFO_SYNONYM_REQUIRED_COLUMNS = 6;
const HASH_BUFFER_BYTES = 64 * 1024;

const EXPECTED_WCVP_CHAIN = [
  { taxonId: "282547", scientificName: "Narcissus", rank: "Genus", parentTaxonId: null, scientificNameId: "ipni:1558-1" },
  { taxonId: "282289", scientificName: "Narcissus tazetta", rank: "Species", parentTaxonId: "282547", scientificNameId: "ipni:66240-1" },
  { taxonId: "310501", scientificName: TARGET_SCIENTIFIC_NAME, rank: "Subspecies", parentTaxonId: "282289", scientificNameId: "ipni:77189681-1" },
];

const EXPECTED_WFO_CHAIN = [
  { taxonId: "wfo-7000000018", scientificName: "Amaryllidaceae", rank: "family", parentTaxonId: "wfo-9000000036" },
  { taxonId: "wfo-4000025329", scientificName: "Narcissus", rank: "genus", parentTaxonId: "wfo-7000000018" },
  { taxonId: "wfo-0000700066", scientificName: "Narcissus tazetta", rank: "species", parentTaxonId: "wfo-4000025329" },
  { taxonId: "wfo-0000771854", scientificName: TARGET_SCIENTIFIC_NAME, rank: TARGET_RANK, parentTaxonId: "wfo-0000700066" },
];

/** 将不可满足的审计条件转成明确失败，禁止带着不完整证据继续。 */
function assertEvidence(condition, message) {
  if (!condition) { throw new Error(message); }
}

/** 对字段名做轻量归一，以兼容来源表中已知的大小写与下划线写法。 */
function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

/** 对一条分隔记录做带引号的解析；保留空列，拒绝不闭合引号。 */
function parseDelimitedRecord(record, delimiter) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    const character = record[index];
    if (character === '"') {
      if (quoted && record[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += character;
    }
  }
  assertEvidence(!quoted, "来源表记录包含未闭合引号，已拒绝回放");
  cells.push(value);
  return cells;
}

/** 判断完整分隔记录是否仍在引号字段中，供 WFO 多行字段安全拼接。 */
function hasUnclosedQuote(record) {
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    if (record[index] !== '"') { continue; }
    if (quoted && record[index + 1] === '"') { index += 1; continue; }
    quoted = !quoted;
  }
  return quoted;
}

/** 用固定缓冲区计算文件 SHA-256，不把大型来源表整体读入内存。 */
async function sha256File(filePath) {
  assertEvidence(typeof filePath === "string" && fs.existsSync(filePath), `输入文件不存在：${String(filePath)}`);
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath, { highWaterMark: HASH_BUFFER_BYTES });
  for await (const chunk of stream) { hash.update(chunk); }
  return hash.digest("hex");
}

/** 计算规范化的逐记录 SHA：逻辑记录内容使用 LF，并包含一个末尾 LF。 */
function sha256LogicalRecord(record) {
  return createHash("sha256").update(`${record.replaceAll(/\r\n?/gu, "\n")}\n`, "utf8").digest("hex");
}

/** 从解析后的记录按来源表头取值；缺失字段与空字段都保持为空字符串。 */
function cellValue(row, normalizedHeaders, aliases) {
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0 && row[index] !== undefined) { return String(row[index]).trim(); }
  }
  return "";
}

/**
 * 流式扫描来源表，只保留指定稳定 ID 的行，并在保留原始逻辑行文本的同时记录哈希。
 * 大表中未命中的记录不会转成对象或进入内存索引；`singlePhysicalLineRecords` 仅用于
 * SHA 已锁定且表格式已核验的 WCVP 发布表，避免对每条记录重复扫描引号状态。
 */
async function findSourceRows(filePath, delimiter, wantedIds, sourceName, expectedColumnCount, singlePhysicalLineRecords = false) {
  assertEvidence(typeof filePath === "string" && fs.existsSync(filePath), `${sourceName} 路径缺失或不存在`);
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  const found = new Map();
  let headers = null;
  let normalizedHeaders = null;
  let logicalRecord = "";
  let recordNumber = 0;

  for await (const line of lines) {
    if (line.length === 0 && logicalRecord.length === 0) { continue; }
    logicalRecord = logicalRecord.length === 0 ? line : `${logicalRecord}\n${line}`;
    if (!singlePhysicalLineRecords && hasUnclosedQuote(logicalRecord)) { continue; }
    recordNumber += 1;
    if (!headers) {
      headers = parseDelimitedRecord(logicalRecord.replace(/^\uFEFF/u, ""), delimiter);
      normalizedHeaders = headers.map(normalizeHeader);
      assertEvidence(headers.length === expectedColumnCount, `${sourceName} 表头列数不是预期的 ${expectedColumnCount}`);
      logicalRecord = "";
      continue;
    }

    const firstCell = logicalRecord.slice(0, logicalRecord.indexOf(delimiter));
    if (wantedIds.has(firstCell)) {
      const cells = parseDelimitedRecord(logicalRecord, delimiter);
      assertEvidence(cells.length === headers.length, `${sourceName} 记录列数与表头不一致`);
      if (found.has(firstCell)) { throw new Error(`${sourceName} 稳定 ID 重复：${firstCell}`); }
      found.set(firstCell, {
        cells,
        normalizedHeaders,
        recordSha256: sha256LogicalRecord(logicalRecord),
      });
    }
    logicalRecord = "";
  }

  assertEvidence(logicalRecord.length === 0, `${sourceName} 末尾存在未闭合的多行记录`);
  assertEvidence(headers !== null && recordNumber > 1, `${sourceName} 缺少表头或数据行`);
  for (const wantedId of wantedIds) {
    assertEvidence(found.has(wantedId), `${sourceName} 缺少稳定 ID ${wantedId} 的原始记录`);
  }
  return found;
}

/**
 * 校验 WFO 的目标接受名 ID 没有同时出现在异名映射表。
 * 仅逐行读取 nameID 列并在命中目标后立即失败，不保留全量异名索引。
 */
async function assertNamesNotMappedAsSynonyms(filePath, wantedNameIds) {
  assertEvidence(typeof filePath === "string" && fs.existsSync(filePath), "WFO synonym.tsv 路径缺失或不存在");
  const stream = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  let normalizedHeaders = null;
  let logicalRecord = "";
  let nameIdColumn = -1;

  for await (const line of lines) {
    if (line.length === 0 && logicalRecord.length === 0) { continue; }
    logicalRecord = logicalRecord.length === 0 ? line : `${logicalRecord}\n${line}`;
    if (hasUnclosedQuote(logicalRecord)) { continue; }
    if (!headers) {
      headers = parseDelimitedRecord(logicalRecord.replace(/^\uFEFF/u, ""), "\t");
      normalizedHeaders = headers.map(normalizeHeader);
      assertEvidence(headers.length === WFO_SYNONYM_REQUIRED_COLUMNS, "WFO synonym.tsv 表头列数不符合 2026-06 格式");
      nameIdColumn = normalizedHeaders.indexOf("nameid");
      assertEvidence(nameIdColumn >= 0, "WFO synonym.tsv 缺少 nameID 字段");
      logicalRecord = "";
      continue;
    }

    const cells = parseDelimitedRecord(logicalRecord, "\t");
    assertEvidence(cells.length === headers.length, "WFO synonym.tsv 记录列数与表头不一致");
    const nameId = String(cells[nameIdColumn] ?? "").trim();
    assertEvidence(!wantedNameIds.has(nameId), `WFO 目标接受名 ${nameId} 同时出现在 synonym.tsv 中`);
    logicalRecord = "";
  }

  assertEvidence(logicalRecord.length === 0, "WFO synonym.tsv 末尾存在未闭合的多行记录");
  assertEvidence(headers !== null, "WFO synonym.tsv 缺少表头");
}

/** 读取小型证据 JSON，拒绝静默接受格式错误或缺失。 */
function readEvidence(evidencePath) {
  assertEvidence(typeof evidencePath === "string" && fs.existsSync(evidencePath), "证据 JSON 路径缺失或不存在");
  try {
    return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (error) {
    throw new Error(`证据 JSON 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 验证证据包中固定的目标、中文名待定门与禁止准入状态。 */
function verifyEvidenceEnvelope(evidence) {
  assertEvidence(evidence?.schemaVersion === "qinghuazhi.taxonomy-identity-evidence/v1", "证据包 schemaVersion 不支持");
  assertEvidence(evidence?.scope?.sourceRecordNumber === 29, "证据包不是来源记录 29");
  assertEvidence(evidence?.scope?.targetScientificName === TARGET_SCIENTIFIC_NAME, "证据包目标学名与已批准候选不符");
  assertEvidence(evidence?.scope?.targetRank === TARGET_RANK, "证据包目标分类等级不符");
  assertEvidence(evidence?.scope?.canonicalDisplayNameZh?.status === "PENDING_OWNER_SELECTION", "规范中文展示名必须保持待负责人选择");
  assertEvidence(!Object.hasOwn(evidence.scope.canonicalDisplayNameZh, "value"), "规范中文展示名不得在本证据包中预填");
  assertEvidence(evidence?.scope?.classificationDecision === "EVIDENCE_CANDIDATE_NOT_APPROVED", "来源证据不得代替人工分类批准");
  assertEvidence(evidence?.scope?.mayEnterSeed === false && evidence?.scope?.mayActivate === false, "来源证据不得开放 seed 或 active 准入");
  assertEvidence(evidence?.sources?.wcvp?.datasetVersion === "16.0", "证据包必须锁定 WCVP 16.0");
  assertEvidence(evidence?.sources?.wcvp?.publishedDate === "2026-06-04", "证据包必须锁定 WCVP 2026-06-04 发布批次");
  assertEvidence(evidence?.sources?.wfo?.datasetVersion === "2026-06", "证据包必须锁定 WFO 2026-06");
  assertEvidence(evidence?.sources?.wfo?.zenodoRecordId === 20782718, "证据包 WFO Zenodo 发布号不匹配");
  assertEvidence(evidence?.sources?.wfo?.license?.name === "CC0 1.0 Universal", "WFO 分类骨干许可标注不匹配");
  assertEvidence(evidence?.sources?.iplantChineseNameReview?.candidateNameLiteralsStored === false, "iPlant 中文名原文未获复用许可，不得复制字面值");
  assertEvidence(evidence?.sources?.iplantChineseNameReview?.retainedPageBody === false, "不得留存许可未明的 iPlant 页面正文");
  assertEvidence(evidence?.sources?.iplantChineseNameReview?.retainedScreenshot === false, "不得留存许可未明的 iPlant 页面截图");
}

/**
 * 根据显式表路径回放记录 29 的 WCVP 与 WFO 原始分类关系；此函数不读取压缩包元数据。
 * 完整来源包完整性由 `verifyFullSourcePackages` 先行验证，Vitest 通过最小许可原始记录验证本函数。
 */
export async function verifyIdentityRows({ evidencePath, wcvpTaxonPath, wfoTaxonPath, wfoNamePath, wfoSynonymPath }) {
  const evidence = readEvidence(evidencePath);
  verifyEvidenceEnvelope(evidence);

  const wcvpRecords = evidence.sources.wcvp.records;
  const wfoRecords = evidence.sources.wfo.records;
  assertEvidence(Array.isArray(wcvpRecords) && wcvpRecords.length === EXPECTED_WCVP_CHAIN.length, "WCVP 记录列表长度不符合目标链");
  assertEvidence(Array.isArray(wfoRecords) && wfoRecords.length === EXPECTED_WFO_CHAIN.length, "WFO 记录列表长度不符合科→属→种→亚种链");

  const wcvpById = await findSourceRows(
    wcvpTaxonPath,
    "|",
    new Set(EXPECTED_WCVP_CHAIN.map((item) => item.taxonId)),
    "WCVP taxon.csv",
    WCVP_REQUIRED_COLUMNS,
    true,
  );
  const wfoTaxonById = await findSourceRows(
    wfoTaxonPath,
    "\t",
    new Set(EXPECTED_WFO_CHAIN.map((item) => item.taxonId)),
    "WFO taxon.tsv",
    WFO_TAXON_REQUIRED_COLUMNS,
  );
  const wfoNameById = await findSourceRows(
    wfoNamePath,
    "\t",
    new Set(EXPECTED_WFO_CHAIN.map((item) => item.taxonId)),
    "WFO name.tsv",
    WFO_NAME_REQUIRED_COLUMNS,
  );
  await assertNamesNotMappedAsSynonyms(wfoSynonymPath, new Set(EXPECTED_WFO_CHAIN.map((item) => item.taxonId)));

  const replayedWcvpChain = EXPECTED_WCVP_CHAIN.map((expected) => {
    const sourceRecord = wcvpById.get(expected.taxonId);
    const sourceData = sourceRecord.cells;
    const actual = {
      taxonId: cellValue(sourceData, sourceRecord.normalizedHeaders, ["taxonid"]),
      scientificName: cellValue(sourceData, sourceRecord.normalizedHeaders, ["scientificname", "scientfiicname"]),
      rank: cellValue(sourceData, sourceRecord.normalizedHeaders, ["taxonrank"]),
      status: cellValue(sourceData, sourceRecord.normalizedHeaders, ["taxonomicstatus"]),
      acceptedTaxonId: cellValue(sourceData, sourceRecord.normalizedHeaders, ["acceptednameusageid"]),
      parentTaxonId: cellValue(sourceData, sourceRecord.normalizedHeaders, ["parentnameusageid"]) || null,
      scientificNameId: cellValue(sourceData, sourceRecord.normalizedHeaders, ["scientificnameid"]),
      familyLabel: cellValue(sourceData, sourceRecord.normalizedHeaders, ["family"]),
      recordSha256: sourceRecord.recordSha256,
    };
    const evidenceRecord = wcvpRecords.find((item) => item.taxonId === expected.taxonId);
    assertEvidence(evidenceRecord, `证据包缺少 WCVP ${expected.rank} 节点 ${expected.taxonId}`);
    assertEvidence(actual.recordSha256 === evidenceRecord.recordSha256, `WCVP ${expected.taxonId} 记录 SHA-256 不匹配`);
    assertEvidence(actual.taxonId === expected.taxonId, `WCVP ${expected.taxonId} 行主键读取不一致`);
    assertEvidence(actual.scientificName === expected.scientificName, `WCVP ${expected.taxonId} 学名不匹配`);
    assertEvidence(actual.rank === expected.rank, `WCVP ${expected.taxonId} 等级不匹配`);
    assertEvidence(actual.status === "Accepted", `WCVP ${expected.taxonId} 不是接受名`);
    assertEvidence(actual.acceptedTaxonId === expected.taxonId, `WCVP ${expected.taxonId} 接受名 ID 不匹配`);
    assertEvidence(actual.parentTaxonId === expected.parentTaxonId, `WCVP ${expected.taxonId} 父级 ID 不匹配`);
    assertEvidence(actual.scientificNameId === expected.scientificNameId, `WCVP ${expected.taxonId} 命名学标识不匹配`);
    assertEvidence(actual.familyLabel === "Amaryllidaceae", `WCVP ${expected.taxonId} 科名字段不匹配`);
    assertEvidence(evidenceRecord.scientificName === actual.scientificName && evidenceRecord.rank === actual.rank, `WCVP ${expected.taxonId} 证据摘要字段不匹配`);
    assertEvidence(evidenceRecord.status === actual.status && evidenceRecord.acceptedTaxonId === actual.acceptedTaxonId, `WCVP ${expected.taxonId} 接受状态摘要字段不匹配`);
    assertEvidence((evidenceRecord.parentTaxonId ?? null) === actual.parentTaxonId, `WCVP ${expected.taxonId} 父级摘要字段不匹配`);
    assertEvidence(evidenceRecord.scientificNameId === actual.scientificNameId && evidenceRecord.familyLabel === actual.familyLabel, `WCVP ${expected.taxonId} 来源标识/科名摘要字段不匹配`);
    return {
      rank: expected.rank.toLowerCase(),
      name: actual.scientificName,
      authorityTaxonId: actual.taxonId,
      parentAuthorityTaxonId: actual.parentTaxonId,
    };
  });

  const replayedWfoChain = EXPECTED_WFO_CHAIN.map((expected) => {
    const taxonRecord = wfoTaxonById.get(expected.taxonId);
    const nameRecord = wfoNameById.get(expected.taxonId);
    const taxonData = taxonRecord.cells;
    const nameData = nameRecord.cells;
    const actual = {
      taxonId: cellValue(taxonData, taxonRecord.normalizedHeaders, ["id"]),
      nameId: cellValue(taxonData, taxonRecord.normalizedHeaders, ["nameid"]),
      parentTaxonId: cellValue(taxonData, taxonRecord.normalizedHeaders, ["parentid"]),
      nameRecordId: cellValue(nameData, nameRecord.normalizedHeaders, ["id"]),
      scientificName: cellValue(nameData, nameRecord.normalizedHeaders, ["scientificname"]),
      rank: cellValue(nameData, nameRecord.normalizedHeaders, ["rank"]).toLowerCase(),
      taxonRecordSha256: taxonRecord.recordSha256,
      nameRecordSha256: nameRecord.recordSha256,
    };
    const evidenceRecord = wfoRecords.find((item) => item.taxonId === expected.taxonId);
    assertEvidence(evidenceRecord, `证据包缺少 WFO ${expected.rank} 节点 ${expected.taxonId}`);
    assertEvidence(actual.taxonRecordSha256 === evidenceRecord.taxonRecordSha256, `WFO ${expected.taxonId} taxon 行 SHA-256 不匹配`);
    assertEvidence(actual.nameRecordSha256 === evidenceRecord.nameRecordSha256, `WFO ${expected.taxonId} name 行 SHA-256 不匹配`);
    assertEvidence(actual.taxonId === expected.taxonId && actual.nameId === expected.taxonId && actual.nameRecordId === expected.taxonId, `WFO ${expected.taxonId} taxon/name 主键链不匹配`);
    assertEvidence(actual.parentTaxonId === expected.parentTaxonId, `WFO ${expected.taxonId} 父级 ID 不匹配`);
    assertEvidence(actual.scientificName === expected.scientificName, `WFO ${expected.taxonId} 学名不匹配`);
    assertEvidence(actual.rank === expected.rank, `WFO ${expected.taxonId} 等级不匹配`);
    assertEvidence(evidenceRecord.nameId === actual.nameId, `WFO ${expected.taxonId} 证据包 nameID 摘要不匹配`);
    assertEvidence(evidenceRecord.parentTaxonId === actual.parentTaxonId, `WFO ${expected.taxonId} 证据包父级摘要不匹配`);
    assertEvidence(evidenceRecord.scientificName === actual.scientificName && evidenceRecord.rank === actual.rank, `WFO ${expected.taxonId} 证据包名称摘要不匹配`);
    return {
      rank: expected.rank,
      name: actual.scientificName,
      authorityTaxonId: actual.taxonId,
      parentAuthorityTaxonId: actual.parentTaxonId || null,
    };
  });

  const declaredEdges = evidence.hierarchy.edges;
  assertEvidence(Array.isArray(declaredEdges) && declaredEdges.length === EXPECTED_WFO_CHAIN.length - 1, "证据包缺少逐边父级关系");
  const declaredNodes = evidence.hierarchy.nodes;
  assertEvidence(Array.isArray(declaredNodes) && declaredNodes.length === replayedWfoChain.length, "证据包分类节点数量不符合科→属→种→亚种链");
  for (let index = 0; index < replayedWfoChain.length; index += 1) {
    const actualNode = replayedWfoChain[index];
    const declaredNode = declaredNodes[index];
    assertEvidence(
      declaredNode?.rank === actualNode.rank && declaredNode?.name === actualNode.name && declaredNode?.authorityTaxonId === actualNode.authorityTaxonId,
      `证据包 ${actualNode.rank} 节点与 WFO 原始记录不一致`,
    );
    assertEvidence(declaredNode?.source === "WFO", `证据包 ${actualNode.rank} 节点来源不符合已锁版本`);
  }
  for (let index = 1; index < replayedWfoChain.length; index += 1) {
    const child = replayedWfoChain[index];
    const parent = replayedWfoChain[index - 1];
    assertEvidence(child.parentAuthorityTaxonId === parent.authorityTaxonId, `WFO ${child.rank} 父链未连接到上一级 ${parent.rank}`);
    const edge = declaredEdges.find((item) => item.childTaxonId === child.authorityTaxonId);
    assertEvidence(edge, `证据包缺少 ${child.rank}→${parent.rank} 父级边`);
    assertEvidence(
      edge.childRank === child.rank && edge.parentRank === parent.rank && edge.parentTaxonId === parent.authorityTaxonId
        && edge.recordSha256 === wfoTaxonById.get(child.authorityTaxonId).recordSha256,
      `证据包 ${child.rank}→${parent.rank} 边与 WFO 原始行不一致`,
    );
  }

  return {
    verified: true,
    classificationDecision: evidence.scope.classificationDecision,
    mayEnterSeed: evidence.scope.mayEnterSeed,
    mayActivate: evidence.scope.mayActivate,
    canonicalDisplayNameStatus: evidence.scope.canonicalDisplayNameZh.status,
    synonymExclusionPassed: true,
    hierarchy: replayedWfoChain,
    wcvpChain: replayedWcvpChain,
    wcvpFamilyLabel: "Amaryllidaceae",
  };
}

/** 检查命令行显式输入，拒绝缺少、重复或未知参数。 */
function parseArguments(argv) {
  if (argv.includes("--help") || argv.includes("-h")) { return { help: true }; }
  const argumentsByName = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    assertEvidence(key.startsWith("--"), `不支持的位置参数：${key}`);
    assertEvidence(index + 1 < argv.length && !argv[index + 1].startsWith("--"), `参数 ${key} 缺少路径值`);
    assertEvidence(!argumentsByName.has(key), `参数 ${key} 不得重复`);
    argumentsByName.set(key, argv[index + 1]);
    index += 1;
  }
  const requiredKeys = [
    "--evidence", "--wcvp-archive", "--wcvp-taxon", "--wcvp-eml",
    "--wfo-archive", "--wfo-taxon", "--wfo-name", "--wfo-release",
    "--wfo-synonym",
  ];
  for (const key of requiredKeys) { assertEvidence(argumentsByName.has(key), `缺少必填显式路径参数 ${key}`); }
  const allowedKeys = new Set(requiredKeys);
  for (const key of argumentsByName.keys()) { assertEvidence(allowedKeys.has(key), `未知参数：${key}`); }
  return {
    help: false,
    evidencePath: argumentsByName.get("--evidence"),
    wcvpArchivePath: argumentsByName.get("--wcvp-archive"),
    wcvpTaxonPath: argumentsByName.get("--wcvp-taxon"),
    wcvpEmlPath: argumentsByName.get("--wcvp-eml"),
    wfoArchivePath: argumentsByName.get("--wfo-archive"),
    wfoTaxonPath: argumentsByName.get("--wfo-taxon"),
    wfoNamePath: argumentsByName.get("--wfo-name"),
    wfoSynonymPath: argumentsByName.get("--wfo-synonym"),
    wfoReleasePath: argumentsByName.get("--wfo-release"),
  };
}

/** 按明确输入执行只读命令，并验证文件 SHA、压缩包 entry 和许可/版本元数据。 */
async function verifyFullSourcePackages(options) {
  const evidence = readEvidence(options.evidencePath);
  verifyEvidenceEnvelope(evidence);
  const wcvp = evidence.sources.wcvp;
  const wfo = evidence.sources.wfo;
  for (const entry of ["wcvp_taxon.csv", "eml.xml"]) {
    assertEvidence(wcvp.archive.requiredEntries.includes(entry), `WCVP 证据包缺少必需 entry ${entry}`);
  }
  for (const entry of ["taxon.tsv", "name.tsv", "synonym.tsv"]) {
    assertEvidence(wfo.archive.requiredEntries.includes(entry), `WFO 证据包缺少必需 entry ${entry}`);
  }
  const wfoTaxonTable = wfo.tables.find((item) => item.entry === "taxon.tsv");
  const wfoNameTable = wfo.tables.find((item) => item.entry === "name.tsv");
  const wfoSynonymTable = wfo.tables.find((item) => item.entry === "synonym.tsv");
  assertEvidence(wfoTaxonTable && wfoNameTable && wfoSynonymTable, "WFO 证据包缺少 taxon/name/synonym 表哈希");
  const expectedFiles = [
    ["WCVP archive", options.wcvpArchivePath, wcvp.archive.sha256],
    ["WCVP taxon table", options.wcvpTaxonPath, wcvp.taxonTable.sha256],
    ["WCVP EML", options.wcvpEmlPath, wcvp.eml.sha256],
    ["WFO archive", options.wfoArchivePath, wfo.archive.sha256],
    ["WFO taxon table", options.wfoTaxonPath, wfoTaxonTable.sha256],
    ["WFO name table", options.wfoNamePath, wfoNameTable.sha256],
    ["WFO synonym table", options.wfoSynonymPath, wfoSynonymTable.sha256],
    ["WFO release metadata", options.wfoReleasePath, wfo.releaseMetadata.sha256],
  ];
  for (const [label, filePath, expectedHash] of expectedFiles) {
    const actualHash = await sha256File(filePath);
    assertEvidence(actualHash === expectedHash, `${label} SHA-256 不匹配；停止回放`);
  }

  const wcvpEntries = execFileSync("unzip", ["-Z1", options.wcvpArchivePath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/u);
  for (const entry of wcvp.archive.requiredEntries) { assertEvidence(wcvpEntries.includes(entry), `WCVP archive 缺少指定 entry ${entry}`); }
  const wfoEntries = execFileSync("unzip", ["-Z1", options.wfoArchivePath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/u);
  for (const entry of wfo.archive.requiredEntries) { assertEvidence(wfoEntries.includes(entry), `WFO archive 缺少指定 entry ${entry}`); }

  const eml = fs.readFileSync(options.wcvpEmlPath, "utf8");
  const publishedDate = eml.match(/<pubDate>([^<]+)<\/pubDate>/u)?.[1];
  const datasetVersion = eml.match(/<version>([^<]+)<\/version>/u)?.[1];
  assertEvidence(publishedDate === wcvp.publishedDate, "WCVP EML 发布日期与证据包版本不一致");
  assertEvidence(datasetVersion === wcvp.datasetVersion, "WCVP EML 数据版本与证据包不一致");
  assertEvidence(/CC BY 3\.0/iu.test(eml), "WCVP EML 未声明 CC BY 3.0，拒绝按此许可复用");

  const release = JSON.parse(fs.readFileSync(options.wfoReleasePath, "utf8"));
  const releaseFile = release.files?.find((item) => item.key === wfo.releaseMetadata.archiveFileName);
  assertEvidence(release.id === wfo.zenodoRecordId, "WFO Zenodo 记录 ID 不匹配");
  assertEvidence(release.metadata?.license?.id === "cc-zero", "WFO 发布元数据未声明 cc-zero");
  assertEvidence(String(release.metadata?.title ?? "").includes("June 2026"), "WFO 发布标题与 2026-06（June 2026）版本不匹配");
  assertEvidence(releaseFile?.size === wfo.releaseMetadata.archiveSizeBytes, "WFO 发布包大小与原始元数据不一致");
  assertEvidence(releaseFile?.checksum === `md5:${wfo.releaseMetadata.archiveMd5}`, "WFO 发布包 MD5 与原始元数据不一致");

  return verifyIdentityRows({
    evidencePath: options.evidencePath,
    wcvpTaxonPath: options.wcvpTaxonPath,
    wfoTaxonPath: options.wfoTaxonPath,
    wfoNamePath: options.wfoNamePath,
    wfoSynonymPath: options.wfoSynonymPath,
  });
}

/** 显示路径显式、离线回放命令；模板没有可被误认为权威来源的默认目录。 */
function printHelp() {
  process.stdout.write([
    "P1 来源记录 29 分类证据回放（离线、只读、不准入）",
    "必填路径：--evidence --wcvp-archive --wcvp-taxon --wcvp-eml --wfo-archive --wfo-taxon --wfo-name --wfo-synonym --wfo-release",
    "示例：node replay-29-narcissus.mjs --evidence <证据JSON> --wcvp-archive <官方WCVP.zip> --wcvp-taxon <解出wcvp_taxon.csv> --wcvp-eml <解出eml.xml> --wfo-archive <官方WFO.zip> --wfo-taxon <解出taxon.tsv> --wfo-name <解出name.tsv> --wfo-synonym <解出synonym.tsv> --wfo-release <Zenodo原始API响应JSON>",
    "网络获取、解压和 SHA 核验须在调用前由操作者显式执行；本工具不下载、不解压写盘、不使用默认 /tmp 路径。",
  ].join("\n") + "\n");
}

/** CLI 入口；导入本模块供 Vitest 时不执行命令行。 */
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const result = await verifyFullSourcePackages(options);
  process.stdout.write(`${JSON.stringify({
    replayStatus: "PASS",
    evidenceId: "p1-taxonomy-source-record-29",
    classificationDecision: result.classificationDecision,
    mayEnterSeed: result.mayEnterSeed,
    mayActivate: result.mayActivate,
    canonicalDisplayNameStatus: result.canonicalDisplayNameStatus,
    hierarchy: result.hierarchy,
    wcvpChain: result.wcvpChain,
    wcvpFamilyLabel: result.wcvpFamilyLabel,
    scopeNoteZh: "只证明本地指定来源制品与分类记录一致；不是人工准入或中文规范名批准。",
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`证据回放失败：${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
