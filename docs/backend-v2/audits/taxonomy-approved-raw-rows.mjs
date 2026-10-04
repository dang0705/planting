import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const hash = value => createHash('sha256').update(value).digest('hex');
const normalizedHeader = value => value.replace(/^\uFEFF/u, '').toLowerCase().replace(/[^a-z0-9]/gu, '');

/** 文件全文摘要绑定已核验回放来源，防止命令行把另一个版本的原始表混入本批证据。 */
async function hashSourceFile(filePath) {
  const digest = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) digest.update(chunk);
  return digest.digest('hex');
}

/** 核对三张官方原始表和回放制品使用的是同一批字节。 */
export async function verifyAuthoritySourceFiles(replay, files) {
  const expected = {
    wcvp: replay?.authorityArtifacts?.wcvp?.taxonSha256,
    wfoTaxon: replay?.authorityArtifacts?.wfo?.taxonSha256,
    wfoName: replay?.authorityArtifacts?.wfo?.nameSha256
  };
  const actual = {};
  for (const key of Object.keys(expected)) {
    if (!/^[a-f0-9]{64}$/u.test(expected[key] ?? '')) throw new Error(`回放制品缺少原始文件摘要：${key}`);
    actual[key] = await hashSourceFile(files[key]);
    if (actual[key] !== expected[key]) throw new Error(`原始文件摘要不一致：${key}`);
  }
  return actual;
}

/** 只为需要的分类 ID 保留官方表原始行，扫描全表时不把整张表载入内存。 */
async function collectRawRows(filePath, delimiter, idColumns, wantedIds) {
  const selected = new Map();
  const input = fs.createReadStream(filePath, { encoding: 'utf8' });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let idColumn = -1;
  let lineNumber = 0;
  for await (const line of lines) {
    lineNumber += 1;
    if (lineNumber === 1) {
      const headers = line.split(delimiter).map(normalizedHeader);
      idColumn = idColumns.map(column => headers.indexOf(column)).find(index => index >= 0) ?? -1;
      if (idColumn < 0) throw new Error(`原始表缺少身份列：${filePath}`);
      continue;
    }
    const id = line.split(delimiter)[idColumn];
    if (!wantedIds.has(id)) continue;
    if (selected.has(id)) throw new Error(`原始表存在重复身份行：${filePath} ${id}`);
    selected.set(id, { id, line: lineNumber, rawRowSha256: hash(line) });
  }
  for (const id of wantedIds) {
    if (!selected.has(id)) throw new Error(`缺少原始行：${filePath} ${id}`);
  }
  return selected;
}

/** 分类种、属、科的关键断言只接收权威回放与已批准清单一致的记录。 */
function validateCandidate(approved, replay) {
  if (
    !replay ||
    approved.sourceLineSha256 !== replay.sourceLineSha256 ||
    approved.authorityTaxonId !== replay.wcvp?.parentChain?.[0]?.taxonId ||
    approved.acceptedScientificName !== replay.wcvp?.acceptedScientificName ||
    approved.genus !== replay.wcvp?.genus ||
    approved.family !== replay.wcvp?.family ||
    replay.wcvp?.rank?.toLowerCase() !== 'species' ||
    replay.wfo?.crossCheck !== 'MATCH' ||
    !Array.isArray(replay.wcvp.parentChain) ||
    !Array.isArray(replay.wfo.parentChain) ||
    !replay.wfo.parentChain.some(row => row.rank === 'family' && row.scientificName === approved.family)
  ) {
    throw new Error(`候选与权威回放不一致：${approved.sourceRecordId}`);
  }
}

