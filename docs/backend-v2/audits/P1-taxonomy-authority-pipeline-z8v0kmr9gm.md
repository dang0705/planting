# P1 分类权威来源离线回放审计

> ClickUp：`z8v0kmr9gm`  
> 审计时间：2026-09-20（Asia/Shanghai）  
> 结论：`ADMIT=0`，`ACTIVE=0`，200 条全量 `QUARANTINE`。  
> 边界：本审计只读 `/tmp` 制品并生成 `/tmp` 输出；未调用 CloudBase、CMS、MySQL 或任何发布接口。

## 结论与硬门

最终回放使用 `git show HEAD:docs/plant_catalog.csv` 导出的无表头 200 条快照，SHA-256 为
`de5ad55fa4589ac56481ce684b030d46213fc2bf6d3838d5217248c813f3fac1`。最终 manifest
的机器摘要如下：

| 指标 | 值 |
|---|---:|
| 输入记录 | 200 |
| WCVP 精确匹配 | 179 |
| WFO 科/属/种完整链交叉核对 | 158 |
| `QUARANTINE` | 200 |
| `ACTIVE` | 0 |
| 冲突项 | 287 |

WFO 三表能找到候选相关节点 572 个；其 species→genus→family 链可达 family 后停止，
不把制品未提供的虚拟 order/phylum 根误判为科属种失败。交叉核对同时比较 accepted 名、
rank、genus 与 family；其余歧义、缺失、状态异常与 ICRA 证据缺口仍逐条隔离，每条另有
`HUMAN_REVIEW_REQUIRED`。

任何自动匹配均无 `ACTIVE` 分支。人工审核仍须补足完整父链/冲突裁决，栽培品种还须依
[ISHS ICRA directory](https://www.ishs.org/sci/icralist/icralist.htm) 路由到相应官方 register。

## 原始制品、版本与绑定链

| 来源 | 官方 URL / 版本 | 原始 ZIP SHA-256 | 解出 entry / SHA-256 |
|---|---|---|---|
| WCVP | [Kew WCVP repository](https://sftp.kew.org/pub/data-repositories/WCVP/wcvp_dwca.zip)，EML `2026-06-04`，CC BY 3.0 | `6ff1e084d7e1de5bce526a9952c96fbb0f13b4f2c615b0fc30c055f88bfb5483` | `wcvp_taxon.csv`: `71d5662935deeb25aaff03e512fc2437d79984ed738e85f03da83afdd168d704`; `eml.xml`: `aa6dc4c18d3cd127f477a041777357435b86fea6da7c342f301902cb994a6c85` |
| WFO | [Zenodo record 20782718](https://zenodo.org/records/20782718)，`2026-06`，原始 API 元数据 `id=20782718`、`license.id=cc-zero` | `75f1ad1f371978c9e46f3044152c07ed276fe57be9fb9a15b3621b19cf231987` | `taxon.tsv`: `0d23bddb2ab8d7e6505e741acb54b6603ca9523751be555a734ee4019fa61c23`; `name.tsv`: `c506eb9e21efe9e268e20f8cd9bc65f91b55e1722d19c27d58a6681f8b680ed8`; `synonym.tsv`: `dba9a8562d173971ae57705dbdb68aa866e76295294742834b6f55f7182595ca` |
| WFO 元数据 | [Zenodo API record](https://zenodo.org/api/records/20782718) | `74474a9e17d7fc1d8ea0fdd8ab346d13451e8fd2ed96b17514fa506d45d250bc` | `files[]` 固定 `wfo_plantlist_2026-06.zip`，size `132643291`，MD5 `02f989b01b8eb142ec5934bd634b3876` |

解出步骤为 `unzip -p <zip> <entry> > <outside-repo-path>`；工具输入同时要求 ZIP SHA、
entry 名、解出文件 SHA。WFO 原始 Zenodo API 记录、`files[]` 文件名/size/MD5 和
[WFO Terms of Use](https://www.worldfloraonline.org/termsOfUse) 的 CC0 分类条款均失败关闭。
没有大包、解出 TSV 或实际 manifest 提交仓库。

## 可回放工具与性能证据

实现位于 `docs/backend-v2/audits/taxonomy-authority-replay.mjs`，使用说明见
[taxonomy-authority-replay.md](../implementation/taxonomy-authority-replay.md)。WCVP 以严格
18 列 `|` 分隔扫描；WFO 保留可处理多行引号的 TSV 记录解析，并按
`nameID → name`、`taxon.ID/parentID`、`synonym.nameID → taxonID` 三表关系构建证据。

最终 Node 22 实跑耗时约 25 秒，最大常驻内存 `245334016` bytes（约 234 MiB）。
输入大表不对象化：WCVP 实际扫描 `4,346,952` 行、仅保留 371 节点；WFO 扫描
`7,536,678` 行、仅保留 572 节点。SHA/MD5 以固定 64 KiB 缓冲分块计算。

初版逐字符 WCVP 通用 CSV 解析在同一完整制品上超过 19 分钟；官方全量列数探针显示
1,448,985 行均为 18 列。故改为保持严格列数的 WCVP 专用分列扫描后重跑，得到上述
24.99 秒结果；分类语义和隔离规则未改变。

## TDD 与验证证据

先运行的 RED 证据：

```text
npm test -- --run test/p1-taxonomy-authority-replay.spec.ts
Error: missing docs/backend-v2/audits/taxonomy-authority-replay.mjs
```

实现后：`cloudfunctions-v2/test/p1-taxonomy-authority-replay.spec.ts` 共 8 个
`unit_real_data` Vitest 用例通过，覆盖精确匹配、accepted/synonym、父链、cultivar 隔离、
Git 200 条快照、候选/ZIP/解出文件 SHA、Zenodo `cc-zero`、`files[]` MD5/size、WCVP 18
列及输出防覆盖。`npm run typecheck` 通过；`npm run lint` 为 0 新增告警（仓库既有 54
warnings 未触碰）。

本工具只提供可复核候选和冲突证据，不能替代人工 `ADMIT` 裁决或 active release 构建。
