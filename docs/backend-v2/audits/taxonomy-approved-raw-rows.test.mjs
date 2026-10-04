import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { buildApprovedRawRowEvidence, verifyAuthoritySourceFiles } from './taxonomy-approved-raw-rows.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

test('已批准候选按原始行计算双来源父链摘要，不放行身份', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taxonomy-approved-rows-'));
  try {
    const files = {
      wcvp: path.join(root, 'wcvp.csv'),
      wfoTaxon: path.join(root, 'taxon.tsv'),
      wfoName: path.join(root, 'name.tsv')
    };
    fs.writeFileSync(files.wcvp, 'taxonID|scientificName\n70475|Scindapsus aureus\n70476|Epipremnum aureum\n70472|Epipremnum\n');
    fs.writeFileSync(files.wfoTaxon, 'id\tnameID\nwfo-1\twfo-1\nwfo-2\twfo-2\nwfo-3\twfo-3\n');
    fs.writeFileSync(files.wfoName, 'id\tscientificName\nwfo-1\tEpipremnum aureum\nwfo-2\tEpipremnum\nwfo-3\tAraceae\n');
    const approved = { records: [
      { sourceRecordId: '1', seedEligible: true, authorityTaxonId: '70476', acceptedScientificName: 'Epipremnum aureum', genus: 'Epipremnum', family: 'Araceae', sourceLineSha256: hash('candidate-1') },
      { sourceRecordId: '2', seedEligible: false, authorityTaxonId: 'other' }
    ] };
    const replay = { records: [{
      sourceRecordId: '1', sourceLineSha256: hash('candidate-1'),
      wcvp: { taxonId: '70475', acceptedScientificName: 'Epipremnum aureum', rank: 'Species', genus: 'Epipremnum', family: 'Araceae', parentChain: [{ taxonId: '70476' }, { taxonId: '70472' }] },
      wfo: { crossCheck: 'MATCH', parentChain: [
        { taxonId: 'wfo-1', nameId: 'wfo-1', scientificName: 'Epipremnum aureum', rank: 'species' },
        { taxonId: 'wfo-2', nameId: 'wfo-2', scientificName: 'Epipremnum', rank: 'genus' },
        { taxonId: 'wfo-3', nameId: 'wfo-3', scientificName: 'Araceae', rank: 'family' }
      ] }
    }] };
    const evidence = await buildApprovedRawRowEvidence({ approved, replay, files });
    assert.equal(evidence.length, 1);
    assert.equal(evidence[0].decision, 'EVIDENCE_ONLY_NOT_ADMITTED');
    assert.deepEqual(evidence[0].wcvpRows.map(row => row.rawRowSha256), [
      hash('70475|Scindapsus aureus'), hash('70476|Epipremnum aureum'), hash('70472|Epipremnum')
    ]);
    assert.deepEqual(evidence[0].wfoTaxonRows.map(row => row.rawRowSha256), [
      hash('wfo-1\twfo-1'), hash('wfo-2\twfo-2'), hash('wfo-3\twfo-3')
    ]);
    assert.equal(evidence[0].wfoNameRows[2].rawRowSha256, hash('wfo-3\tAraceae'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('缺少权威父级原始行时失败关闭，不生成部分证据', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taxonomy-missing-parent-'));
  try {
    const files = {
      wcvp: path.join(root, 'wcvp.csv'),
      wfoTaxon: path.join(root, 'taxon.tsv'),
      wfoName: path.join(root, 'name.tsv')
    };
    fs.writeFileSync(files.wcvp, 'taxonID|scientificName\n70476|Epipremnum aureum\n');
    fs.writeFileSync(files.wfoTaxon, 'id\tnameID\nwfo-1\twfo-1\n');
    fs.writeFileSync(files.wfoName, 'id\tscientificName\nwfo-1\tEpipremnum aureum\n');
    const approved = { records: [{ sourceRecordId: '1', seedEligible: true, authorityTaxonId: '70476', acceptedScientificName: 'Epipremnum aureum', genus: 'Epipremnum', family: 'Araceae', sourceLineSha256: hash('candidate-1') }] };
    const replay = { records: [{ sourceRecordId: '1', sourceLineSha256: hash('candidate-1'), wcvp: { taxonId: '70476', acceptedScientificName: 'Epipremnum aureum', rank: 'Species', genus: 'Epipremnum', family: 'Araceae', parentChain: [{ taxonId: '70476' }, { taxonId: '70472' }] }, wfo: { crossCheck: 'MATCH', parentChain: [{ taxonId: 'wfo-1', nameId: 'wfo-1', scientificName: 'Epipremnum aureum', rank: 'species' }, { taxonId: 'wfo-2', nameId: 'wfo-2', scientificName: 'Epipremnum', rank: 'genus' }, { taxonId: 'wfo-3', nameId: 'wfo-3', scientificName: 'Araceae', rank: 'family' }] } }] };
    await assert.rejects(buildApprovedRawRowEvidence({ approved, replay, files }), /缺少原始行/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('原始文件摘要与已核验回放制品不同时拒绝生成证据', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'taxonomy-wrong-source-'));
  try {
    const files = { wcvp: path.join(root, 'wcvp.csv'), wfoTaxon: path.join(root, 'taxon.tsv'), wfoName: path.join(root, 'name.tsv') };
    for (const file of Object.values(files)) fs.writeFileSync(file, 'changed-source\n');
    const replay = { authorityArtifacts: { wcvp: { taxonSha256: hash('official-wcvp') }, wfo: { taxonSha256: hash('official-taxon'), nameSha256: hash('official-name') } } };
    await assert.rejects(verifyAuthoritySourceFiles(replay, files), /摘要不一致/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('批准清单重复来源编号时拒绝用重复项凑满数量', async () => {
  const record = { sourceRecordId: '1', seedEligible: true };
  await assert.rejects(
    buildApprovedRawRowEvidence({ approved: { records: [record, record] }, replay: { records: [] }, files: {} }),
    /重复来源编号/u
  );
});
