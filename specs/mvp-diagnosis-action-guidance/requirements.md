# MVP 确诊结果行动建议规范

## 背景

青花植当前已经可以输出黄叶、发蔫和部分视觉直判结果，但不同路径的建议完整度不一致。特别是八种具体虫害及白粉病、煤污病，会绕开 `outcome_action_profiles`，导致用户拿到名称后只有笼统的“隔离、观察、不要混药”。

本需求把**已启用 MVP 终端结果**统一为同一套可执行、可审计的行动建议合同；不把未启用的根腐诊断伪装成可确诊能力。

## 已盘点的 MVP 范围

### A. 已审核的通用终端结果（17 个）

| 分类 | outcome key | 用户名称 |
| --- | --- | --- |
| 水分/根部 | `overwatering_root_pressure` | 积水/根系压力 |
| 水分/根部 | `underwatering` | 缺水压力 |
| 水分/根部 | `root_stress` | 根部环境压力 |
| 光照/环境 | `low_light_growth_weakness` | 光照不足/生长偏弱 |
| 光照/环境 | `sunburn` | 晒伤/强光刺激 |
| 光照/环境 | `dry_air_stress` | 叶尖焦枯/环境压力 |
| 光照/环境 | `humidity_airflow_stress` | 通风/湿度环境压力 |
| 营养/应激 | `nitrogen_deficiency` | 缺氮/长期营养不足 |
| 营养/应激 | `iron_deficiency` | 缺铁/新叶脉间黄化 |
| 营养/应激 | `nutrient_deficiency` | 营养供给偏弱 |
| 营养/应激 | `fertilizer_repot_stress` | 施肥/换盆应激 |
| 病害/虫害 | `leaf_spot_problem` | 叶斑类问题 |
| 病害/虫害 | `chewing_pest_damage` | 疑似虫害痕迹 |
| 非病害 | `structural_damage_old_injury` | 结构损伤/旧伤 |
| 非病害 | `normal_leaf_aging` | 自然代谢 |
| 非病害 | `stable_natural_marking` | 艺斑/正常斑纹 |
| 不确定 | `uncertain_observation` | 暂不能稳定判断 |

### B. AI 视觉接纳后可直接输出的具体对象（10 个）

| 分类 | mode/outcome key | 用户名称 |
| --- | --- | --- |
| 叶螨 | `spider_mite` | 红蜘蛛（叶螨） |
| 刺吸式害虫 | `mealybug` | 白色棉粉虫（粉蚧） |
| 刺吸式害虫 | `scale_insect` | 小硬壳虫（介壳虫） |
| 刺吸式害虫 | `whitefly` | 白色小飞虫（白粉虱） |
| 刺吸式害虫 | `aphid` | 成群小软虫（蚜虫） |
| 叶片/花部害虫 | `thrips` | 蓟马 |
| 叶片内部害虫 | `leaf_miner` | 叶子里的潜道虫 |
| 土壤害虫 | `fungus_gnat` | 盆土小黑飞（蕈蚊） |
| 叶面病害 | `powdery_mildew` | 白粉病 |
| 次生霉层 | `sooty_mold` | 煤污病（霉菌） |

### C. 发蔫路径的既有行动结果

`wilting_droop` 当前产品合同是“建议行动清单”，不是一组可被称作确定病因的诊断对象。其现有 18 个可见行动结果仍必须获得动作 ID、分类和来源，但不会被改造成 18 个“病名”。

### 明确排除项

`root_rot` 在模式注册表中为 `enabled: false`、`pendingImplementation: true`；本期不把它列为 MVP 可确诊结果，也不显示为“已补齐”的能力。

## 权威资料边界

每一条园艺动作必须关联至少一个来源 ID，来源对象必须包含发布方、URL、页面中的证据位置和本次核对日期。首批来源限定为大学推广机构或权威园艺机构：

- `ucipm-houseplant-problems`：UC IPM《Houseplant Problems》
- `csu-houseplant-pests-2025`：Colorado State University Extension《Managing Houseplant Pests》
- `umn-spider-mites`：University of Minnesota Extension《Twospotted spider mites in home gardens》
- `ucipm-leafminers`：UC IPM《Leafminers》
- `ucipm-sooty-mold-2020`：UC IPM《Sooty Mold》
- `ucipm-powdery-mildew`：UC IPM《Powdery Mildew on Ornamentals》
- `umd-indoor-diagnose-2025`：University of Maryland Extension《Diagnose Indoor Plant Problems》
- `umd-overwatered-indoor-plants`：University of Maryland Extension《Overwatered Indoor Plants》
- `rhs-houseplant-leaf-damage`：Royal Horticultural Society《Leaf damage on houseplants》
- `psu-houseplant-disease`：Penn State Extension《Pest and Disease Problems of Indoor Plants》