/** 批量补齐已批准候选的原始行哈希；输出仅为审核证据，不赋予准入或发布资格。 */
export async function buildApprovedRawRowEvidence({ approved, replay, files }) {
  if (!Array.isArray(approved?.records) || !Array.isArray(replay?.records)) {
    throw new Error('批准清单与权威回放必须包含 records');
  }
  const eligible = approved.records.filter(record => record.seedEligible === true);
  const eligibleIds = eligible.map(record => record.sourceRecordId);
  if (new Set(eligibleIds).size !== eligibleIds.length) {
    throw new Error('批准清单存在重复来源编号');
  }
  const replayIds = replay.records.map(record => record.sourceRecordId);
  if (new Set(replayIds).size !== replayIds.length) {
    throw new Error('权威回放存在重复来源编号');
  }
  const replayById = new Map(replay.records.map(record => [record.sourceRecordId, record]));
  const wantedWcvp = new Set();
  const wantedWfoTaxon = new Set();
  const wantedWfoName = new Set();
  for (const candidate of eligible) {
    const source = replayById.get(candidate.sourceRecordId);
    validateCandidate(candidate, source);
    for (const row of source.wcvp.parentChain) wantedWcvp.add(row.taxonId);
    wantedWcvp.add(source.wcvp.taxonId);
    for (const row of source.wfo.parentChain) {
      wantedWfoTaxon.add(row.taxonId);
      wantedWfoName.add(row.nameId);
    }
  }
  const [wcvpRows, wfoTaxonRows, wfoNameRows] = await Promise.all([
    collectRawRows(files.wcvp, '|', ['taxonid', 'plantnameid'], wantedWcvp),
    collectRawRows(files.wfoTaxon, '\t', ['id'], wantedWfoTaxon),
    collectRawRows(files.wfoName, '\t', ['id'], wantedWfoName)
  ]);
  return eligible.map(candidate => {
    const source = replayById.get(candidate.sourceRecordId);
    return {
      sourceRecordId: candidate.sourceRecordId,
      manifestIndex: candidate.manifestIndex,
      decision: 'EVIDENCE_ONLY_NOT_ADMITTED',
      wcvpRows: [source.wcvp.taxonId, ...source.wcvp.parentChain.map(row => row.taxonId)]
        .filter((id, index, ids) => ids.indexOf(id) === index).map(id => wcvpRows.get(id)),
      wfoTaxonRows: source.wfo.parentChain.map(row => wfoTaxonRows.get(row.taxonId)),
      wfoNameRows: source.wfo.parentChain.map(row => wfoNameRows.get(row.nameId))
    };
  });
}

/** 命令行只读取已固定的本地来源，不联网、不写数据库且拒绝覆盖已有证据文件。 */
async function main(args) {
  const options = Object.fromEntries(args.map((value, index) => [value, args[index + 1]]).filter(([key]) => key.startsWith('--')));
  const required = ['--approved', '--replay', '--wcvp', '--wfo-taxon', '--wfo-name', '--output'];
  if (required.some(key => !options[key])) throw new Error(`缺少参数：${required.filter(key => !options[key]).join(', ')}`);
  if (fs.existsSync(options['--output'])) throw new Error('拒绝覆盖已有原始行证据文件');
  const approved = JSON.parse(fs.readFileSync(options['--approved'], 'utf8'));
  const replay = JSON.parse(fs.readFileSync(options['--replay'], 'utf8'));
  const files = { wcvp: options['--wcvp'], wfoTaxon: options['--wfo-taxon'], wfoName: options['--wfo-name'] };
  const sourceSha256 = await verifyAuthoritySourceFiles(replay, files);
  const evidence = await buildApprovedRawRowEvidence({
    approved, replay, files
  });
  if (evidence.length !== 106) throw new Error(`准入候选数量不是 106：${evidence.length}`);
  const header = {
    kind: 'header', schemaVersion: 'taxonomy-approved-raw-rows/v1', records: evidence.length,
    approvedManifestSha256: hash(fs.readFileSync(options['--approved'])),
    replayManifestSha256: hash(fs.readFileSync(options['--replay'])),
    sourceSha256, admitted: 0
  };
  const content = [header, ...evidence].map(record => JSON.stringify(record)).join('\n') + '\n';
  fs.writeFileSync(options['--output'], content, { flag: 'wx' });
  process.stdout.write(JSON.stringify({ records: evidence.length, output: path.resolve(options['--output']), sha256: hash(content), admitted: 0 }) + '\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
