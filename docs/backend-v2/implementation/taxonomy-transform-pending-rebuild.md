# P1 四条待转换植物身份重建

## 目标与当前门禁

产品负责人已批准 `99 REUSE_AS_IS + 7 TRANSFORM + 4 TRANSFORM_PENDING + 90 QUARANTINE`。本任务只处理来源记录 29、73、98、123；在每条记录完成重建、机器校验和人工复核前：

- 当前未激活种子保持 `seedEligible=106`；
- 四条记录保持 `TRANSFORM_PENDING`，不得进入 seed；
- active release 保持 `STOP`；
- 不修改已经批准的 106 条记录，也不解除 90 条隔离记录。

## 四条重建目标

| 来源记录 | 中文业务身份 | 目标规范学名 | 分类等级 | 产品身份类型 | 当前关键缺口 |
|---:|---|---|---|---|---|
| 29 | 水仙 | `Narcissus tazetta subsp. chinensis` | 亚种 `subspecies` | 分类单元 `taxon` | 目标权威稳定标识、完整父链、中文规范名裁决 |
| 73 | 银皇后 | `Aglaonema commutatum 'Silver Queen'` | 栽培品种 `cultivar` | 栽培品种 `cultivar` | 可版本化 RHS/ICRA 登记制品、父种证据、中文规范名裁决 |
| 98 | 狐尾天门冬 | `Asparagus densiflorus 'Myersii'` | 栽培品种 `cultivar` | 栽培品种 `cultivar` | 可版本化 RHS/ICRA 登记制品、父种证据、中文规范名裁决 |
| 123 | 绯牡丹 | `Gymnocalycium stenopleurum` | 种 `species` | 分类单元 `taxon` | 目标权威稳定标识、具体 WFO/Kew 记录、历史名关系和中文规范名裁决 |

## 每条记录必须完成的原子步骤

1. 获取目标分类单元真实的 `(authority_source, authority_taxon_id)`。该组合才是权威身份键；禁止复用旧 WCVP ID、中文名、URL、访问时间或历史 SHA-1。
2. 保存权威来源原始响应制品，并记录 `raw_artifact_ref`、原始字节 SHA-256、来源版本、抓取时间和具体记录 URL。访问时间不能代替来源版本。
3. 建立完整父链并逐边保存证据：科 → 属 → 种 → 亚种或栽培品种。任一级缺失都维持隔离。
4. 写入分类实体、权威证据、审核裁决、产品身份、身份与分类单元关系，以及学名/别名证据；同名字符串不能替代这些关系。
5. 生成新的不透明公开引用。公开引用不能由旧记录 ID 或可猜测序号构造；权威身份仍以新的 authority key 为准。
6. 执行机器校验：唯一键、等级、父链、accepted/synonym 状态、证据哈希、隔离读、seed 准入和 active release 负向检查。
7. 人工复核中文规范展示名、跨来源冲突、历史名或商品名关系。只有复核通过的单条记录才可从 `TRANSFORM_PENDING` 改为 `TRANSFORM`。

## 分记录规则

### 29 水仙

- 父链：Amaryllidaceae → Narcissus → `Narcissus tazetta` → `Narcissus tazetta subsp. chinensis`。
- 父种 `Narcissus tazetta` 不是目标亚种的 synonym，只能作为父级关系和遗留来源值保留。
- iPlant/中国植物志用于中文名与中国分类语义核对；目标权威稳定标识仍须来自当前 POWO/WCVP，并以 WFO 交叉核验。
- `水仙` 与 `中国水仙` 的规范展示名必须人工裁决。

### 73 银皇后

- 父链：Araceae → Aglaonema → `Aglaonema commutatum` → `'Silver Queen'`。
- 栽培品种必须具有种级父项，并保存 `cultivar_parent` 关系。
- RHS profile 704 只能作为候选来源入口；当前 `NO_VERSION_PUBLISHED` 不能用访问时间代替版本。
- 未获得可版本化的 RHS/适用 ICRA 登记原始制品前，不得转为可发布身份。
- `银皇后` 经人工确认后可作为产品规范中文展示名，同时保存为有证据的市场/俗名别名；中文名不能反向成为分类事实。

### 98 狐尾天门冬

- 父链：Asparagaceae → Asparagus → `Asparagus densiflorus` → `'Myersii'`。
- 栽培品种必须具有种级父项，并保存 `cultivar_parent` 关系。
- RHS profile 28198 只能作为候选来源入口；未获得可版本化 RHS/适用 ICRA 登记制品前不得转为可发布身份。
- `狐尾天门冬` 的规范展示名与别名关系必须人工裁决。

### 123 绯牡丹

- 父链：Cactaceae → Gymnocalycium → `Gymnocalycium stenopleurum`。
- 当前批准制品中的 WFO 首页不足以证明具体身份；必须取得目标记录的稳定标识、具体 URL、来源版本和原始制品。
- 只有权威来源明确证明关系时，`Gymnocalycium mihanovichii` 才能作为 synonym 写入；否则只能保留为受控遗留别名或继续隔离。
- `绯牡丹` 是否可作为目标物种的规范中文展示名必须人工复核，不能由园艺习惯自动外推。

## 现有字段映射与禁止事项

- 本轮不新增数据库字段。`canonical_identity_name_cn` 的业务语义映射到 `plant_identities.display_name_zh`，仅表示产品规范中文展示名，不是分类唯一键。
- `identity_level` 映射到 `plant_taxa.taxon_rank`；栽培品种同时要求 `plant_identities.identity_kind=cultivar`。
- `public_taxon_ref` 与 `public_identity_ref` 是对外不透明引用，不等于权威分类稳定标识。
- 商品名、俗名、历史名进入别名或名称证据；不得污染规范分类名。
- 禁止根据中文名、旧记录 ID、旧 WCVP ID、页面 URL或模型输出自动合并、替换或解除隔离。

## 验收与失败处理

- 每条记录拥有完整、可回放的权威制品和 SHA-256，authority key、等级、父链、名称关系与中文展示名均可解释。
- 两条栽培品种必须通过 RHS/ICRA 版本证据和种级父项校验；版本缺失即失败关闭。
- 任一来源冲突、稳定标识缺失、父链断裂、证据哈希不一致或人工未确认时，该条继续 `QUARANTINE/TRANSFORM_PENDING`，不影响其他已批准记录。
- 四条全部通过后，生成新的不可变审批批次和 seed manifest；只有重新校验得到 `seedEligible=110` 后，才允许进入后续真实 MySQL 导入与 active release 独立验收。
- 本任务不授权 CloudBase、CMS、MySQL、云函数、网关或线上发布写入。

