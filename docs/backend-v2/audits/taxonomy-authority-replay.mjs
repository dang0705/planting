#!/usr/bin/env node
/**
 * P1 植物分类权威来源离线回放工具。
 *
 * 本工具不是线上 HTTP 云函数，也不下载、写入或调用 CloudBase。它只读取已经由
 * 操作者固定到本地的候选 CSV、WCVP/WFO 原始压缩制品及其解压文件，验证来源
 * 元数据和 SHA-256 后生成本地审计输出。任何自动匹配都不会生成 ACTIVE。
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const CANDIDATE_COLUMNS = [
  "sessionPlantId",
  "primaryDisplayName",
  "coverImageRef",
  "basicDescription",
  "categoryNameCn",
  "categoryNameEn",
  "scientificName",
  "familyNameCn",
  "familyNameCanonical",
  "genusName",
  "sessionStatusFlag",
  "sessionReservedField",
  "createdAt",
  "updatedAt",
];
const HASH_BUFFER_BYTES = 64 * 1024;

/** 将不同来源的表头归一为可比较键；不改动实际证据原文。 */
function headerKey(value) {
  return String(value).trim().toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/** 对科学名只做空白、Unicode 与乘号标准化，严禁做模糊拼写猜测。 */
export function normalizeScientificName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replaceAll("×", " x ")
    .replaceAll(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("en-US");
}

/** 以固定 64 KiB 缓冲分块哈希，避免哈希阶段把权威大制品读入堆内存。 */
function hashFile(filePath, algorithm) {
  const descriptor = fs.openSync(filePath, "r");
  const buffer = Buffer.allocUnsafe(HASH_BUFFER_BYTES);
  const hash = createHash(algorithm);
  try {
    let bytesRead = 0;
    do {
      bytesRead = fs.readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) { hash.update(buffer.subarray(0, bytesRead)); }
    } while (bytesRead > 0);
  } finally {
    fs.closeSync(descriptor);
  }
  return hash.digest("hex");
}

function sha256File(filePath) {
  return hashFile(filePath, "sha256");
}

function md5File(filePath) {
  return hashFile(filePath, "md5");
}

function assertSha256(label, actual, expected) {
  if (!/^[a-f0-9]{64}$/iu.test(expected)) {
    throw new Error(`${label} 的预期 SHA-256 必须是 64 位十六进制字符串`);
  }
  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`${label} SHA-256 不匹配：expected=${expected} actual=${actual}`);
  }
}

/**
 * 解析带引号的单行分隔文本。候选 CSV 来自无表头旧快照，仍须支持描述字段中的
 * 英文逗号；制品读取不接受损坏的未闭合引号，避免静默列错位。
 */
function parseDelimitedLine(line, delimiter) {
  const cells = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      cells.push(cell);
      cell = "";
    } else {
      cell += character;
    }
  }
  if (quoted) { throw new Error("发现未闭合的 CSV 引号，拒绝继续回放"); }
  cells.push(cell);
  return cells;
}

/** 判断一个物理行片段是否仍在 CSV 引号内；双引号转义不改变状态。 */
function hasUnclosedQuote(value) {
  let quoted = false;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '"') { continue; }
    if (quoted && value[index + 1] === '"') { index += 1; continue; }
    quoted = !quoted;
  }
  return quoted;
}

function valueOf(row, aliases) {
  for (const alias of aliases) {
    const value = row[headerKey(alias)];
    if (value !== undefined && value !== "") { return value; }
  }
  return "";
}

function requirePath(label, filePath) {
  if (typeof filePath !== "string" || filePath.length === 0 || !fs.existsSync(filePath)) {
    throw new Error(`${label} 不存在或未提供：${String(filePath)}`);
  }
}

function assertArchiveEntry(label, entry) {
  if (typeof entry !== "string" || entry.length === 0 || entry.startsWith("/") || entry.includes("..") || entry.includes("\\")) {
    throw new Error(`${label} 必须是安全且非空的压缩包内 entry 名`);
  }
}

