#!/usr/bin/env node
/**
 * P1 来源记录 123 植物分类候选的离线证据回放器。
 *
 * 本工具只读取调用者显式指定的本地来源文件与固定证据 JSON，校验发布包摘要、逐行摘要、
 * 物种父级、来源接受状态和 WFO 异名边，并把结果写到标准输出。它不访问网络、不推导
 * 来源记录对应的植物身份、不批准中文名/seed/active，也不写 CMS、MySQL 或审批产物。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import readline from "node:readline";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

/** 当前离线回放固定的 WCVP/WFO 文件列数；不兼容变更必须显式更新证据版本。 */
const REQUIRED_COLUMN_COUNTS = Object.freeze({ wcvp: 18, wfoTaxon: 11, wfoName: 15, wfoSynonym: 6 });
/** 文件摘要使用固定缓冲区，避免把整份大型分类表放入内存。 */
const HASH_BUFFER_BYTES = 64 * 1024;
/** Kew/WCVP 证据应出现的属和两个独立接受种；不是来源业务身份映射。 */
const EXPECTED_WCVP = Object.freeze([
  { taxonId: "2835511", scientificName: "Gymnocalycium", rank: "Genus", parentTaxonId: null, scientificNameId: "ipni:30001559-2" },
  { taxonId: "2835702", scientificName: "Gymnocalycium mihanovichii", rank: "Species", parentTaxonId: "2835511", scientificNameId: "ipni:115434-2" },
  { taxonId: "2835856", scientificName: "Gymnocalycium stenopleurum", rank: "Species", parentTaxonId: "2835511", scientificNameId: "ipni:115502-2" },
]);
/** WFO 2026-06 中须存在的科属与两个 accepted taxon 实体。 */
const EXPECTED_WFO_TAXA = Object.freeze([
  { taxonId: "wfo-7000000098", scientificName: "Cactaceae", rank: "family" },
  { taxonId: "wfo-4000016452", scientificName: "Gymnocalycium", rank: "genus" },
  { taxonId: "wfo-0000712540", scientificName: "Gymnocalycium mihanovichii", rank: "species" },
  { taxonId: "wfo-0000712461", scientificName: "Gymnocalycium friedrichii", rank: "species" },
]);
/** WFO 2026-06 仅将 stenopleurum 保留为名称，并由版本化 synonym 边指向 friedrichii。 */
const EXPECTED_WFO_SYNONYM = Object.freeze({
  recordId: "wfo-0000712693-2026-06",
  nameId: "wfo-0000712693",
  acceptedTaxonId: "wfo-0000712461",
});

/** 证据条件不成立时立即中止，避免把残缺来源包装成通过。 */
function assertEvidence(condition, message) {
  if (!condition) { throw new Error(message); }
}

/** 统一来源表头的大小写和标点，用字段名而非列序读取不同来源表。 */
function normalizeHeader(value) {
  return String(value ?? "").trim().toLowerCase().replaceAll(/[^a-z0-9]/gu, "");
}

/** 按制表符或竖线解析一条 CSV/TSV 逻辑行，保留空列并处理双引号转义。 */
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
  assertEvidence(!quoted, "来源表含未闭合的引号字段，拒绝回放");
  cells.push(value);
  return cells;
}

/** 判断多行 CSV/TSV 逻辑记录是否仍处于引号内，避免误把字段换行切成新记录。 */
function hasUnclosedQuote(record) {
  let quoted = false;
  for (let index = 0; index < record.length; index += 1) {
    if (record[index] !== '"') { continue; }
    if (quoted && record[index + 1] === '"') { index += 1; continue; }
    quoted = !quoted;
  }
  return quoted;
}

/** 流式计算原始制品字节的 SHA-256，摘要对应磁盘原字节，不做换行规范化。 */
async function sha256File(filePath) {
  assertEvidence(typeof filePath === "string" && fs.existsSync(filePath), `输入文件不存在：${String(filePath)}`);
  const hash = createHash("sha256");
  const stream = fs.createReadStream(filePath, { highWaterMark: HASH_BUFFER_BYTES });
  for await (const chunk of stream) { hash.update(chunk); }
  return hash.digest("hex");
}

