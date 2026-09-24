import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, test } from "vitest";

import { findProjectRoot } from "./support/project-root.js";

/**
 * Expected 来源：WCVP 官方 2026-06-04 数据记录（CC BY 3.0）与 WFO 官方 2026-06
 * taxonomic backbone（CC0）中的原始记录；目标学名、等级、逐级父链和“中文展示名待负责人选择”
 * 另由 `taxonomy-transform-pending-rebuild.md` 硬锁。测试层次：`unit_real_data`，内嵌的仅为
 * 获许可的少量原始记录行，不包含外网调用、CMS、数据库或审批副作用。
 *
 * 覆盖维度：U1 适用（缺少父级记录必须失败）；U2 适用（原始记录变更导致 SHA 不匹配）；
 * U3 适用（错误来源身份/关系不得通过）。U4 N/A（纯只读校验无写入可幂等）；U5 N/A
 *（无持久化副作用可回滚）；U6 N/A（工具不写共享状态）；U7 N/A（不存在用户态）。
 */
describe("P1 记录 29 水仙分类证据回放", () => {
  const projectRoot = findProjectRoot();
  const temporaryDirectories: string[] = [];
  const evidencePath = path.join(
    projectRoot,
    "docs/backend-v2/audits/taxonomy-evidence/29-narcissus-tazetta-subsp-chinensis.json",
  );

  afterEach(() => {
    let directory: string | undefined;
    while ((directory = temporaryDirectories.pop())) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  /**
   * 写入用来验证逐记录哈希与父链的最小官方记录夹具。
   * WCVP 行遵循 CC BY 3.0，WFO 行来自 CC0 分类骨干；不会写入仓库。
   */
  function createSourceFixture(): {
    /** WCVP 数据表路径；文件仅含表头和目标链三行。 */
    wcvpTaxonPath: string;
    /** WFO taxon 数据表路径；文件仅含表头和目标链四行。 */
    wfoTaxonPath: string;
    /** WFO name 数据表路径；文件仅含表头和目标链四行。 */
    wfoNamePath: string;
    /** WFO synonym 数据表路径；测试夹具仅含表头，目标名称不是异名映射。 */
    wfoSynonymPath: string;
  } {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "qinghuazhi-p1-29-"));
    temporaryDirectories.push(directory);

    const wcvpRows = [
      "taxonid|family|genus|specificepithet|infraspecificepithet|scientfiicname|scientfiicnameauthorship|taxonrank|taxonomicstatus|acceptednameusageid|parentnameusageid|originalnameusageid|namepublishedin|nomenclaturalstatus|taxonremarks|scientificnameid|dynamicproperties|references",
      "310501|Amaryllidaceae|Narcissus|tazetta|chinensis|Narcissus tazetta subsp. chinensis|(M.Roem.) Masam. & Yanagita|Subspecies|Accepted|310501|282289|310499|Trans. Nat. Hist. Soc. Formosa 31: 329 (1941)||China (SE. Fujian, E. Zhejiang), coastal WC. & S. Japan|ipni:77189681-1|{\"powoid\":\"77189681-1\",\"lifeform\":\"bulbous geophyte\",\"climate\":\"temperate\",\"homotypicsynonym\":\"\",\"hybridformula\":\"\",\"reviewed\":\"Y\"}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:77189681-1",
      "282289|Amaryllidaceae|Narcissus|tazetta||Narcissus tazetta|L.|Species|Accepted|282289|282547||Sp. Pl.: 290 (1753)||Canary Is., Medit. to Pakistan, SE. China to Japan|ipni:66240-1|{\"powoid\":\"66240-1\",\"lifeform\":\"bulbous geophyte\",\"climate\":\"subtropical\",\"homotypicsynonym\":\"\",\"hybridformula\":\"\",\"reviewed\":\"Y\"}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:66240-1",
      "282547|Amaryllidaceae|Narcissus|||Narcissus|L.|Genus|Accepted|282547|||Sp. Pl.: 289 (1753)||Macaronesia to Afghanistan, SE. China to Japan|ipni:1558-1|{\"powoid\":\"1558-1\",\"lifeform\":\"\",\"climate\":\"\",\"homotypicsynonym\":\"\",\"hybridformula\":\"\",\"reviewed\":\"Y\"}|https://powo.science.kew.org/taxon/urn:lsid:ipni.org:names:1558-1",
    ];
    const wfoTaxonRows = [
      "ID\talternativeID\tnameID\tparentID\taccordingToID\tscrutinizer\tscrutinizerID\tscrutinizerDate\treferenceID\textinct\tlink",
      "wfo-0000771854\twfo:wfo-0000771854-2026-06\twfo-0000771854\twfo-0000700066\t\t\"World Checklist of Vascular Plants. Facilitated by the Royal Botanic Gardens, Kew.: The WFO default classification for this Family follows WCVP 2.0 (2020).\"\thttps://powo.science.kew.org/\t\t\tfalse\thttps://list.worldfloraonline.org/wfo-0000771854-2026-06",
      "wfo-0000700066\twfo:wfo-0000700066-2026-06\twfo-0000700066\twfo-4000025329\t\t\"World Checklist of Vascular Plants. Facilitated by the Royal Botanic Gardens, Kew.: The WFO default classification for this Family follows WCVP 2.0 (2020).\"\thttps://powo.science.kew.org/\t\t\tfalse\thttps://list.worldfloraonline.org/wfo-0000700066-2026-06",
      "wfo-4000025329\twfo:wfo-4000025329-2026-06\twfo-4000025329\twfo-7000000018\t3890986\t\"World Checklist of Vascular Plants. Facilitated by the Royal Botanic Gardens, Kew.: The WFO default classification for this Family follows WCVP 2.0 (2020).\"\thttps://powo.science.kew.org/\t\t3890986,4389750\tfalse\thttps://list.worldfloraonline.org/wfo-4000025329-2026-06",
      "wfo-7000000018\twfo:wfo-7000000018-2026-06\twfo-7000000018\twfo-9000000036\t3890986\t\"World Checklist of Vascular Plants. Facilitated by the Royal Botanic Gardens, Kew.: The WFO default classification for this Family follows WCVP 2.0 (2020).\"\thttps://powo.science.kew.org/\t\t3890986,4389750\tfalse\thttps://list.worldfloraonline.org/wfo-7000000018-2026-06",
    ];
    const wfoNameRows = [
      "ID\talternativeID\tbasionymID\tscientificName\tauthorship\trank\tuninomial\tgenus\tinfragenericEpithet\tspecificEpithet\tinfraspecificEpithet\tcode\treferenceID\tpublishedInYear\tlink",
      "wfo-0000771854\ttpl:kew-310501,urn:lsid:ipni.org:names:77189681-1\twfo-0000771851\t\"Narcissus tazetta subsp. chinensis\"\t\"(M.Roem.) Masamura & Yanagih.\"\tsubspecies\t\tNarcissus\t\ttazetta\tchinensis\tbotanical\t772521_mc\t1941\thttps://list.worldfloraonline.org/wfo-0000771854",
      "wfo-0000700066\ttpl:kew-282289,urn:lsid:ipni.org:names:66240-1,urn:lsid:ipni.org:names:66383-3\t\t\"Narcissus tazetta\"\tL.\tspecies\t\tNarcissus\t\ttazetta\t\tbotanical\t4673947\t1753\thttps://list.worldfloraonline.org/wfo-0000700066",
      "wfo-4000025329\ttropicos:40025195,urn:lsid:ipni.org:names:1558-1,urn:lsid:ipni.org:names:50935325-1,urn:lsid:ipni.org:names:60012328-3,urn:lsid:ipni.org:names:66318-3,urn:lsid:ipni.org:names:66319-3\t\tNarcissus\tL.\tgenus\tNarcissus\t\t\t\t\tbotanical\t4673945\t1753\thttps://list.worldfloraonline.org/wfo-4000025329",
      "wfo-7000000018\ttropicos:42000442,http://www.mobot.org/MOBOT/research/APweb/orders/asparagalesweb.htm#Amaryllidaceae ,urn:lsid:ipni.org:names:30000959-2,urn:lsid:ipni.org:names:50000033-1,urn:lsid:ipni.org:names:60012317-3\t\tAmaryllidaceae\tJ.St.-Hil.\tfamily\tAmaryllidaceae\t\t\t\t\tbotanical\t1509530_mc\t1805\thttps://list.worldfloraonline.org/wfo-7000000018",
    ];
    const wfoSynonymRows = ["ID\ttaxonID\tnameID\taccordingToID\treferenceID\tlink"];

    const paths = {
      wcvpTaxonPath: path.join(directory, "wcvp_taxon.csv"),
      wfoTaxonPath: path.join(directory, "taxon.tsv"),
      wfoNamePath: path.join(directory, "name.tsv"),
      wfoSynonymPath: path.join(directory, "synonym.tsv"),
    };
    fs.writeFileSync(paths.wcvpTaxonPath, `${wcvpRows.join("\n")}\n`, "utf8");
    fs.writeFileSync(paths.wfoTaxonPath, `${wfoTaxonRows.join("\n")}\n`, "utf8");
    fs.writeFileSync(paths.wfoNamePath, `${wfoNameRows.join("\n")}\n`, "utf8");
    fs.writeFileSync(paths.wfoSynonymPath, `${wfoSynonymRows.join("\n")}\n`, "utf8");
    return paths;
  }

  /**
   * 动态加载新增回放器，避免测试在审计脚本首次落盘前被模块解析阶段短路。
   * 测试仍会实际调用与命令行共用的验证函数，而非另造测试专用实现。
   */
  async function loadVerifier(): Promise<{
    /** 校验目标记录的权威行、哈希及逐级父链。 */
    verifyIdentityRows: (options: {
      /** 被验证的最小证据 JSON 路径。 */
      evidencePath: string;
      /** WCVP 已解出的 taxon 表路径。 */
      wcvpTaxonPath: string;
      /** WFO 已解出的 taxon 表路径。 */
      wfoTaxonPath: string;
      /** WFO 已解出的 name 表路径。 */
      wfoNamePath: string;
      /** WFO 已解出的 synonym 表路径。 */
      wfoSynonymPath: string;
    }) => Promise<{
      /** 证据是否通过源记录与关系校验。 */
      verified: boolean;
      /** 目标 WFO 接受名未被 synonym.tsv 同时声明为异名。 */
      synonymExclusionPassed: boolean;
      /** 来源分类决策仍是候选，不代表人工批准。 */
      classificationDecision: string;
      /** 是否允许进入 seed；本审计必须保持关闭。 */
      mayEnterSeed: boolean;
      /** 是否允许激活；本审计必须保持关闭。 */
      mayActivate: boolean;
      /** 从 WFO 原始行回读出的科→属→种→亚种链。 */
      hierarchy: Array<{ rank: string; name: string; authorityTaxonId: string; parentAuthorityTaxonId: string | null }>;
      /** 当前仍待负责人选择的中文展示名门。 */
      canonicalDisplayNameStatus: string;
      /** 从 WCVP 原始行回读出的属→种→亚种链；该来源未提供独立科节点。 */
      wcvpChain: Array<{ rank: string; name: string; authorityTaxonId: string; parentAuthorityTaxonId: string | null }>;
      /** WCVP 各层记录中携带的科名文本；不是科级稳定 ID。 */
      wcvpFamilyLabel: string;
    }>;
  }> {
    const modulePath = path.join(projectRoot, "docs/backend-v2/audits/taxonomy-evidence/replay-29-narcissus.mjs");
    return import(pathToFileURL(modulePath).href) as Promise<{
      verifyIdentityRows: (options: {
        evidencePath: string;
        wcvpTaxonPath: string;
        wfoTaxonPath: string;
        wfoNamePath: string;
        wfoSynonymPath: string;
      }) => Promise<{
        verified: boolean;
        synonymExclusionPassed: boolean;
        classificationDecision: string;
        mayEnterSeed: boolean;
        mayActivate: boolean;
        hierarchy: Array<{ rank: string; name: string; authorityTaxonId: string; parentAuthorityTaxonId: string | null }>;
        canonicalDisplayNameStatus: string;
        wcvpChain: Array<{ rank: string; name: string; authorityTaxonId: string; parentAuthorityTaxonId: string | null }>;
        wcvpFamilyLabel: string;
      }>;
    }>;
  }

  test("官方 WCVP/WFO 行回放出完整父链，且不自动决定中文展示名或准入", async () => {
    const sourceFixture = createSourceFixture();
    const { verifyIdentityRows } = await loadVerifier();
    const result = await verifyIdentityRows({ evidencePath, ...sourceFixture });

    expect(result.verified).toBe(true);
    expect(result.synonymExclusionPassed).toBe(true);
    expect(result.classificationDecision).toBe("EVIDENCE_CANDIDATE_NOT_APPROVED");
    expect(result.mayEnterSeed).toBe(false);
    expect(result.mayActivate).toBe(false);
    expect(result.hierarchy).toEqual([
      { rank: "family", name: "Amaryllidaceae", authorityTaxonId: "wfo-7000000018", parentAuthorityTaxonId: "wfo-9000000036" },
      { rank: "genus", name: "Narcissus", authorityTaxonId: "wfo-4000025329", parentAuthorityTaxonId: "wfo-7000000018" },
      { rank: "species", name: "Narcissus tazetta", authorityTaxonId: "wfo-0000700066", parentAuthorityTaxonId: "wfo-4000025329" },
      { rank: "subspecies", name: "Narcissus tazetta subsp. chinensis", authorityTaxonId: "wfo-0000771854", parentAuthorityTaxonId: "wfo-0000700066" },
    ]);
    expect(result.canonicalDisplayNameStatus).toBe("PENDING_OWNER_SELECTION");
    expect(result.wcvpChain).toEqual([
      { rank: "genus", name: "Narcissus", authorityTaxonId: "282547", parentAuthorityTaxonId: null },
      { rank: "species", name: "Narcissus tazetta", authorityTaxonId: "282289", parentAuthorityTaxonId: "282547" },
      { rank: "subspecies", name: "Narcissus tazetta subsp. chinensis", authorityTaxonId: "310501", parentAuthorityTaxonId: "282289" },
    ]);
    expect(result.wcvpFamilyLabel).toBe("Amaryllidaceae");
    const evidenceJson = fs.readFileSync(evidencePath, "utf8");
    for (const candidateName of ["水仙", "中国水仙", "水仙花"]) {
      expect(evidenceJson).not.toContain(candidateName);
    }
  });

  test("缺少父链节点或把目标接受名列为异名时失败关闭", async () => {
    const sourceFixture = createSourceFixture();
    const damagedRows = fs
      .readFileSync(sourceFixture.wfoTaxonPath, "utf8")
      .split(/\r?\n/u)
      .filter((line) => !line.startsWith("wfo-4000025329\t"));
    fs.writeFileSync(sourceFixture.wfoTaxonPath, damagedRows.join("\n"), "utf8");
    const { verifyIdentityRows } = await loadVerifier();

    await expect(verifyIdentityRows({ evidencePath, ...sourceFixture })).rejects.toThrow(/缺少|不存在|父链/u);

    const synonymFixture = createSourceFixture();
    fs.writeFileSync(
      synonymFixture.wfoSynonymPath,
      "ID\ttaxonID\tnameID\taccordingToID\treferenceID\tlink\nwrong-accepted-name\twfo-0000771854\twfo-0000771854\t\t\t\n",
      "utf8",
    );
    await expect(verifyIdentityRows({ evidencePath, ...synonymFixture })).rejects.toThrow(/同时出现在 synonym/u);
  });

  test("WCVP 原始记录被改动时逐记录 SHA 检查失败", async () => {
    const sourceFixture = createSourceFixture();
    const wcvpText = fs.readFileSync(sourceFixture.wcvpTaxonPath, "utf8");
    const corrupted = wcvpText.replace("|Accepted|310501|282289|", "|Synonym|310501|282289|");
    fs.writeFileSync(sourceFixture.wcvpTaxonPath, corrupted, "utf8");
    const { verifyIdentityRows } = await loadVerifier();

    await expect(verifyIdentityRows({ evidencePath, ...sourceFixture })).rejects.toThrow(/SHA|哈希|记录不一致/u);
  });
});
