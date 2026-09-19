# P1 植物分类权威来源离线回放

适用 ClickUp `z8v0kmr9gm`。这是一个本地、可回放的审计工具，既不是 CloudBase
函数，也不调用网络、更不写入 CMS 或 MySQL。工具只生成审计制品，绝不会生成
`ACTIVE`；人工复核仍是唯一的准入门。

## 固定输入与来源角色

候选输入必须从 Git 固定版本明确导出，而不是读取工作区可能已删除或被改写的文件：

```sh
git show HEAD:docs/plant_catalog.csv > /tmp/qinghuazhi-taxonomy/plant_catalog.HEAD.csv
shasum -a 256 /tmp/qinghuazhi-taxonomy/plant_catalog.HEAD.csv
```

当前 HEAD 快照为 200 条、SHA-256
`de5ad55fa4589ac56481ce684b030d46213fc2bf6d3838d5217248c813f3fac1`。
CSV 没有表头，工具固定按 14 列解析；列数、必填 ID 或科学名不符合即失败关闭。

- **主要分类依据：WCVP**。下载仅允许 Kew 官方目录
  [WCVP data repository](https://sftp.kew.org/pub/data-repositories/WCVP/) 的
  `wcvp_dwca.zip`；其 `eml.xml` 必须声明同一发布日期和 CC BY 3.0。
- **交叉核对：WFO**。下载仅允许
  [WFO Plant List 2026-06 Zenodo record](https://zenodo.org/records/20782718)；
  Release 元数据必须是该记录的原始 API 响应，而非手写 JSON。分类条款 URL 固定为
  [WFO Terms of Use](https://www.worldfloraonline.org/termsOfUse)，其中分类骨干为 CC0。
- **栽培品种：RHS/ICRA 人工路线**。`'Cultivar'` 只被隔离，工具不会拿 WCVP/WFO
  替代 ICRA 注册证据。按 [ISHS ICRA directory](https://www.ishs.org/sci/icralist/icralist.htm)
  路由至对应注册机构，再附其官方 register/publication 的稳定证据。

POWO 可作为人工阅读时的 Kew 展示面，但与 WCVP 共享骨干，不能把两者计算为独立
交叉证据；本工具不调用其在线 API。

## 制品固定、解压与链路证明

下载包一律留在 `/tmp`（或另一个仓库外目录），严禁提交 ZIP 或解压大表。先记录原始
ZIP SHA，再用下面**明确的 entry 名**解出表；分别记录解出文件 SHA。这条链把工具的
独立路径同其原始 ZIP 绑定，避免将任意同名表误认为权威制品。

```sh
unzip -p /tmp/qinghuazhi-taxonomy/wcvp_dwca.zip wcvp_taxon.csv \
  > /tmp/qinghuazhi-taxonomy/wcvp_taxon.csv
unzip -p /tmp/qinghuazhi-taxonomy/wcvp_dwca.zip eml.xml \
  > /tmp/qinghuazhi-taxonomy/wcvp_eml.xml
unzip -p /tmp/qinghuazhi-taxonomy/wfo_plantlist_2026-06.zip taxon.tsv \
  > /tmp/qinghuazhi-taxonomy/wfo_taxon.tsv
unzip -p /tmp/qinghuazhi-taxonomy/wfo_plantlist_2026-06.zip name.tsv \
  > /tmp/qinghuazhi-taxonomy/wfo_name.tsv
unzip -p /tmp/qinghuazhi-taxonomy/wfo_plantlist_2026-06.zip synonym.tsv \
  > /tmp/qinghuazhi-taxonomy/wfo_synonym.tsv
curl --fail --location --output /tmp/qinghuazhi-taxonomy/zenodo-record-20782718.json \
  https://zenodo.org/api/records/20782718
shasum -a 256 /tmp/qinghuazhi-taxonomy/{wcvp_dwca.zip,wcvp_taxon.csv,wcvp_eml.xml,wfo_plantlist_2026-06.zip,wfo_taxon.tsv,wfo_name.tsv,wfo_synonym.tsv,zenodo-record-20782718.json}
```

`zenodo-record-20782718.json` 是原始 API 响应：工具要求 `id=20782718`、官方
`links.self`、发布日期、标题中的 `June 2026`（或 `2026-06`）、`license.id=cc-zero`
全部匹配，且从 `files[]` 固定 `wfo_plantlist_2026-06.zip` 的官方 size 与 MD5。它的
SHA 与 ZIP SHA 一起写入输出 manifest，不能用人工转抄的版本字段冒充它。

## 回放命令

以下变量必须替换成当次 `shasum` 的完整 64 位值；输出目录在每次运行前必须不存在
或为空，以防覆盖历史审计。脚本没有下载参数，确保联网获取和离线核验是两步可审计操作。

```sh
node docs/backend-v2/audits/taxonomy-authority-replay.mjs \
  --candidate /tmp/qinghuazhi-taxonomy/plant_catalog.HEAD.csv \
  --candidate-sha256 <candidate-sha256> \
  --output /tmp/qinghuazhi-taxonomy/out-2026-06 \
  --wcvp-artifact /tmp/qinghuazhi-taxonomy/wcvp_dwca.zip \
  --wcvp-artifact-sha256 <wcvp-zip-sha256> \
  --wcvp-taxon /tmp/qinghuazhi-taxonomy/wcvp_taxon.csv \
  --wcvp-taxon-sha256 <wcvp-taxon-sha256> \
  --wcvp-taxon-entry wcvp_taxon.csv \
  --wcvp-eml /tmp/qinghuazhi-taxonomy/wcvp_eml.xml \
  --wcvp-source-url https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip \
  --wcvp-source-version 2026-06-04 \
  --wfo-artifact /tmp/qinghuazhi-taxonomy/wfo_plantlist_2026-06.zip \
  --wfo-artifact-file-name wfo_plantlist_2026-06.zip \
  --wfo-artifact-sha256 <wfo-zip-sha256> \
  --wfo-taxon /tmp/qinghuazhi-taxonomy/wfo_taxon.tsv \
  --wfo-taxon-sha256 <wfo-taxon-sha256> \
  --wfo-taxon-entry taxon.tsv \
  --wfo-name /tmp/qinghuazhi-taxonomy/wfo_name.tsv \
  --wfo-name-sha256 <wfo-name-sha256> \
  --wfo-name-entry name.tsv \
  --wfo-synonym /tmp/qinghuazhi-taxonomy/wfo_synonym.tsv \
  --wfo-synonym-sha256 <wfo-synonym-sha256> \
  --wfo-synonym-entry synonym.tsv \
  --wfo-release /tmp/qinghuazhi-taxonomy/zenodo-record-20782718.json \
  --wfo-release-sha256 <zenodo-api-sha256> \
  --wfo-source-version 2026-06 \
  --wfo-terms-url https://www.worldfloraonline.org/termsOfUse
```

## 算法与输出

工具先逐项完成 SHA、WCVP EML、Zenodo 原始元数据及 entry 名核验，才读取表。WCVP/WFO
表均用 Node `readline` 流式扫描：第一轮只保留候选科学名的精确匹配，后续轮次只补齐
对应 accepted/synonym 与 parent 链；SHA/MD5 也以固定 64 KiB 缓冲分块计算。未命中行
不对象化，因此不会将数百万行全表或数百 MB 制品装入内存。
任何重复精确匹配、异名目标缺失、父链断裂/循环、WFO 不一致、`spp.`、混合名、杂交或
栽培品种证据不足均写入冲突清单。

输出为：

- `taxonomy-authority-manifest.json`：每条候选的原名、规范化查询、WCVP/WFO 稳定 ID、
  accepted 名、rank、父链、全部输入 SHA、entry 名和 `QUARANTINE` 决策。
- `taxonomy-authority-conflicts.json`：逐条机器可处理冲突码。
- `taxonomy-authority-summary.json`：总量、精确匹配、交叉核对及隔离计数。

即使 WCVP 和 WFO 完全一致，记录仍为 `QUARANTINE` 并带
`HUMAN_REVIEW_REQUIRED`。人工复核需按 `plant-taxonomy/v1` 补齐证据、复核分类冲突和
ICRA（如适用），再走独立的人工准入流程；本工具没有也不会增加自动 `ACTIVE` 路径。
