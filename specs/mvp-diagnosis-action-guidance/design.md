# MVP 诊断建议与规避动作技术设计

## 1. 设计目标

在不新增动作表、不复制黄叶题包运行时的前提下，让当前 MVP 的 27 个终端诊断对象都输出同一份可审计动作合同：

```text
诊断对象 -> actionProfileKey -> 结构化动作 -> 用户可见建议/规避
                                  ├─ 动作 ID
                                  ├─ 动作分类 ID/中文名
                                  ├─ 实施方式
                                  ├─ 执行阶段
                                  └─ 权威来源 ID
```

其中“杀虫/杀螨处理”和“杀菌处理”是两个不可合并的分类；“用药注意事项”单独表示规避动作。

## 2. 复用现有实体

不新增数据库实体，继续使用已有的：

- `diagnosis_outcomes`：保存 27 个终端对象与 `action_profile_key` 的关系。
- `outcome_action_profiles`：保存共享动作画像。
- 现有黄叶/发蔫的 `actionProfileKey` 分组逻辑：相同动作画像可以合并展示，不同画像即使文字相同也不合并。

对 `outcome_action_profiles` 增加一个 JSON 字段 `action_items_json`。原有五个阶段字段继续保留，作为现有历史数据的兼容来源；新维护的数据以 `action_items_json` 为权威来源，运行时从结构化动作重新生成旧字段所需的文本数组。

## 3. 结构化动作合同

`action_items_json` 是数组，每一项必须符合以下形状：

```json
{
  "id": "act_spider_mite_kill_01",
  "categoryId": "pest_kill_treatment",
  "categoryNameCn": "杀虫/杀螨处理",
  "stage": "today",
  "methodId": "foliar_spray",
  "text": "确认是红蜘蛛后，选择标签明确适用于室内观叶植物并登记可防治螨类的产品，按产品标签处理叶片正反面；先在少量叶片上试用并观察。",
  "sourceRefIds": ["umn-spider-mites", "ucipm-houseplant-problems"]
}
```

字段约束：

- `id`：动作唯一 ID，稳定且不可用文案代替。
- `categoryId`：从收敛后的动作分类中选择。
- `categoryNameCn`：直接给用户看的中文分类，必须是白话语义。
- `stage`：`today`、`three_day`、`seven_day` 或 `avoid`。
- `methodId`：具体实施方式，如 `foliar_spray`、`soil_drench`、`rinse`、`wipe`、`sticky_trap`、`inspection`。
- `text`：用户可直接执行的步骤；药剂内容不写品牌、浓度、剂量或跨地区注册承诺。
- `sourceRefIds`：至少一个已登记的权威来源 ID。

允许增加 `conditionCn` 表达“确认某条件后再执行”，但不能把有条件的杀虫/杀菌建议写成无条件建议。

## 4. 动作分类

运行时使用统一分类字典：

| categoryId | 用户可见中文 | 适用边界 |
| --- | --- | --- |
| `isolation_sanitation` | 隔离、清理与消毒 | 隔离病株、清除残体、清洁工具 |
| `inspection_monitoring` | 检查与复查 | 查叶背、嫩梢、盆土、复查变化、粘虫板监测 |
| `pest_physical_control` | 物理除虫 | 冲洗、擦除、摘除、诱捕；不能宣称单独消灭全部害虫 |
| `pest_kill_treatment` | 杀虫/杀螨处理 | 确认虫害后；红蜘蛛必须明确落入此类 |
| `disease_kill_treatment` | 杀菌处理 | 确认真菌性病害后；不能与杀虫/杀螨合并 |
| `water_adjustment` | 控水与补水 | 通过 `methodId` 和 `conditionCn` 区分停浇、排水、补水 |
| `environment_adjustment` | 光照、通风与温湿度调整 | 调整光照、空气流动和环境稳定性 |
| `nutrition_adjustment` | 施肥与营养调整 | 停肥、冲盐、核对生长期、温和补充营养 |
| `non_intervention` | 保持稳定、暂不处理 | 自然代谢、正常斑纹或证据不足 |
| `retake_escalation` | 补拍、检查根系与升级 | 需要补证据、检查根系或转人工 |
| `treatment_safety` | 用药注意事项 | 只表达规避和安全边界，不代替处理动作 |

`categoryId` 表示动作意图，`methodId` 表示怎么做。两者不能混用，例如“叶面喷施”是实施方式，不是动作分类；“杀虫/杀螨处理”才是分类。