/** 计算逻辑记录摘要：物理 CRLF/CR 统一成 LF，并在记录尾固定追加一个 LF。 */
function sha256LogicalRecord(record) {
  return createHash("sha256").update(`${record.replaceAll(/\r\n?/gu, "\n")}\n`, "utf8").digest("hex");
}

/** 从解析行按已核准字段别名取值；缺失列保持空串，由后续 Expected 检查拒绝。 */
function cellValue(cells, normalizedHeaders, aliases) {
  for (const alias of aliases) {
    const index = normalizedHeaders.indexOf(normalizeHeader(alias));
    if (index >= 0 && cells[index] !== undefined) { return String(cells[index]).trim(); }
  }
  return "";
}

/**
 * 流式扫描来源表，只保存指定稳定 ID 的少量行。必需 ID 必须全部出现；可选 ID 用于验证
 * WFO 候选名称是否缺少 taxon 实体。非命中行不构造对象，也不保存在内存中。
 */
async function findRows(filePath, delimiter, wantedIds, requiredIds, sourceName, expectedColumnCount, singlePhysicalLineRecords = false) {
  assertEvidence(typeof filePath === "string" && fs.existsSync(filePath), `${sourceName} 路径缺失或不存在`);
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
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
      assertEvidence(headers.length === expectedColumnCount, `${sourceName} 表头列数不符合固定来源格式`);
      logicalRecord = "";
      continue;
    }

    // 来源格式的锁定 schema 禁止分隔符出现在字段正文内；对全部行先做廉价结构核验，
    // 避免把百万级表的无关正文按业务对象解析。命中目标 ID 后再执行带引号解析。
    assertEvidence(logicalRecord.split(delimiter).length === headers.length, `${sourceName} 记录列数与表头不一致`);
    const firstCell = logicalRecord.slice(0, logicalRecord.indexOf(delimiter));
    if (wantedIds.has(firstCell)) {
      const cells = parseDelimitedRecord(logicalRecord, delimiter);
      assertEvidence(cells.length === headers.length, `${sourceName} 目标记录列数与表头不一致`);
      assertEvidence(!found.has(firstCell), `${sourceName} 稳定 ID 重复：${firstCell}`);
      found.set(firstCell, { cells, normalizedHeaders, recordSha256: sha256LogicalRecord(logicalRecord) });
    }
    logicalRecord = "";
  }

  assertEvidence(logicalRecord.length === 0, `${sourceName} 末尾存在未闭合的多行记录`);
  assertEvidence(headers !== null && recordNumber > 1, `${sourceName} 缺少表头或数据行`);
  for (const requiredId of requiredIds) {
    assertEvidence(found.has(requiredId), `${sourceName} 缺少稳定 ID ${requiredId} 的来源记录`);
  }
  return found;
}

/** 读取小型 JSON 证据包；格式损坏时给出可审计错误并关闭回放。 */
function readEvidence(evidencePath) {
  assertEvidence(typeof evidencePath === "string" && fs.existsSync(evidencePath), "证据 JSON 路径缺失或不存在");
  try {
    return JSON.parse(fs.readFileSync(evidencePath, "utf8"));
  } catch (error) {
    throw new Error(`证据 JSON 无法解析：${error instanceof Error ? error.message : String(error)}`);
  }
}