function parseCandidateRows(candidatePath) {
  const lines = fs.readFileSync(candidatePath, "utf8").split(/\r?\n/u).filter(Boolean);
  return lines.map((line, index) => {
    const values = parseDelimitedLine(line, ",");
    if (values.length !== CANDIDATE_COLUMNS.length) {
      throw new Error(`候选 CSV 第 ${index + 1} 行必须有 ${CANDIDATE_COLUMNS.length} 列，实际为 ${values.length}`);
    }
    const candidate = Object.fromEntries(CANDIDATE_COLUMNS.map((column, columnIndex) => [column, values[columnIndex]?.trim() ?? ""]));
    if (!candidate.sessionPlantId || !candidate.scientificName) {
      throw new Error(`候选 CSV 第 ${index + 1} 行缺少 session_plant_id 或 scientific_name`);
    }
    return { ...candidate, sourceLine: index + 1, sourceLineSha256: createHash("sha256").update(line).digest("hex") };
  });
}

/** 将类别名称分流，识别但不纠正任何分类学拼写。 */
export function classifyCandidateName(scientificName) {
  const rawName = String(scientificName).trim();
  const cultivarMatch = rawName.match(/^(.*?)\s+'([^']+)'\s*$/u);
  if (cultivarMatch) {
    return { kind: "cultivar", lookupName: cultivarMatch[1].trim(), cultivarName: cultivarMatch[2].trim() };
  }
  if (/\bspp\.?$/iu.test(rawName)) {
    return { kind: "genus_spp", lookupName: rawName.replace(/\s+spp\.?$/iu, "").trim(), cultivarName: null };
  }
  if (/[、/]/u.test(rawName) || /\b(?:and|etc\.)\b/iu.test(rawName)) {
    return { kind: "mixed_group", lookupName: rawName, cultivarName: null };
  }
  if (/×|(?:^|\s)x(?:\s|$)/iu.test(rawName)) { return { kind: "hybrid", lookupName: rawName, cultivarName: null }; }
  const wordCount = rawName.split(/\s+/u).length;
  return { kind: wordCount <= 1 ? "genus" : "species", lookupName: rawName, cultivarName: null };
}

/**
 * 以流式方式扫描大制品。第一轮仅保留候选名称的精确行，后续轮次仅补齐其
 * accepted / parent 引用；任何未命中的行都不会对象化或进入内存索引。
 */
