import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

const FIRST_RECORD_INDEX = 0;
const SECOND_RECORD_INDEX = 1;
const THIRD_RECORD_INDEX = 2;
const FOURTH_RECORD_INDEX = 3;
const SHA256_HEX_LENGTH = 64;
const MD5_HEX_LENGTH = 32;
const GIT_CANDIDATE_RECORD_COUNT = 200;
const LEGACY_CANDIDATE_BLOB = "ba8b7c0cc8f8c8c3ab0c5e9105804806f496b877";
const LEGACY_CANDIDATE_SHA256 =
  "de5ad55fa4589ac56481ce684b030d46213fc2bf6d3838d5217248c813f3fac1";
const WFO_ZENODO_RECORD_ID = 20_782_718;
const WFO_ARTIFACT_FILE_NAME = "wfo_plantlist_2026-06.zip";

/**
 * Expected 来源：plant-taxonomy/v1、P1 分类准入 hard gate、Kew WCVP DwC
 * 元数据字段与 WFO 2026-06 发布制品说明。测试层次：unit_real_data。
 *
 * 真实路径：候选 CSV → SHA/来源制品核验 → WCVP 精确匹配及父链 → WFO
 * 交叉核对 → 栽培品种隔离 → 机器 manifest。外部下载和人工 ICRA 审核替换为
 * 与官方制品字段形状一致的临时夹具；因此不声称验证线上 provider。
 */
