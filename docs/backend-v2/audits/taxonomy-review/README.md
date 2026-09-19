# P1 植物分类代理审核建议批次说明

> 任务：ClickUp `z8v0kmr9gm`（植物分类与身份准入硬门）  
> 输入事实源：`/private/tmp/qinghuazhi-taxonomy-z8v0kmr9gm/out-genus-final/taxonomy-authority-manifest.json`  
> 遗留中文名与旧字段来源：`docs/backend-v2/audits/P1-taxonomy-admission-manifest.json`

## 范围与并行边界

四个审核批次只按权威回放清单的数组下标分片，不按数字形式的 `sourceRecordId` 分片：

- `batch-001-050.json`：下标 0～49；
- `batch-051-100.json`：下标 50～99；
- `batch-101-150.json`：下标 100～149；
- `batch-151-200.json`：下标 150～199。

每个代理只能编辑自己负责的批次文件，不得修改权威回放工具、合同、DDL、总清单、其他批次或 active release。主代理负责校验 200 条无遗漏、无重复后再合并。代理输出只是受控审核建议，不得冒充人类审核批准；建议为准入或转换的记录，在明确的人类批准落盘前仍保持 `QUARANTINE`。

## 单条裁决结构

每条必须保留以下字段：

```json
{
  "manifestIndex": 0,
  "sourceRecordId": "1",
  "sourceLineSha256": "...",
  "rawScientificName": "Epipremnum aureum",
  "legacyDisplayNameZh": "绿萝",
  "reviewDecision": "ADMIT_AS_ACCEPTED | TRANSFORM_TO_ACCEPTED | QUARANTINE",
  "acceptedScientificName": "Epipremnum aureum | null",
  "authoritySource": "WCVP | null",
  "authorityTaxonId": "70476 | null",
  "rank": "species | genus | variety | form | hybrid | cultivar | species_group | null",
  "genus": "Epipremnum | null",
  "family": "Araceae | null",
  "decisionReasons": ["..."],
  "evidenceChecks": {
    "wcvpExactUnambiguous": true,
    "wfoCrossCheckMatch": true,
    "legacyGenusMatches": true,
    "legacyFamilyMatches": true,
    "specialRankOrCultivar": false,
    "unresolvedConflict": false
  },
  "reviewerAgent": "代理名称",
  "reviewedAt": "带时区的 ISO 8601 时间"
}
```

## 统一裁决规则

`evidenceChecks` 的布尔值必须按以下精确定义填写：

- `wcvpExactUnambiguous`：WCVP 恰有一个精确名称记录；即使该记录状态不受支持或接受名目标缺失，此项仍为 `true`，状态问题由 `unresolvedConflict` 表达；无记录或多义时为 `false`。
- `wfoCrossCheckMatch`：WFO 对接受名、等级、属、科全部交叉核对为 `MATCH`。
- `legacyGenusMatches` / `legacyFamilyMatches`：遗留值分别与 WCVP 裁决记录中的属、科逐字一致；缺值为 `false`。
- `specialRankOrCultivar`：栽培品种、混合群组、`spp.`、杂交或学名中含 `subsp.`、`ssp.`、`var.`、`f.` 等种下等级标记。
- `unresolvedConflict`：存在机器冲突原因或遗留重复组未裁决。

1. 只有下列条件全部为真时才可 `ADMIT_AS_ACCEPTED`：
   - WCVP 只有一个精确候选且状态为 `Accepted`；
   - WFO 交叉核对为 `MATCH`；
   - WCVP 与 WFO 的接受名、分类等级、属、科一致；
   - 遗留属、科与权威结果一致；
   - 不是栽培品种、混合群组、`spp.`、杂交或其他特殊等级；
   - 不存在重复名未裁决、来源冲突、缺失父链或其他机器冲突原因。
2. 只有 WCVP 明确把原名判为异名并提供唯一接受名、WFO 对接受名的科属种链一致、且没有其他冲突时，才可 `TRANSFORM_TO_ACCEPTED`。原名后续只能作为异名保存，不能丢失。
3. 栽培品种必须有相应 ICRA/RHS 登记证据；本批次没有该证据时一律 `QUARANTINE`。
4. 混合群组、`spp.`、无法映射成单一权威 taxon 的商品组一律 `QUARANTINE`。
5. 任一来源缺失、精确匹配多义、accepted target 缺失、WCVP 状态不受支持、WCVP/WFO 科属种或等级冲突，均一律 `QUARANTINE`。
6. 遗留清单标记为重复科学名的记录不得仅凭名称自动合并；在本批次一律 `QUARANTINE`，留待产品身份层的 merge/split 裁决。
7. 代理不得联网补造证据，不得把常识、搜索摘要、百度结果或大模型回答当作权威分类证据。
8. 每条必须逐项写出机器证据检查结果；不得批量写一句笼统结论。所有解释使用中文，权威来源中的拉丁学名和固定枚举除外。

## 批次验收

- 每个批次恰好 50 条；
- `manifestIndex` 连续且属于本批次；
- `sourceRecordId`、行级 SHA、原始学名必须与最终回放清单一致；
- 任何提出准入/转换的记录必须满足对应全部布尔检查；
- 所有隔离项必须至少有一个具体原因；
- 不得出现 `ACTIVE`，批次输出只是 release 前的代理审核建议；人类批准、主代理合并、验证、导入和读回全部完成后，才允许生成最终 active release。