async function streamRelevantTaxa(taxonPath, delimiter, sourceName, lookupNames, toTaxon) {
  const selected = new Map();
  const selectedNames = new Map();
  let scannedRows = 0;

  async function scan(selectRow) {
    const input = fs.createReadStream(taxonPath, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let headers = null;
    let normalizedHeaders = null;
    let rowIndex = 0;
    for await (const line of lines) {
      if (line.length === 0) { continue; }
      rowIndex += 1;
      if (!headers) {
        headers = line.replace(/^\uFEFF/u, "").split(delimiter);
        normalizedHeaders = headers.map(headerKey);
        continue;
      }
      const cells = line.split(delimiter);
      if (cells.length !== headers.length) {
        throw new Error(`${sourceName} 第 ${rowIndex} 行列数与表头不一致`);
      }
      scannedRows += 1;
      const row = {};
      normalizedHeaders.forEach((header, index) => { row[header] = cells[index]?.trim() ?? ""; });
      const taxon = toTaxon(row);
      selectRow(taxon);
    }
    if (!headers || rowIndex < 2) { throw new Error(`${sourceName} 至少需要表头和一条记录`); }
  }

  await scan((taxon) => {
    const normalizedName = normalizeScientificName(taxon.scientificName);
    if (!lookupNames.has(normalizedName)) { return; }
    if (!selectedNames.has(normalizedName)) { selectedNames.set(normalizedName, []); }
    selectedNames.get(normalizedName).push(taxon);
    selected.set(taxon.taxonId, taxon);
  });

  const wantedIds = new Set(selected.keys());
  for (const taxon of selected.values()) {
    if (taxon.acceptedId) { wantedIds.add(taxon.acceptedId); }
    if (taxon.parentId) { wantedIds.add(taxon.parentId); }
  }
  let previousCount = -1;
  while (wantedIds.size > previousCount) {
    previousCount = wantedIds.size;
    await scan((taxon) => {
      if (!wantedIds.has(taxon.taxonId) || selected.has(taxon.taxonId)) { return; }
      selected.set(taxon.taxonId, taxon);
      if (taxon.acceptedId) { wantedIds.add(taxon.acceptedId); }
      if (taxon.parentId) { wantedIds.add(taxon.parentId); }
    });
  }
  return { rows: [...selected.values()], scannedRows, retainedRows: selected.size };
}

function toWcvpTaxon(row) {
  return {
    taxonId: valueOf(row, ["taxonid", "plant_name_id"]),
    family: valueOf(row, ["family"]),
    genus: valueOf(row, ["genus"]),
    scientificName: valueOf(row, ["scientfiicname", "scientificname", "taxon_name"]),
    scientificNameId: valueOf(row, ["scientificnameid", "ipni_id"]),
    rank: valueOf(row, ["taxonrank", "taxon_rank"]),
    status: valueOf(row, ["taxonomicstatus", "taxon_status"]),
    acceptedId: valueOf(row, ["acceptednameusageid", "accepted_plant_name_id"]),
    parentId: valueOf(row, ["parentnameusageid", "parent_plant_name_id"]),
  };
}

async function parseWcvp(taxonPath, lookupNames) {
  return streamRelevantTaxa(taxonPath, "|", "WCVP taxon 文件", lookupNames, toWcvpTaxon);
}

async function streamWfoTable(filePath, sourceName, onRow) {
  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  let normalizedHeaders = null;
  let rowIndex = 0;
  let record = "";
  for await (const line of lines) {
    record = record.length === 0 ? line : `${record}\n${line}`;
    if (hasUnclosedQuote(record)) { continue; }
    if (record.length === 0) { continue; }
    rowIndex += 1;
    if (!headers) {
      headers = parseDelimitedLine(record.replace(/^\uFEFF/u, ""), "\t");
      normalizedHeaders = headers.map(headerKey);
      record = "";
      continue;
    }
    const cells = parseDelimitedLine(record, "\t");
    if (cells.length !== headers.length) { throw new Error(`${sourceName} 第 ${rowIndex} 行列数与表头不一致`); }
    const row = {};
    normalizedHeaders.forEach((header, index) => { row[header] = cells[index]?.trim() ?? ""; });
    onRow(row);
    record = "";
  }
  if (record.length > 0) { throw new Error(`${sourceName} 存在未闭合的 CSV 引号`); }
  if (!headers || rowIndex < 2) { throw new Error(`${sourceName} 至少需要表头和一条记录`); }
  return rowIndex - 1;
}

/** WFO 2026-06 将名称、taxon 和 synonym 关系分在三张 TSV；三者均为必需证据。 */
async function parseWfo(wfo, lookupNames) {
  const matchingNames = new Map();
  let scannedNameRows = await streamWfoTable(wfo.namePath, "WFO name 文件", (row) => {
    const scientificName = valueOf(row, ["scientificname"]);
    const normalized = normalizeScientificName(scientificName);
    if (!lookupNames.has(normalized)) { return; }
    if (!matchingNames.has(normalized)) { matchingNames.set(normalized, []); }
    matchingNames.get(normalized).push({ nameId: valueOf(row, ["id"]), scientificName, rank: valueOf(row, ["rank"]) });
  });
  const candidateNameIds = [...matchingNames.values()].flat().map((name) => name.nameId);
  const matchingNameIds = new Set(candidateNameIds);
  const synonymTargets = new Map();
  const scannedSynonymRows = await streamWfoTable(wfo.synonymPath, "WFO synonym 文件", (row) => {
    const nameId = valueOf(row, ["nameid"]);
    if (matchingNameIds.has(nameId)) { synonymTargets.set(nameId, valueOf(row, ["taxonid"])); }
  });
  const wantedTaxonIds = new Set(synonymTargets.values());
  let scannedTaxonRows = await streamWfoTable(wfo.taxonPath, "WFO taxon 文件", (row) => {
    if (matchingNameIds.has(valueOf(row, ["nameid"]))) { wantedTaxonIds.add(valueOf(row, ["id"])); }
  });
  const selectedTaxa = new Map();
  let previousWantedCount = -1;
  while (wantedTaxonIds.size > previousWantedCount) {
    previousWantedCount = wantedTaxonIds.size;
    scannedTaxonRows += await streamWfoTable(wfo.taxonPath, "WFO taxon 文件", (row) => {
      const taxonId = valueOf(row, ["id"]);
      if (!wantedTaxonIds.has(taxonId) || selectedTaxa.has(taxonId)) { return; }
      const taxon = { taxonId, nameId: valueOf(row, ["nameid"]), parentId: valueOf(row, ["parentid"]) };
      selectedTaxa.set(taxonId, taxon);
      if (taxon.parentId) { wantedTaxonIds.add(taxon.parentId); }
    });
  }
  const wantedNameIds = new Set([...candidateNameIds, ...[...selectedTaxa.values()].map((taxon) => taxon.nameId)]);
  const namesById = new Map();
  scannedNameRows += await streamWfoTable(wfo.namePath, "WFO name 文件", (row) => {
    const nameId = valueOf(row, ["id"]);
    if (wantedNameIds.has(nameId)) {
      const rank = valueOf(row, ["rank"]);
      const scientificName = valueOf(row, ["scientificname"]);
      const genus = valueOf(row, ["genus"]) || (normalizeScientificName(rank) === "genus" ? valueOf(row, ["uninomial"]) || scientificName : "");
      namesById.set(nameId, { scientificName, rank, genus });
    }
  });
  const acceptedRows = [...selectedTaxa.values()].map((taxon) => ({
    taxonId: taxon.taxonId,
    scientificName: namesById.get(taxon.nameId)?.scientificName ?? "",
    scientificNameId: taxon.nameId,
    rank: namesById.get(taxon.nameId)?.rank ?? "",
    genus: namesById.get(taxon.nameId)?.genus ?? "",
    status: "Accepted",
    acceptedId: taxon.taxonId,
    parentId: taxon.parentId,
  }));
  const synonymRows = [...matchingNames.values()].flatMap((names) => names.flatMap((name) => {
    const targetId = synonymTargets.get(name.nameId);
    return targetId ? [{ taxonId: `synonym:${name.nameId}`, scientificName: name.scientificName, scientificNameId: name.nameId, rank: name.rank, status: "Synonym", acceptedId: targetId, parentId: "" }] : [];
  }));
  return {
    rows: [...acceptedRows, ...synonymRows],
    scannedRows: scannedNameRows + scannedSynonymRows + scannedTaxonRows,
    retainedRows: acceptedRows.length + synonymRows.length,
  };
}

function getSingleExactMatch(rows, lookupName, sourceRecordId, sourceName, conflicts) {
  const matches = rows.filter((row) => normalizeScientificName(row.scientificName) === normalizeScientificName(lookupName));
  if (matches.length === 0) {
    conflicts.push({ sourceRecordId, code: `${sourceName}_EXACT_MATCH_MISSING` });
    return null;
  }
  if (matches.length > 1) {
    conflicts.push({ sourceRecordId, code: `${sourceName}_EXACT_MATCH_AMBIGUOUS` });
    return null;
  }
  return matches[0];
}

function resolveAccepted(row, rowsById, sourceRecordId, sourceName, conflicts) {
  const status = row.status.toLocaleLowerCase("en-US");
  if (status === "accepted") { return row; }
  if (status !== "synonym") {
    conflicts.push({ sourceRecordId, code: `${sourceName}_STATUS_UNSUPPORTED` });
    return null;
  }
  const accepted = rowsById.get(row.acceptedId);
  if (!accepted || accepted.status.toLocaleLowerCase("en-US") !== "accepted") {
    conflicts.push({ sourceRecordId, code: `${sourceName}_ACCEPTED_TARGET_MISSING` });
    return null;
  }
  return accepted;
}

function buildParentChain(accepted, rowsById, sourceRecordId, sourceName, conflicts, stopAtRank = null) {
  const chain = [];
  const visited = new Set();
  let current = accepted;
  while (current) {
    if (visited.has(current.taxonId)) {
      conflicts.push({ sourceRecordId, code: `${sourceName}_PARENT_CHAIN_CYCLE` });
      return null;
    }
    visited.add(current.taxonId);
    chain.push({ taxonId: current.taxonId, scientificName: current.scientificName, rank: current.rank });
    if (stopAtRank && normalizeScientificName(current.rank) === stopAtRank) { return chain; }
    if (!current.parentId) { return chain; }
    current = rowsById.get(current.parentId);
    if (!current) {
      conflicts.push({ sourceRecordId, code: `${sourceName}_PARENT_CHAIN_MISSING` });
      return null;
    }
  }
  return null;
}

function verifyWcvpSource(wcvp) {
  for (const [label, filePath] of Object.entries({ "WCVP 原始制品": wcvp.artifactPath, "WCVP taxon 文件": wcvp.taxonPath, "WCVP EML": wcvp.emlPath })) {
    requirePath(label, filePath);
  }
  assertSha256("WCVP 原始制品", sha256File(wcvp.artifactPath), wcvp.expectedArtifactSha256);
  assertArchiveEntry("WCVP taxon entry", wcvp.taxonEntry);
  assertSha256("WCVP taxon 解压文件", sha256File(wcvp.taxonPath), wcvp.expectedTaxonSha256);
  if (!String(wcvp.sourceUrl).startsWith("https://sftp.kew.org/pub/data-repositories/WCVP/")) {
    throw new Error("WCVP sourceUrl 必须是 Kew 官方 WCVP 下载地址");
  }
  const eml = fs.readFileSync(wcvp.emlPath, "utf8");
  const publishedAt = eml.match(/<pubDate>([^<]+)<\/pubDate>/u)?.[1];
  if (!publishedAt || publishedAt !== wcvp.sourceVersion || !/CC BY 3\.0/iu.test(eml)) {
    throw new Error("WCVP EML 的发布版本或 CC BY 3.0 许可与输入元数据不一致");
  }
  return {
    artifactSha256: sha256File(wcvp.artifactPath),
    taxonEntry: wcvp.taxonEntry,
    taxonSha256: sha256File(wcvp.taxonPath),
    emlSha256: sha256File(wcvp.emlPath),
    publishedAt,
  };
}

function verifyWfoSource(wfo) {
  for (const [label, filePath] of Object.entries({ "WFO 原始制品": wfo.artifactPath, "WFO Taxon 文件": wfo.taxonPath, "WFO name 文件": wfo.namePath, "WFO synonym 文件": wfo.synonymPath, "WFO release 元数据": wfo.releasePath })) {
    requirePath(label, filePath);
  }
  assertSha256("WFO 原始制品", sha256File(wfo.artifactPath), wfo.expectedArtifactSha256);
  assertArchiveEntry("WFO taxon entry", wfo.taxonEntry);
  assertSha256("WFO taxon 解压文件", sha256File(wfo.taxonPath), wfo.expectedTaxonSha256);
  assertArchiveEntry("WFO name entry", wfo.nameEntry);
  assertSha256("WFO name 解压文件", sha256File(wfo.namePath), wfo.expectedNameSha256);
  assertArchiveEntry("WFO synonym entry", wfo.synonymEntry);
  assertSha256("WFO synonym 解压文件", sha256File(wfo.synonymPath), wfo.expectedSynonymSha256);
  assertSha256("WFO Zenodo release 元数据", sha256File(wfo.releasePath), wfo.expectedReleaseSha256);
  const release = JSON.parse(fs.readFileSync(wfo.releasePath, "utf8"));
  const zenodoApiUrl = release.links?.self;
  const publishedAt = release.metadata?.publication_date;
  const releaseTitle = release.metadata?.title;
  const releaseLicenseId = release.metadata?.license?.id;
  const versionParts = String(wfo.sourceVersion).match(/^(20\d{2})-(\d{2})$/u);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const releaseTitleVersion = versionParts ? `${monthNames[Number(versionParts[2]) - 1]} ${versionParts[1]}` : "";
  if (
    !Number.isInteger(release.id)
    || !/^https:\/\/zenodo\.org\/api\/records\/\d+$/u.test(String(zenodoApiUrl))
    || !/^20\d{2}-\d{2}-\d{2}$/u.test(String(publishedAt))
    || !versionParts
    || releaseLicenseId !== "cc-zero"
    || (!String(releaseTitle).includes(wfo.sourceVersion) && !String(releaseTitle).includes(releaseTitleVersion))
    || wfo.termsUrl !== "https://www.worldfloraonline.org/termsOfUse"
  ) {
    throw new Error("WFO release 元数据必须是 Zenodo 原始 API 记录，声明 cc-zero 许可并固定版本和 WFO CC0 分类条款 URL");
  }
  const officialFile = release.files?.find((file) => file.key === wfo.artifactFileName);
  const actualFileSize = fs.statSync(wfo.artifactPath).size;
  const officialMd5 = String(officialFile?.checksum ?? "").replace(/^md5:/iu, "");
  if (
    !officialFile
    || !Number.isSafeInteger(officialFile.size)
    || officialFile.size !== actualFileSize
    || !/^[a-f0-9]{32}$/iu.test(officialMd5)
    || officialMd5.toLowerCase() !== md5File(wfo.artifactPath)
  ) {
    throw new Error("WFO Zenodo files[] 与本地原始制品的文件名、size 或 MD5 不一致");
  }
  return {
    artifactSha256: sha256File(wfo.artifactPath),
    taxonEntry: wfo.taxonEntry,
    taxonSha256: sha256File(wfo.taxonPath),
    nameEntry: wfo.nameEntry,
    nameSha256: sha256File(wfo.namePath),
    synonymEntry: wfo.synonymEntry,
    synonymSha256: sha256File(wfo.synonymPath),
    releaseSha256: sha256File(wfo.releasePath),
    release: { recordId: release.id, zenodoApiUrl, publishedAt, title: releaseTitle, licenseId: releaseLicenseId, sourceVersion: wfo.sourceVersion, termsUrl: wfo.termsUrl, artifactFileName: wfo.artifactFileName, artifactSize: actualFileSize, artifactMd5: officialMd5 },
  };
}

function writeOutputs(outputDirectory, manifest, conflicts) {
  if (fs.existsSync(outputDirectory) && fs.readdirSync(outputDirectory).length > 0) {
    throw new Error(`输出目录必须为空，拒绝覆盖既有审计制品：${outputDirectory}`);
  }
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, "taxonomy-authority-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, "taxonomy-authority-conflicts.json"), `${JSON.stringify(conflicts, null, 2)}\n`);
  fs.writeFileSync(path.join(outputDirectory, "taxonomy-authority-summary.json"), `${JSON.stringify(manifest.summary, null, 2)}\n`);
}

/**
 * 回放固定输入。即使 WCVP 与 WFO 一致，也只留下可供人工审核的 QUARANTINE；
 * 本函数没有接受任何自动 ACTIVE 参数，防止工具被误作发布器。
 */
export async function runTaxonomyAuthorityReplay(options) {
  const { candidatePath, expectedCandidateSha256, wcvp, wfo, outputDirectory } = options;
  requirePath("候选 CSV", candidatePath);
  assertSha256("候选 CSV", sha256File(candidatePath), expectedCandidateSha256);
  if (!wcvp || !wfo || typeof outputDirectory !== "string") { throw new Error("必须提供 wcvp、wfo 和 outputDirectory 输入"); }
  const wcvpEvidence = verifyWcvpSource(wcvp);
  const wfoEvidence = verifyWfoSource(wfo);
  const candidates = parseCandidateRows(candidatePath);
  const lookupNames = new Set(candidates.map((candidate) => normalizeScientificName(classifyCandidateName(candidate.scientificName).lookupName)));
  const wcvpSelection = await parseWcvp(wcvp.taxonPath, lookupNames);
  const wfoSelection = await parseWfo(wfo, lookupNames);
  const wcvpRows = wcvpSelection.rows;
  const wfoRows = wfoSelection.rows;
  const wcvpById = new Map(wcvpRows.map((row) => [row.taxonId, row]));
  const wfoById = new Map(wfoRows.map((row) => [row.taxonId, row]));
  const conflicts = [];
  let wcvpExactMatched = 0;
  let wfoCrossChecked = 0;

  const records = candidates.map((candidate) => {
    const parsed = classifyCandidateName(candidate.scientificName);
    const recordConflicts = [];
    const wcvpMatch = getSingleExactMatch(wcvpRows, parsed.lookupName, candidate.sessionPlantId, "WCVP", recordConflicts);
    const wcvpAccepted = wcvpMatch ? resolveAccepted(wcvpMatch, wcvpById, candidate.sessionPlantId, "WCVP", recordConflicts) : null;
    const parentChain = wcvpAccepted ? buildParentChain(wcvpAccepted, wcvpById, candidate.sessionPlantId, "WCVP", recordConflicts) : null;
    if (wcvpMatch) { wcvpExactMatched += 1; }
    const wfoMatch = getSingleExactMatch(wfoRows, parsed.lookupName, candidate.sessionPlantId, "WFO", recordConflicts);
    const wfoAccepted = wfoMatch ? resolveAccepted(wfoMatch, wfoById, candidate.sessionPlantId, "WFO", recordConflicts) : null;
    const wfoParentChain = wfoAccepted ? buildParentChain(wfoAccepted, wfoById, candidate.sessionPlantId, "WFO", recordConflicts, "family") : null;
    let crossCheck = "NOT_AVAILABLE";
    if (wcvpAccepted && wfoAccepted && parentChain && wfoParentChain) {
      wfoCrossChecked += 1;
      const wfoFamily = wfoParentChain.find((item) => normalizeScientificName(item.rank) === "family")?.scientificName ?? "";
      crossCheck = normalizeScientificName(wcvpAccepted.scientificName) === normalizeScientificName(wfoAccepted.scientificName) && normalizeScientificName(wcvpAccepted.rank) === normalizeScientificName(wfoAccepted.rank) && normalizeScientificName(wcvpAccepted.genus) === normalizeScientificName(wfoAccepted.genus) && normalizeScientificName(wcvpAccepted.family) === normalizeScientificName(wfoFamily) ? "MATCH" : "CONFLICT";
      if (crossCheck === "CONFLICT") { recordConflicts.push({ sourceRecordId: candidate.sessionPlantId, code: "WCVP_WFO_ACCEPTED_OR_RANK_CONFLICT" }); }
    }
    if (parsed.kind === "cultivar") { recordConflicts.push({ sourceRecordId: candidate.sessionPlantId, code: "ICRA_EVIDENCE_MISSING" }); }
    if (parsed.kind === "mixed_group") { recordConflicts.push({ sourceRecordId: candidate.sessionPlantId, code: "MIXED_GROUP_NOT_A_SINGLE_TAXON" }); }
    recordConflicts.push({ sourceRecordId: candidate.sessionPlantId, code: "HUMAN_REVIEW_REQUIRED" });
    conflicts.push(...recordConflicts);
    return {
      sourceRecordId: candidate.sessionPlantId,
      sourceLine: candidate.sourceLine,
      sourceLineSha256: candidate.sourceLineSha256,
      rawScientificName: candidate.scientificName,
      parsedKind: parsed.kind,
      normalizedQuery: normalizeScientificName(parsed.lookupName),
      decision: "QUARANTINE",
      decisionReasons: recordConflicts.map((item) => item.code),
      wcvp: wcvpMatch ? { taxonId: wcvpMatch.taxonId, scientificNameId: wcvpMatch.scientificNameId, taxonomicStatus: wcvpMatch.status, acceptedScientificName: wcvpAccepted?.scientificName ?? null, rank: wcvpAccepted?.rank ?? null, genus: wcvpAccepted?.genus ?? null, family: wcvpAccepted?.family ?? null, parentChain } : null,
      wfo: wfoMatch ? { taxonId: wfoMatch.taxonId, scientificNameId: wfoMatch.scientificNameId, taxonomicStatus: wfoMatch.status, acceptedScientificName: wfoAccepted?.scientificName ?? null, rank: wfoAccepted?.rank ?? null, genus: wfoAccepted?.genus ?? null, family: wfoParentChain?.find((item) => normalizeScientificName(item.rank) === "family")?.scientificName ?? null, parentChain: wfoParentChain, crossCheck } : null,
      cultivar: parsed.kind === "cultivar" ? { cultivarName: parsed.cultivarName, status: "ICRA_EVIDENCE_MISSING" } : null,
    };
  });
  const manifest = {
    manifestVersion: "taxonomy-authority-replay/v1",
    ticketId: "z8v0kmr9gm",
    generatedAt: new Date().toISOString(),
    sourceSnapshot: { path: candidatePath, sha256: sha256File(candidatePath), records: candidates.length },
    authorityArtifacts: {
      wcvp: { ...wcvpEvidence, selection: { scannedRows: wcvpSelection.scannedRows, retainedRows: wcvpSelection.retainedRows } },
      wfo: { ...wfoEvidence, selection: { scannedRows: wfoSelection.scannedRows, retainedRows: wfoSelection.retainedRows } },
    },
    summary: { total: records.length, active: 0, quarantined: records.length, wcvpExactMatched, wfoCrossChecked, conflicts: conflicts.length },
    records,
  };
  writeOutputs(outputDirectory, manifest, conflicts);
  return { manifest, conflicts };
}

function parseCliArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) { throw new Error(`无效参数：${key ?? ""}`); }
    values[key.slice(2)] = value;
  }
  return values;
}