## 5. 画像复用与直判接入

### 5.1 共享画像

将动作相近的诊断对象绑定到共享画像，例如：

- 螨类：红蜘蛛单独使用螨害画像，保留“杀虫/杀螨处理”语义。
- 常见刺吸式害虫：粉蚧、介壳虫、白粉虱、蚜虫可共享基础画像，但每个对象仍保留自己的诊断对象和来源证据。
- 蓟马、潜叶虫、蕈蚊分别保留差异化画像，避免把不同生活部位和处理方式混成一类。
- 白粉病使用“杀菌处理”画像。
- 煤污病不自动输出杀菌处理；先检查并处理产生蜜露的害虫，再清洗霉层，必要时根据确认到的害虫进入杀虫画像。

### 5.2 直判接入

`buildPestRouteResponse` 在直判结果生成前，按候选 `modeKey` 读取对应 `diagnosis_outcomes` 和动作画像，再把画像传给：

- `specific-pest-answer-resolver`：八种具体虫害。
- `non-pest-direct-result`：白粉病和煤污病。

这样直判和黄叶/发蔫题包共享同一套动作结构；没有完整画像时不能悄悄回退成“先隔离观察”并宣称建议完整，应在审计中标记缺口。

## 6. 后端映射

后端新增一个纯函数式动作规范化模块，负责：

1. 解析 `action_items_json`。
2. 校验必填字段、分类 ID、阶段、动作 ID 唯一性和来源 ID。
3. 将结构化动作按阶段生成旧的 `todayActions`、`threeDayActions`、`sevenDayObserve`、`avoidActions` 数组。
4. 保留 `actionItems`、`avoidActionItems` 供前端显示分类，同时继续输出已有文本字段，降低对历史结果和记录页的影响。

所有候选对象合并动作时，按 `actionProfileKey + action.id` 去重；动作冲突仍沿用当前冲突保护，冲突时只输出“暂缓同时处理”和补充确认，不把互相冲突的杀虫、杀菌或控水动作同时推给用户。

## 7. 前端展示

前端继续沿用现有建议组和规避组布局，但组标题优先使用动作的 `categoryNameCn`，用户看到的示例为：

```text
杀虫/杀螨处理：
1. ……

用药注意事项：
1. ……
```

动作 ID、来源 ID只保留在诊断响应和审核数据中，不直接堆到普通用户界面；分类中文必须展示，不能只显示内部英文 ID。旧的纯文本结果仍可被前端正常读取。

## 8. 数据与权威来源

动作资料以规格文档列出的权威来源为准，来源 ID在代码审计目录中登记 URL、机构、主题和核对日期。首批至少覆盖：UC IPM、University of Minnesota Extension、Colorado State University Extension、University of Maryland Extension、Penn State Extension、RHS。

代码和数据校验必须保证：每条结构化动作都有来源 ID；每个可确诊对象都有动作画像；药剂动作只在对应虫害或病害画像中出现；煤污病画像不把杀菌作为默认动作。

## 9. 验证策略

### 单元逻辑

- 动作结构解析、字段校验、阶段映射、分类中文映射和 ID 去重。
- 八种虫害、白粉病、煤污病的直判结果均包含结构化建议和规避动作。
- 红蜘蛛结果必须包含 `pest_kill_treatment` / “杀虫/杀螨处理”。
- 白粉病结果必须包含 `disease_kill_treatment` / “杀菌处理”。
- 煤污病结果默认不得出现 `disease_kill_treatment`。

### 真实 API 链路

使用真实 `cloud1_dev` 数据和真实诊断 HTTP 配置，验证 27 个对象的画像完整性、来源完整性和前后端响应字段。

### 端上验收

只有部署或完整跑通当前规定的 LAN 本地函数链路后，才在真实微信运行时检查红蜘蛛、白粉病、煤污病及一个黄叶结果页的分类标题、动作文本和规避动作。单元测试或 HTTP 200 不作为端上通过依据。

## 10. 实施顺序

1. 新增动作分类/来源/结构校验纯模块和单元测试。
2. 扩展现有动作画像读取与响应压缩，不破坏旧字符串数组。
3. 补齐 27 个终端对象与共享动作画像的数据记录。
4. 接通虫害和非虫害直判路径。
5. 接通前端分类展示与自动化 ID（如新增交互元素才更新映射表）。
6. 按三层测试策略验证，并执行 CloudBase 代码审查。