/** 固定记录号、候选集合、来源版本和未批准状态，拒绝错误证据被其他任务复用。 */
function verifyEvidenceEnvelope(evidence) {
  assertEvidence(evidence?.schemaVersion === "qinghuazhi.taxonomy-identity-evidence/v1", "证据包 schemaVersion 不支持");
  assertEvidence(evidence?.evidenceId === "p1-taxonomy-source-record-123-candidates", "证据包不是来源记录 123 候选证据");
  assertEvidence(evidence?.scope?.sourceRecordNumber === 123, "证据包不是来源记录 123");
  const candidates = evidence.scope.candidateTaxa;
  assertEvidence(Array.isArray(candidates) && candidates.length === 2, "证据包须分别保留两个候选种");
  assertEvidence(candidates[0]?.scientificName === "Gymnocalycium mihanovichii", "来源候选一不匹配");
  assertEvidence(candidates[1]?.scientificName === "Gymnocalycium stenopleurum", "来源候选二不匹配");
  assertEvidence(evidence.scope.classificationDecision === "SOURCE_CONFLICT_REQUIRES_OWNER_DECISION", "来源冲突须保持负责人裁决状态");
  assertEvidence(evidence.scope.sourceIdentityMapped === false, "证据包不得把分类来源映射为业务身份");
  assertEvidence(evidence.scope.canonicalDisplayNameZh?.status === "PENDING_OWNER_SELECTION", "规范中文展示名须待负责人选择");
  assertEvidence(!Object.hasOwn(evidence.scope.canonicalDisplayNameZh, "value"), "证据包不得预填规范中文展示名");
  assertEvidence(evidence.scope.mayEnterSeed === false && evidence.scope.mayActivate === false, "证据候选不得开放 seed 或 active");
  assertEvidence(evidence.sources?.wcvp?.datasetVersion === "16.0", "证据包须锁定 WCVP 16.0");
  assertEvidence(evidence.sources?.wcvp?.publishedDate === "2026-06-04", "证据包须锁定 WCVP 2026-06-04 发布批次");
  assertEvidence(evidence.sources?.wfo?.datasetVersion === "2026-06", "证据包须锁定 WFO 2026-06");
  assertEvidence(evidence.sources?.wfo?.zenodoRecordId === 20782718, "WFO Zenodo 发布号不匹配");
  assertEvidence(evidence.sources?.wfo?.license?.licenseId === "cc-zero", "WFO 分类骨干许可不匹配");
  assertEvidence(evidence.sources?.wcvp?.license?.name?.includes("CC BY 3.0"), "WCVP 署名许可未记录");
}

/** 校验逐条 WCVP 记录摘要、字段和种→属关系，保留该来源给出的两个 accepted 种。 */
function replayWcvp(evidence, rows) {
  const evidenceRows = evidence.sources.wcvp.records;
  assertEvidence(Array.isArray(evidenceRows) && evidenceRows.length === EXPECTED_WCVP.length, "WCVP 证据记录数不符");
  return EXPECTED_WCVP.map((expected) => {
    const source = rows.get(expected.taxonId);
    const actual = {
      taxonId: cellValue(source.cells, source.normalizedHeaders, ["taxonid"]),
      scientificName: cellValue(source.cells, source.normalizedHeaders, ["scientificname", "scientfiicname"]),
      rank: cellValue(source.cells, source.normalizedHeaders, ["taxonrank"]),
      status: cellValue(source.cells, source.normalizedHeaders, ["taxonomicstatus"]),
      acceptedTaxonId: cellValue(source.cells, source.normalizedHeaders, ["acceptednameusageid"]),
      parentTaxonId: cellValue(source.cells, source.normalizedHeaders, ["parentnameusageid"]) || null,
      scientificNameId: cellValue(source.cells, source.normalizedHeaders, ["scientificnameid"]),
      familyLabel: cellValue(source.cells, source.normalizedHeaders, ["family"]),
      recordSha256: source.recordSha256,
    };
    const declared = evidenceRows.find((item) => item.taxonId === expected.taxonId);
    assertEvidence(declared, `证据包缺少 WCVP ${expected.rank} ${expected.taxonId}`);
    assertEvidence(actual.recordSha256 === declared.recordSha256, `WCVP ${expected.taxonId} 记录 SHA-256 不匹配`);
    for (const key of ["taxonId", "scientificName", "rank", "parentTaxonId", "scientificNameId"]) {
      assertEvidence(actual[key] === expected[key], `WCVP ${expected.taxonId} ${key} 与固定 Expected 不符`);
    }
    for (const key of ["taxonId", "scientificName", "rank", "status", "acceptedTaxonId", "parentTaxonId", "scientificNameId", "familyLabel"]) {
      assertEvidence(actual[key] === (declared[key] ?? null), `WCVP ${expected.taxonId} ${key} 与证据摘要不符`);
    }
    assertEvidence(actual.status === "Accepted" && actual.acceptedTaxonId === actual.taxonId, `WCVP ${actual.taxonId} 不是独立接受名`);
    return actual;
  });
}