describe("P1 分类权威来源离线回放流水线", () => {
  const projectRoot = findProjectRoot();
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(FIRST_RECORD_INDEX)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  function sha256(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  function makeFixture(): {
    candidatePath: string;
    wcvpArtifactPath: string;
    wcvpTaxonPath: string;
    wcvpEmlPath: string;
    wfoArtifactPath: string;
    wfoTaxonPath: string;
    wfoNamePath: string;
    wfoSynonymPath: string;
    wfoReleasePath: string;
    outputDirectory: string;
  } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qinghuazhi-taxonomy-"));
    temporaryDirectories.push(directory);

    const candidateCsv = [
      "1,绿萝,null,候选,观叶植物,Foliage,Epipremnum aureum,天南星科,Araceae,Epipremnum,0,null,2026-01-01,2026-01-01",
      "2,黄金葛,null,候选,观叶植物,Foliage,Pothos aureus,天南星科,Araceae,Epipremnum,0,null,2026-01-01,2026-01-01",
      "3,生石花,null,候选,多肉植物,Succulent,Lithops spp.,番杏科,Aizoaceae,Lithops,0,null,2026-01-01,2026-01-01",
      "4,卷叶吊兰,null,候选,观叶植物,Foliage,Chlorophytum comosum 'Bonnie',天门冬科,Asparagaceae,Chlorophytum,0,null,2026-01-01,2026-01-01",
    ].join("\n");
    const wcvpTaxon = [
      "taxonid|family|genus|specificepithet|infraspecificepithet|scientfiicname|scientfiicnameauthorship|taxonrank|taxonomicstatus|acceptednameusageid|parentnameusageid|originalnameusageid|namepublishedin|nomenclaturalstatus|taxonremarks|scientificnameid|dynamicproperties|references",
      "100|Araceae|Epipremnum|||Epipremnum|Schott|Genus|Accepted|100||||||ipni:84445-1|{}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:84445-1",
      "101|Araceae|Epipremnum|aureum||Epipremnum aureum|(Linden & Andre) G.S.Bunting|Species|Accepted|101|100|||||ipni:87263-1|{}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:87263-1",
      "102|Araceae|Pothos|aureus||Pothos aureus|Linden & Andre|Species|Synonym|101|100|||||ipni:87310-1|{}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:87310-1",
      "200|Aizoaceae|Lithops|||Lithops|N.E.Br.|Genus|Accepted|200||||||ipni:16372-1|{}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:16372-1",
      "300|Asparagaceae|Chlorophytum|||Chlorophytum|Ker Gawl.|Genus|Accepted|300||||||ipni:532456-1|{}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:532456-1",
      "301|Asparagaceae|Chlorophytum|comosum||Chlorophytum comosum|Thunb.|Species|Accepted|301|300|||||ipni:532499-1|{}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:532499-1",
    ].join("\n");
    const wfoTaxon = [
      "ID\tnameID\tparentID",
      "wfo-100\tn100\twfo-family-araceae",
      "wfo-101\tn101\twfo-100",
      "wfo-200\tn200\twfo-family-aizoaceae",
      "wfo-300\tn300\twfo-family-asparagaceae",
      "wfo-301\tn301\twfo-300",
      "wfo-family-araceae\tn-family-araceae\t",
      "wfo-family-aizoaceae\tn-family-aizoaceae\t",
      "wfo-family-asparagaceae\tn-family-asparagaceae\t",
    ].join("\n");
    const wfoName = [
      "ID\tscientificName\trank\tgenus",
      "n100\tEpipremnum\tgenus\tEpipremnum",
      "n101\tEpipremnum aureum\tspecies\tEpipremnum",
      "n102\tPothos aureus\tspecies\tPothos",
      "n200\tLithops\tgenus\tLithops",
      "n300\tChlorophytum\tgenus\tChlorophytum",
      "n301\tChlorophytum comosum\tspecies\tChlorophytum",
      "n-family-araceae\tAraceae\tfamily\t",
      "n-family-aizoaceae\tAizoaceae\tfamily\t",
      "n-family-asparagaceae\tAsparagaceae\tfamily\t",
    ].join("\n");
    const wfoSynonym = [
      "ID\ttaxonID\tnameID",
      "syn-102\twfo-101\tn102",
    ].join("\n");
    const wcvpEml = [
      "<eml:eml>",
      "<pubDate>2026-06-04</pubDate>",
      "<intellectualRights>This work is licensed under a Creative Commons Attribution 3.0 Unported (CC BY 3.0) License</intellectualRights>",
      "<citation>The World Checklist of Vascular Plants (WCVP) Facilitated by the Royal Botanic Gardens, Kew. Published on the Internet; https://doi.org/10.34885/egs6-cp24</citation>",
      "</eml:eml>",
    ].join("\n");
    const wfoArtifact = "固定 WFO 原始制品夹具";
    const wfoRelease = JSON.stringify({
      id: WFO_ZENODO_RECORD_ID,
      links: { self: "https://zenodo.org/api/records/20782718" },
      metadata: {
        publication_date: "2026-06-21",
        title: "WFO Plant List 2026-06",
        license: { id: "cc-zero" },
      },
      files: [{
        key: WFO_ARTIFACT_FILE_NAME,
        size: Buffer.byteLength(wfoArtifact),
        checksum: `md5:${createHash("md5").update(wfoArtifact).digest("hex")}`,
      }],
    });

    const paths = {
      candidatePath: path.join(directory, "candidates.csv"),
      wcvpArtifactPath: path.join(directory, "wcvp_dwca.zip"),
      wcvpTaxonPath: path.join(directory, "wcvp_taxon.csv"),
      wcvpEmlPath: path.join(directory, "eml.xml"),
      wfoArtifactPath: path.join(directory, "wfo_plantlist_2026-06.zip"),
      wfoTaxonPath: path.join(directory, "Taxon.tsv"),
      wfoNamePath: path.join(directory, "name.tsv"),
      wfoSynonymPath: path.join(directory, "synonym.tsv"),
      wfoReleasePath: path.join(directory, "wfo-release.json"),
      outputDirectory: path.join(directory, "output"),
    };
    fs.writeFileSync(paths.candidatePath, candidateCsv);
    fs.writeFileSync(paths.wcvpArtifactPath, "固定 WCVP 原始制品夹具");
    fs.writeFileSync(paths.wcvpTaxonPath, wcvpTaxon);
    fs.writeFileSync(paths.wcvpEmlPath, wcvpEml);
    fs.writeFileSync(paths.wfoArtifactPath, wfoArtifact);
    fs.writeFileSync(paths.wfoTaxonPath, wfoTaxon);
    fs.writeFileSync(paths.wfoNamePath, wfoName);
    fs.writeFileSync(paths.wfoSynonymPath, wfoSynonym);
    fs.writeFileSync(paths.wfoReleasePath, wfoRelease);
    return paths;
  }

  async function loadPipeline(): Promise<{
    runTaxonomyAuthorityReplay: (options: Record<string, unknown>) => Promise<{
      manifest: { summary: Record<string, number>; records: Array<Record<string, unknown>> };
      conflicts: Array<{ code: string; sourceRecordId: string }>;
    }>;
    classifyCandidateName: (scientificName: string) => { kind: string };
  }> {
    return import(
      pathToFileURL(
        path.join(projectRoot, "docs/backend-v2/audits/taxonomy-authority-replay.mjs"),
      ).href,
    ) as Promise<{
      runTaxonomyAuthorityReplay: (options: Record<string, unknown>) => Promise<{
        manifest: { summary: Record<string, number>; records: Array<Record<string, unknown>> };
        conflicts: Array<{ code: string; sourceRecordId: string }>;
      }>;
      classifyCandidateName: (scientificName: string) => { kind: string };
    }>;
  }

  function validReplayOptions(fixture: ReturnType<typeof makeFixture>) {
    return {
      candidatePath: fixture.candidatePath,
      expectedCandidateSha256: sha256(fs.readFileSync(fixture.candidatePath, "utf8")),
      wcvp: {
        artifactPath: fixture.wcvpArtifactPath,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wcvpArtifactPath, "utf8")),
        taxonPath: fixture.wcvpTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
        taxonEntry: "wcvp_taxon.csv",
        emlPath: fixture.wcvpEmlPath,
        sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        sourceVersion: "2026-06-04",
      },
      wfo: {
        artifactPath: fixture.wfoArtifactPath,
        artifactFileName: WFO_ARTIFACT_FILE_NAME,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
        taxonPath: fixture.wfoTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
        taxonEntry: "taxon.tsv",
        namePath: fixture.wfoNamePath,
        expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
        nameEntry: "name.tsv",
        synonymPath: fixture.wfoSynonymPath,
        expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
        synonymEntry: "synonym.tsv",
        releasePath: fixture.wfoReleasePath,
        expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
        sourceVersion: "2026-06",
        termsUrl: "https://www.worldfloraonline.org/termsOfUse",
      },
      outputDirectory: fixture.outputDirectory,
    };
  }

  test("精确 WCVP 匹配、WFO 交叉核对和完整父链仍只生成隔离记录", async () => {
    const fixture = makeFixture();
    const { runTaxonomyAuthorityReplay } = await loadPipeline();

    const result = await runTaxonomyAuthorityReplay({
      candidatePath: fixture.candidatePath,
      expectedCandidateSha256: sha256(fs.readFileSync(fixture.candidatePath, "utf8")),
      wcvp: {
        artifactPath: fixture.wcvpArtifactPath,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wcvpArtifactPath, "utf8")),
        taxonPath: fixture.wcvpTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
        taxonEntry: "wcvp_taxon.csv",
        emlPath: fixture.wcvpEmlPath,
        sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        sourceVersion: "2026-06-04",
      },
      wfo: {
        artifactPath: fixture.wfoArtifactPath,
        artifactFileName: WFO_ARTIFACT_FILE_NAME,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
        taxonPath: fixture.wfoTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
        taxonEntry: "taxon.tsv",
        namePath: fixture.wfoNamePath,
        expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
        nameEntry: "name.tsv",
        synonymPath: fixture.wfoSynonymPath,
        expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
        synonymEntry: "synonym.tsv",
        releasePath: fixture.wfoReleasePath,
        expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
        sourceVersion: "2026-06",
        termsUrl: "https://www.worldfloraonline.org/termsOfUse",
      },
      outputDirectory: fixture.outputDirectory,
    });

    expect(result.manifest.summary).toMatchObject({
      total: 4,
      active: 0,
      quarantined: 4,
      wcvpExactMatched: 4,
      wfoCrossChecked: 4,
    });
    expect(result.manifest.records[FIRST_RECORD_INDEX]).toMatchObject({
      sourceRecordId: "1",
      parsedKind: "species",
      decision: "QUARANTINE",
      wcvp: {
        taxonId: "101",
        acceptedScientificName: "Epipremnum aureum",
        taxonomicStatus: "Accepted",
      },
      wfo: { taxonId: "wfo-101", crossCheck: "MATCH" },
    });
    expect(result.manifest.records[SECOND_RECORD_INDEX]).toMatchObject({
      sourceRecordId: "2",
      wcvp: { taxonomicStatus: "Synonym", acceptedScientificName: "Epipremnum aureum" },
    });
    expect(result.manifest.records[THIRD_RECORD_INDEX]).toMatchObject({
      sourceRecordId: "3",
      parsedKind: "genus_spp",
      decision: "QUARANTINE",
      wfo: { crossCheck: "MATCH" },
    });
    expect(result.manifest.records[FOURTH_RECORD_INDEX]).toMatchObject({
      sourceRecordId: "4",
      parsedKind: "cultivar",
      decision: "QUARANTINE",
      cultivar: { status: "ICRA_EVIDENCE_MISSING" },
    });
    expect(result.conflicts).toContainEqual({
      code: "HUMAN_REVIEW_REQUIRED",
      sourceRecordId: "1",
    });
    expect(fs.existsSync(path.join(fixture.outputDirectory, "taxonomy-authority-manifest.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(fixture.outputDirectory, "taxonomy-authority-conflicts.json"))).toBe(
      true,
    );
    expect(fs.existsSync(path.join(fixture.outputDirectory, "taxonomy-authority-summary.json"))).toBe(
      true,
    );
  });

  test("候选快照或权威原始制品哈希不匹配时失败关闭", async () => {
    const fixture = makeFixture();
    const { runTaxonomyAuthorityReplay } = await loadPipeline();

    await expect(
      runTaxonomyAuthorityReplay({
        candidatePath: fixture.candidatePath,
        expectedCandidateSha256: "0".repeat(SHA256_HEX_LENGTH),
        wcvp: {
          artifactPath: fixture.wcvpArtifactPath,
          expectedArtifactSha256: sha256(fs.readFileSync(fixture.wcvpArtifactPath, "utf8")),
          taxonPath: fixture.wcvpTaxonPath,
          expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
          taxonEntry: "wcvp_taxon.csv",
          emlPath: fixture.wcvpEmlPath,
          sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
          sourceVersion: "2026-06-04",
        },
        wfo: {
          artifactPath: fixture.wfoArtifactPath,
          artifactFileName: WFO_ARTIFACT_FILE_NAME,
          expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
          taxonPath: fixture.wfoTaxonPath,
          expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
          taxonEntry: "taxon.tsv",
          namePath: fixture.wfoNamePath,
          expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
          nameEntry: "name.tsv",
          synonymPath: fixture.wfoSynonymPath,
          expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
          synonymEntry: "synonym.tsv",
          releasePath: fixture.wfoReleasePath,
          expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
          sourceVersion: "2026-06",
          termsUrl: "https://www.worldfloraonline.org/termsOfUse",
        },
        outputDirectory: fixture.outputDirectory,
      }),
    ).rejects.toThrow("候选 CSV SHA-256 不匹配");

    await expect(
      runTaxonomyAuthorityReplay({
        candidatePath: fixture.candidatePath,
        expectedCandidateSha256: sha256(fs.readFileSync(fixture.candidatePath, "utf8")),
        wcvp: {
          artifactPath: fixture.wcvpArtifactPath,
          expectedArtifactSha256: "0".repeat(SHA256_HEX_LENGTH),
          taxonPath: fixture.wcvpTaxonPath,
          expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
          taxonEntry: "wcvp_taxon.csv",
          emlPath: fixture.wcvpEmlPath,
          sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
          sourceVersion: "2026-06-04",
        },
        wfo: {
          artifactPath: fixture.wfoArtifactPath,
          artifactFileName: WFO_ARTIFACT_FILE_NAME,
          expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
          taxonPath: fixture.wfoTaxonPath,
          expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
          taxonEntry: "taxon.tsv",
          namePath: fixture.wfoNamePath,
          expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
          nameEntry: "name.tsv",
          synonymPath: fixture.wfoSynonymPath,
          expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
          synonymEntry: "synonym.tsv",
          releasePath: fixture.wfoReleasePath,
          expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
          sourceVersion: "2026-06",
          termsUrl: "https://www.worldfloraonline.org/termsOfUse",
        },
        outputDirectory: fixture.outputDirectory,
      }),
    ).rejects.toThrow("WCVP 原始制品 SHA-256 不匹配");
  });

  test("Zenodo 官方 files[] 的 size 或 MD5 与本地 WFO ZIP 不符时失败关闭", async () => {
    const fixture = makeFixture();
    const release = JSON.parse(fs.readFileSync(fixture.wfoReleasePath, "utf8")) as {
      files: Array<{ checksum: string }>;
    };
    const firstFile = release.files[FIRST_RECORD_INDEX];
    if (!firstFile) { throw new Error("WFO release 夹具缺少 files[0]"); }
    firstFile.checksum = `md5:${"0".repeat(MD5_HEX_LENGTH)}`;
    fs.writeFileSync(fixture.wfoReleasePath, JSON.stringify(release));
    const { runTaxonomyAuthorityReplay } = await loadPipeline();

    await expect(runTaxonomyAuthorityReplay({
      candidatePath: fixture.candidatePath,
      expectedCandidateSha256: sha256(fs.readFileSync(fixture.candidatePath, "utf8")),
      wcvp: {
        artifactPath: fixture.wcvpArtifactPath,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wcvpArtifactPath, "utf8")),
        taxonPath: fixture.wcvpTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
        taxonEntry: "wcvp_taxon.csv",
        emlPath: fixture.wcvpEmlPath,
        sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        sourceVersion: "2026-06-04",
      },
      wfo: {
        artifactPath: fixture.wfoArtifactPath,
        artifactFileName: WFO_ARTIFACT_FILE_NAME,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
        taxonPath: fixture.wfoTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
        taxonEntry: "taxon.tsv",
        namePath: fixture.wfoNamePath,
        expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
        nameEntry: "name.tsv",
        synonymPath: fixture.wfoSynonymPath,
        expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
        synonymEntry: "synonym.tsv",
        releasePath: fixture.wfoReleasePath,
        expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
        sourceVersion: "2026-06",
        termsUrl: "https://www.worldfloraonline.org/termsOfUse",
      },
      outputDirectory: fixture.outputDirectory,
    })).rejects.toThrow("WFO Zenodo files[] 与本地原始制品的文件名、size 或 MD5 不一致");
  });

  test("Zenodo 原始 release 不是 cc-zero 时拒绝把它作为 WFO 分类证据", async () => {
    const fixture = makeFixture();
    const release = JSON.parse(fs.readFileSync(fixture.wfoReleasePath, "utf8")) as {
      metadata: { license: { id: string } };
    };
    release.metadata.license.id = "cc-by-4.0";
    fs.writeFileSync(fixture.wfoReleasePath, JSON.stringify(release));
    const options = validReplayOptions(fixture);
    const { runTaxonomyAuthorityReplay } = await loadPipeline();

    await expect(runTaxonomyAuthorityReplay(options)).rejects.toThrow("声明 cc-zero 许可");
  });

  test("WCVP 表任一行不是官方固定的 18 列时拒绝继续解析", async () => {
    const fixture = makeFixture();
    fs.appendFileSync(fixture.wcvpTaxonPath, "\n999|broken|row");
    const options = validReplayOptions(fixture);
    const { runTaxonomyAuthorityReplay } = await loadPipeline();

    await expect(runTaxonomyAuthorityReplay(options)).rejects.toThrow("WCVP taxon 文件 第");
  });

  test("未匹配的名称与已有输出目录均保持隔离，不能静默猜测或覆盖审计证据", async () => {
    const fixture = makeFixture();
    fs.writeFileSync(
      fixture.candidatePath,
      "900,未知植物,null,候选,观叶植物,Foliage,Unverified plantus,未知科,Unknown,Unverified,0,null,2026-01-01,2026-01-01\n",
    );
    const { runTaxonomyAuthorityReplay } = await loadPipeline();
    const options = {
      candidatePath: fixture.candidatePath,
      expectedCandidateSha256: sha256(fs.readFileSync(fixture.candidatePath, "utf8")),
      wcvp: {
        artifactPath: fixture.wcvpArtifactPath,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wcvpArtifactPath, "utf8")),
        taxonPath: fixture.wcvpTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
        taxonEntry: "wcvp_taxon.csv",
        emlPath: fixture.wcvpEmlPath,
        sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        sourceVersion: "2026-06-04",
      },
      wfo: {
        artifactPath: fixture.wfoArtifactPath,
        artifactFileName: WFO_ARTIFACT_FILE_NAME,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
        taxonPath: fixture.wfoTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
        taxonEntry: "taxon.tsv",
        namePath: fixture.wfoNamePath,
        expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
        nameEntry: "name.tsv",
        synonymPath: fixture.wfoSynonymPath,
        expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
        synonymEntry: "synonym.tsv",
        releasePath: fixture.wfoReleasePath,
        expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
        sourceVersion: "2026-06",
        termsUrl: "https://www.worldfloraonline.org/termsOfUse",
      },
      outputDirectory: fixture.outputDirectory,
    };

    const result = await runTaxonomyAuthorityReplay(options);
    expect(result.manifest.records[FIRST_RECORD_INDEX]).toMatchObject({
      decision: "QUARANTINE",
      decisionReasons: expect.arrayContaining(["WCVP_EXACT_MATCH_MISSING", "HUMAN_REVIEW_REQUIRED"]),
    });
    await expect(runTaxonomyAuthorityReplay(options)).rejects.toThrow("输出目录必须为空");
  });

  test("仅独立 x 或乘号才表示杂交，名称中的普通字母 x 不是杂交标记", async () => {
    const { classifyCandidateName } = await loadPipeline();

    expect(classifyCandidateName("Oxalis triangularis").kind).toBe("species");
    expect(classifyCandidateName("Rosa x centifolia").kind).toBe("hybrid");
    expect(classifyCandidateName("Rosa × centifolia").kind).toBe("hybrid");
  });

  test("真实 Git 候选快照保持 200 条且无人工裁决时不能被自动放行", async () => {
    const fixture = makeFixture();
    const candidates = execFileSync("git", ["cat-file", "blob", LEGACY_CANDIDATE_BLOB], {
      cwd: projectRoot,
      encoding: "utf8",
    });
    fs.writeFileSync(fixture.candidatePath, candidates);
    const { runTaxonomyAuthorityReplay } = await loadPipeline();

    const result = await runTaxonomyAuthorityReplay({
      candidatePath: fixture.candidatePath,
      expectedCandidateSha256: LEGACY_CANDIDATE_SHA256,
      wcvp: {
        artifactPath: fixture.wcvpArtifactPath,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wcvpArtifactPath, "utf8")),
        taxonPath: fixture.wcvpTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wcvpTaxonPath, "utf8")),
        taxonEntry: "wcvp_taxon.csv",
        emlPath: fixture.wcvpEmlPath,
        sourceUrl: "https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip",
        sourceVersion: "2026-06-04",
      },
      wfo: {
        artifactPath: fixture.wfoArtifactPath,
        artifactFileName: WFO_ARTIFACT_FILE_NAME,
        expectedArtifactSha256: sha256(fs.readFileSync(fixture.wfoArtifactPath, "utf8")),
        taxonPath: fixture.wfoTaxonPath,
        expectedTaxonSha256: sha256(fs.readFileSync(fixture.wfoTaxonPath, "utf8")),
        taxonEntry: "taxon.tsv",
        namePath: fixture.wfoNamePath,
        expectedNameSha256: sha256(fs.readFileSync(fixture.wfoNamePath, "utf8")),
        nameEntry: "name.tsv",
        synonymPath: fixture.wfoSynonymPath,
        expectedSynonymSha256: sha256(fs.readFileSync(fixture.wfoSynonymPath, "utf8")),
        synonymEntry: "synonym.tsv",
        releasePath: fixture.wfoReleasePath,
        expectedReleaseSha256: sha256(fs.readFileSync(fixture.wfoReleasePath, "utf8")),
        sourceVersion: "2026-06",
        termsUrl: "https://www.worldfloraonline.org/termsOfUse",
      },
      outputDirectory: fixture.outputDirectory,
    });

    expect(result.manifest.summary).toMatchObject({
      total: GIT_CANDIDATE_RECORD_COUNT,
      active: FIRST_RECORD_INDEX,
      quarantined: GIT_CANDIDATE_RECORD_COUNT,
    });
    expect(result.manifest.records).toHaveLength(GIT_CANDIDATE_RECORD_COUNT);
  });
});