“对该植物、该害虫/病害和室内场景有合法标签，并按标签执行”是**内部安全约束**，不是用户侧分类名。用户侧应直接看到“杀虫/杀螨处理”“物理除虫”等可理解分类；不得在本期输出品牌、配方、浓度、剂量或跨地区用药承诺。

## 需求

### R1 — 覆盖完整性

当任一 A、B 类终端结果进入 `visibleOutcomes` 时，系统应输出同等规格的“今天先做、短期复查、持续观察、暂时不要做、补拍或升级”建议；若某阶段不适用，必须由审核过的“无需该阶段”规则显式说明，不能静默缺失。

### R2 — 单条动作可追溯

当系统输出一条建议或规避动作时，该动作应至少带有稳定 `id`、`categoryId`、阶段、用户文案和非空 `sourceRefIds`。动作 ID 不面向用户展示，但必须随诊断响应可供审计和测试读取。

### R3 — 同类处理复用

当不同问题需要同一种园艺处理时，系统应复用同一动作 ID 和分类，而不是以相近的自然语言重复造多个动作。例如“隔离病虫植株”“检查叶背”“暂停重肥”“避免广谱/未标注用药”必须能跨结果复用和统计。

### R4 — 用户可执行且不夸大

当用户收到高置信视觉直判时，系统应给出按顺序可执行的物理除虫、必要时的杀虫/杀螨处理、复查时点和明确升级条件；不得把“可能方向”写成确定病因，也不得让用户因为单张图在缺少证据时大幅浇水、施肥、换盆或混用药剂。

### R5 — 发蔫路径对齐

当 `wilting_droop` 输出行动清单时，其中每个行动/规避条目同样应带 `id`、`categoryId` 和来源，但其 UI 仍保持“建议行动清单”，不改为病因排名。

### R6 — 审计与回归

当新增或修改任何行动画像时，自动校验应拒绝以下状态：缺动作 ID、未知分类、缺来源、来源 ID 未在画像中声明、视觉直判对象没有处理建议、或未启用模式被纳入 MVP 覆盖统计。

## 动作分类（收敛版）

分类只表达用户要完成的**处理目的**；喷施、灌根、冲洗、擦除、粘虫板等实施方式另以 `methodId` 保存，不能再拿“喷药”这种方式名替代处理目的。

| categoryId | 用户侧中文含义 | 合并规则 |
| --- | --- | --- |
| `isolation_sanitation` | 隔离、清理与消毒 | 合并虫害隔离、病叶清理和工具卫生 |
| `inspection_monitoring` | 检查与复查 | 合并找虫、看叶背、定时观察和粘虫板监测；粘虫板不能单独宣称已除虫 |
| `pest_physical_control` | 物理除虫 | 保留清水冲洗、擦除、摘除、捕捉等非药剂控制 |
| `pest_kill_treatment` | 杀虫/杀螨处理 | **不得与其他类别合并**；只用于已经确认适用的虫害处理 |
| `disease_kill_treatment` | 杀菌处理 | **不得与杀虫/杀螨处理合并**；只用于确认适用的病害处理 |
| `water_adjustment` | 控水与补水 | 合并控湿排水与补水；每条动作另声明 `direction=reduce_water` 或 `rehydrate`，防止互相冲突 |
| `environment_adjustment` | 光照、通风与温湿度调整 | 合并补光、避晒、避直吹、通风和湿度稳定 |
| `nutrition_adjustment` | 施肥与营养调整 | 合并暂停重肥、冲盐、核对生长期和温和补肥 |
| `non_intervention` | 保持稳定、暂不处理 | 保留自然代谢、稳定艺斑、旧伤等不应过度干预的语义 |
| `retake_escalation` | 补拍、检查根系与升级 | 保留补拍、脱盆查根、人工或专业升级 |
| `treatment_safety` | 用药注意事项 | 仅承载避免混用、未确认用药、错误喷施时机等规避动作 |

`pest_kill_treatment` 和 `disease_kill_treatment` 是必须明确声明的一级类别：前者面向虫害中的杀虫/杀螨，后者面向白粉病等病害中的杀菌处理。煤污病不应机械进入“杀菌处理”，必须优先处理产生蜜露的刺吸式害虫，再清洗霉层。

## 验收标准

1. 覆盖统计为 27 个 MVP 终端结果；根腐诊断单列为未启用，不计入通过数。
2. 27 个结果和发蔫行动清单均可在测试中解析到结构化建议与规避动作。
3. 每个结构化动作具有唯一 ID、已登记分类、用户文案和至少一个来源引用。
4. 红蜘蛛、粉蚧、介壳虫、白粉虱、蚜虫、蓟马、潜道虫、蕈蚊、白粉病、煤污病不再回退到同一句泛化建议。
5. 现有黄叶/发蔫的用户可见中文文案与页面布局不退化；ID 和来源不作为面向用户的噪声展示。
6. 真实 API 和真实小程序运行时的验收分别标注，不能用单元测试或 HTTP 200 冒充端上验收。