/** 校验 WFO taxon/name 两表的各自行哈希与 parentID，返回指定接受分类单元摘要。 */
function replayWfoAcceptedTaxa(evidence, taxonRows, nameRows) {
  const declaredRows = evidence.sources.wfo.acceptedTaxa;
  assertEvidence(Array.isArray(declaredRows) && declaredRows.length === EXPECTED_WFO_TAXA.length, "WFO 接受实体证据数不符");
  const replayed = EXPECTED_WFO_TAXA.map((expected) => {
    const taxon = taxonRows.get(expected.taxonId);
    const name = nameRows.get(expected.taxonId);
    const declared = declaredRows.find((item) => item.taxonId === expected.taxonId);
    assertEvidence(declared, `证据包缺少 WFO accepted ${expected.taxonId}`);
    const actual = {
      taxonId: cellValue(taxon.cells, taxon.normalizedHeaders, ["id"]),
      nameId: cellValue(taxon.cells, taxon.normalizedHeaders, ["nameid"]),
      parentTaxonId: cellValue(taxon.cells, taxon.normalizedHeaders, ["parentid"]),
      scientificName: cellValue(name.cells, name.normalizedHeaders, ["scientificname"]),
      rank: cellValue(name.cells, name.normalizedHeaders, ["rank"]).toLowerCase(),
      taxonRecordSha256: taxon.recordSha256,
      nameRecordSha256: name.recordSha256,
    };
    assertEvidence(actual.taxonRecordSha256 === declared.taxonRecordSha256, `WFO ${expected.taxonId} taxon SHA-256 不匹配`);
    assertEvidence(actual.nameRecordSha256 === declared.nameRecordSha256, `WFO ${expected.taxonId} name SHA-256 不匹配`);
    assertEvidence(actual.taxonId === expected.taxonId && actual.nameId === expected.taxonId, `WFO ${expected.taxonId} taxon/name ID 关系不符`);
    assertEvidence(actual.scientificName === expected.scientificName && actual.rank === expected.rank, `WFO ${expected.taxonId} 学名/等级不符`);
    assertEvidence(actual.scientificName === declared.scientificName && actual.rank === declared.rank, `WFO ${expected.taxonId} 证据摘要学名/等级不符`);
    assertEvidence(actual.parentTaxonId === declared.parentTaxonId, `WFO ${expected.taxonId} 父级 ID 与证据不符`);
    return { ...actual, declared };
  });

  const family = replayed.find((item) => item.taxonId === "wfo-7000000098");
  const genus = replayed.find((item) => item.taxonId === "wfo-4000016452");
  const species = replayed.filter((item) => item.rank === "species");
  assertEvidence(genus.parentTaxonId === family.taxonId, "WFO 属级未连接至对应科级实体");
  for (const item of species) {
    assertEvidence(item.parentTaxonId === genus.taxonId, `WFO ${item.taxonId} 未连接至 Gymnocalycium 属`);
  }
  return species.map(({ taxonId, parentTaxonId, scientificName, rank }) => ({ scientificName, taxonId, parentTaxonId, rank }));
}