async function main() {
  const args = parseCliArguments(process.argv.slice(2));
  const result = await runTaxonomyAuthorityReplay({
    candidatePath: args.candidate,
    expectedCandidateSha256: args["candidate-sha256"],
    outputDirectory: args.output,
    wcvp: { artifactPath: args["wcvp-artifact"], expectedArtifactSha256: args["wcvp-artifact-sha256"], taxonPath: args["wcvp-taxon"], expectedTaxonSha256: args["wcvp-taxon-sha256"], taxonEntry: args["wcvp-taxon-entry"], emlPath: args["wcvp-eml"], sourceUrl: args["wcvp-source-url"], sourceVersion: args["wcvp-source-version"] },
    wfo: { artifactPath: args["wfo-artifact"], artifactFileName: args["wfo-artifact-file-name"], expectedArtifactSha256: args["wfo-artifact-sha256"], taxonPath: args["wfo-taxon"], expectedTaxonSha256: args["wfo-taxon-sha256"], taxonEntry: args["wfo-taxon-entry"], namePath: args["wfo-name"], expectedNameSha256: args["wfo-name-sha256"], nameEntry: args["wfo-name-entry"], synonymPath: args["wfo-synonym"], expectedSynonymSha256: args["wfo-synonym-sha256"], synonymEntry: args["wfo-synonym-entry"], releasePath: args["wfo-release"], expectedReleaseSha256: args["wfo-release-sha256"], sourceVersion: args["wfo-source-version"], termsUrl: args["wfo-terms-url"] },
  });
  process.stdout.write(`${JSON.stringify(result.manifest.summary)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