/** 校验 WFO 目标名称行存在、没有 taxon 实体，并由来源异名记录指向准确接受 taxon。 */
function replayWfoSynonym(evidence, nameRows, taxonRows, synonymRows) {
  const expected = EXPECTED_WFO_SYNONYM;
  const candidateName = nameRows.get(expected.nameId);
  const synonym = synonymRows.get(expected.recordId);
  const declaredName = evidence.sources.wfo.candidateName;
  const declaredSynonym = evidence.sources.wfo.synonymEdge;
  assertEvidence(candidateName, "WFO stenopleurum 名称记录缺失");
  assertEvidence(candidateName.recordSha256 === declaredName.nameRecordSha256, "WFO stenopleurum name 行 SHA-256 不匹配");
  assertEvidence(!taxonRows.has(expected.nameId), "WFO stenopleurum 存在 taxon 实体，证据包的来源状态已漂移");
  assertEvidence(declaredName.nameId === expected.nameId && declaredName.scientificName === "Gymnocalycium stenopleurum", "WFO 候选名称摘要不匹配");
  assertEvidence(declaredName.hasTaxonRecord === false, "WFO 候选状态必须记录为没有 taxon 实体");
  const actual = {
    recordId: cellValue(synonym.cells, synonym.normalizedHeaders, ["id"]),
    acceptedTaxonId: cellValue(synonym.cells, synonym.normalizedHeaders, ["taxonid"]),
    nameId: cellValue(synonym.cells, synonym.normalizedHeaders, ["nameid"]),
    recordSha256: synonym.recordSha256,
  };
  assertEvidence(actual.recordId === expected.recordId, "WFO synonym 版本记录 ID 不匹配");
  assertEvidence(actual.nameId === expected.nameId && actual.acceptedTaxonId === expected.acceptedTaxonId, "WFO synonym 目标关系不匹配");
  assertEvidence(actual.recordSha256 === declaredSynonym.recordSha256, "WFO synonym 关系行 SHA-256 不匹配");
  const acceptedName = nameRows.get(actual.acceptedTaxonId);
  assertEvidence(acceptedName, "WFO synonym 指向的 accepted name 记录缺失");
  return {
    nameId: actual.nameId,
    acceptedTaxonId: actual.acceptedTaxonId,
    acceptedScientificName: cellValue(acceptedName.cells, acceptedName.normalizedHeaders, ["scientificname"]),
  };
}

/**
 * 根据明确提供的来源表重放两个来源各自的分类实体与异名关系。Vitest 用最小原始行夹具
 * 检查此路径；完整压缩包和发布元数据由 `verifyFullSourcePackages` 另行锁定。
 */
export async function verifyIdentityRows({ evidencePath, wcvpTaxonPath, wfoTaxonPath, wfoNamePath, wfoSynonymPath }) {
  const evidence = readEvidence(evidencePath);
  verifyEvidenceEnvelope(evidence);
  const wcvpRows = await findRows(wcvpTaxonPath, "|", new Set(EXPECTED_WCVP.map((item) => item.taxonId)), new Set(EXPECTED_WCVP.map((item) => item.taxonId)), "WCVP taxon.csv", REQUIRED_COLUMN_COUNTS.wcvp, true);
  const wfoTaxonIds = new Set([...EXPECTED_WFO_TAXA.map((item) => item.taxonId), EXPECTED_WFO_SYNONYM.nameId]);
  const wfoRequiredTaxonIds = new Set(EXPECTED_WFO_TAXA.map((item) => item.taxonId));
  const wfoTaxonRows = await findRows(wfoTaxonPath, "\t", wfoTaxonIds, wfoRequiredTaxonIds, "WFO taxon.tsv", REQUIRED_COLUMN_COUNTS.wfoTaxon);
  const wfoNameIds = new Set([...EXPECTED_WFO_TAXA.map((item) => item.taxonId), EXPECTED_WFO_SYNONYM.nameId]);
  const wfoNameRows = await findRows(wfoNamePath, "\t", wfoNameIds, wfoNameIds, "WFO name.tsv", REQUIRED_COLUMN_COUNTS.wfoName);
  const wfoSynonymRows = await findRows(wfoSynonymPath, "\t", new Set([EXPECTED_WFO_SYNONYM.recordId]), new Set([EXPECTED_WFO_SYNONYM.recordId]), "WFO synonym.tsv", REQUIRED_COLUMN_COUNTS.wfoSynonym);
  const wcvpCandidates = replayWcvp(evidence, wcvpRows);
  const wfoAcceptedTaxa = replayWfoAcceptedTaxa(evidence, wfoTaxonRows, wfoNameRows);
  const wfoStenopleurumSynonym = replayWfoSynonym(evidence, wfoNameRows, wfoTaxonRows, wfoSynonymRows);

  return {
    verified: true,
    sourceIdentityMapped: false,
    classificationDecision: evidence.scope.classificationDecision,
    mayEnterSeed: evidence.scope.mayEnterSeed,
    mayActivate: evidence.scope.mayActivate,
    canonicalDisplayNameStatus: evidence.scope.canonicalDisplayNameZh.status,
    wcvpCandidates: wcvpCandidates.filter((item) => item.rank === "Species").map((item) => ({
      scientificName: item.scientificName,
      taxonId: item.taxonId,
      parentTaxonId: item.parentTaxonId,
      familyLabel: item.familyLabel,
    })),
    wfoAcceptedTaxa,
    wfoStenopleurumSynonym,
    wfoStenopleurumHasTaxonRecord: wfoTaxonRows.has(EXPECTED_WFO_SYNONYM.nameId),
  };
}

/** 解析全量回放所需的参数；不允许隐含目录、环境变量、网络下载或 /tmp 默认路径。 */
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
  const required = ["--evidence", "--wcvp-archive", "--wcvp-taxon", "--wcvp-eml", "--wfo-archive", "--wfo-taxon", "--wfo-name", "--wfo-synonym", "--wfo-release"];
  for (const key of required) { assertEvidence(argumentsByName.has(key), `缺少显式路径参数 ${key}`); }
  for (const key of argumentsByName.keys()) { assertEvidence(required.includes(key), `未知参数：${key}`); }
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

/** 以显式路径校验两个发布包、解出表、元数据、许可和每条目标记录的回放结果。 */
export async function verifyFullSourcePackages(options) {
  const evidence = readEvidence(options.evidencePath);
  verifyEvidenceEnvelope(evidence);
  const wcvp = evidence.sources.wcvp;
  const wfo = evidence.sources.wfo;
  const wfoTables = new Map(wfo.tables.map((table) => [table.entry, table.sha256]));
  for (const entry of wcvp.archive.requiredEntries) { assertEvidence(["wcvp_taxon.csv", "eml.xml"].includes(entry), `未知 WCVP entry ${entry}`); }
  for (const entry of wfo.archive.requiredEntries) { assertEvidence(["taxon.tsv", "name.tsv", "synonym.tsv"].includes(entry), `未知 WFO entry ${entry}`); }
  const files = [
    ["WCVP 发布包", options.wcvpArchivePath, wcvp.archive.sha256],
    ["WCVP taxon 表", options.wcvpTaxonPath, wcvp.taxonTable.sha256],
    ["WCVP EML", options.wcvpEmlPath, wcvp.eml.sha256],
    ["WFO 发布包", options.wfoArchivePath, wfo.archive.sha256],
    ["WFO taxon 表", options.wfoTaxonPath, wfoTables.get("taxon.tsv")],
    ["WFO name 表", options.wfoNamePath, wfoTables.get("name.tsv")],
    ["WFO synonym 表", options.wfoSynonymPath, wfoTables.get("synonym.tsv")],
    ["WFO Zenodo 原始元数据", options.wfoReleasePath, wfo.releaseMetadataSha256],
  ];
  for (const [label, filePath, expectedHash] of files) {
    assertEvidence(typeof expectedHash === "string", `${label} 缺少锁定 SHA-256`);
    assertEvidence(await sha256File(filePath) === expectedHash, `${label} SHA-256 不匹配；拒绝回放`);
  }

  const wcvpEntries = execFileSync("unzip", ["-Z1", options.wcvpArchivePath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/u);
  for (const entry of wcvp.archive.requiredEntries) { assertEvidence(wcvpEntries.includes(entry), `WCVP 发布包缺少 ${entry}`); }
  const wfoEntries = execFileSync("unzip", ["-Z1", options.wfoArchivePath], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).split(/\r?\n/u);
  for (const entry of wfo.archive.requiredEntries) { assertEvidence(wfoEntries.includes(entry), `WFO 发布包缺少 ${entry}`); }

  const eml = fs.readFileSync(options.wcvpEmlPath, "utf8");
  assertEvidence(eml.match(/<pubDate>([^<]+)<\/pubDate>/u)?.[1] === wcvp.publishedDate, "WCVP EML 发布日期与锁定批次不一致");
  assertEvidence(eml.match(/<version>([^<]+)<\/version>/u)?.[1] === wcvp.datasetVersion, "WCVP EML 版本与锁定批次不一致");
  assertEvidence(/CC BY 3\.0/iu.test(eml), "WCVP EML 未确认 CC BY 3.0；拒绝复用证据制品");

  const release = JSON.parse(fs.readFileSync(options.wfoReleasePath, "utf8"));
  const releaseFile = release.files?.find((file) => file.key === wfo.archive.fileName);
  assertEvidence(release.id === wfo.zenodoRecordId, "WFO Zenodo 发布记录号不匹配");
  assertEvidence(release.metadata?.license?.id === wfo.license.licenseId, "WFO Zenodo 许可 ID 不匹配");
  assertEvidence(String(release.metadata?.title ?? "").includes("June 2026"), "WFO Zenodo 发布标题不含 June 2026");
  assertEvidence(releaseFile?.size === wfo.archive.sizeBytes, "WFO Zenodo 发布包大小与证据不匹配");
  assertEvidence(releaseFile?.checksum === `md5:${wfo.archive.md5}`, "WFO Zenodo 发布包 MD5 与证据不匹配");
  return verifyIdentityRows(options);
}

/** 显示所有必需显式参数与只读边界，不提供权威输入的默认路径。 */
function printHelp() {
  process.stdout.write([
    "P1 来源记录 123 分类候选证据回放（离线、只读、不准入）",
    "必填：--evidence --wcvp-archive --wcvp-taxon --wcvp-eml --wfo-archive --wfo-taxon --wfo-name --wfo-synonym --wfo-release",
    "网络获取、解压和 SHA 核验由操作者在运行前显式完成；本工具不会下载、写文件、访问线上数据或猜测临时路径。",
  ].join("\n") + "\n");
}

/** CLI 入口；作为模块导入 Vitest 时不解析命令行或触发任何文件写入。 */
async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { printHelp(); return; }
  const result = await verifyFullSourcePackages(options);
  process.stdout.write(`${JSON.stringify({
    replayStatus: "PASS",
    evidenceId: "p1-taxonomy-source-record-123-candidates",
    classificationDecision: result.classificationDecision,
    sourceIdentityMapped: result.sourceIdentityMapped,
    mayEnterSeed: result.mayEnterSeed,
    mayActivate: result.mayActivate,
    canonicalDisplayNameStatus: result.canonicalDisplayNameStatus,
    wcvpCandidates: result.wcvpCandidates,
    wfoAcceptedTaxa: result.wfoAcceptedTaxa,
    wfoStenopleurumSynonym: result.wfoStenopleurumSynonym,
    wfoStenopleurumHasTaxonRecord: result.wfoStenopleurumHasTaxonRecord,
    scopeNoteZh: "只证明本地指定版本的分类来源记录与父链/异名边一致；不代表来源业务身份映射、人工准入或中文展示名批准。",
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`证据回放失败：${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
