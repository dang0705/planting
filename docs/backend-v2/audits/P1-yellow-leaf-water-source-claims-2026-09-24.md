# P1 黄叶水分方向：来源主张候选

- 绑定任务：[诊断知识来源、园艺原因及 Outcome/Action 合同](https://app.clickup.com/t/z8v0kmrg8a)。
- 范围：室内盆栽黄叶入口下的“根区持续过湿”“根区持续偏干”“现有证据不足”三个**候选方向**；不覆盖全部黄叶病因，也不等于通过人工审核。
- 核验日期：2026-09-24。下列内容是对机构原始资料的中文概括，不复制资料正文。页面可访问不代表其文字、图片、表格或具体处置已获 CMS 转载许可。
- 状态：来源可定位；植物适用范围、图片/文字许可、逐条审核人、具体 Outcome/Action 代码、DTO、DDL 与不可变发布包均未冻结。不得作为 active CMS 内容或诊断运行时真相源。

## 来源主档候选

| 临时来源代号 | 机构、标题和版本 | 可定位位置 | 待补的审核信息 |
|---|---|---|---|
| `ISU-CARE-2024-01` | Iowa State University Extension，Aaron Steil，[室内植物不当养护问题诊断](https://yardandgarden.extension.iastate.edu/how-to/diagnosing-houseplant-problems-related-poor-culture)，页面标注最后审核 2024-01 | `Overwatering`、`Over-Fertilization` 小节 | 逐植物适用性、公开链接/转载边界、人工审核人 |
| `ISU-ENV-2024-01` | Iowa State University Extension，Aaron Steil，[室内植物环境条件问题诊断](https://yardandgarden.extension.iastate.edu/how-to/diagnosing-houseplant-problems-improper-environmental-conditions)，页面标注最后审核 2024-01 | `Wilting`、`Leaf Drop, Yellowing, or Browning` 小节 | 逐植物适用性、公开链接/转载边界、人工审核人 |
| `ISU-YELLOW-2024-03-19` | Iowa State University Extension，Aaron Steil，[室内植物黄叶、褐变及落叶问答](https://yardandgarden.extension.iastate.edu/faq/what-causes-leaves-my-houseplant-turn-yellow-or-brown-and-drop)，页面标注更新 2024-03-19 | `Answer` 小节 | 逐植物适用性、公开链接/转载边界、人工审核人 |
| `UCIPM-HOUSE-2020-08` | University of California IPM，[室内植物问题指南](https://ipm.ucanr.edu/home-and-landscape/houseplant-problems/)，页面标注更新 2020-08 | `Pest Notes: Introduction`、`What Causes Houseplant Problems?` 和室内植物诊断表 | 表格具体行的适用范围、公开链接/转载边界、人工审核人 |

这些临时代号只用于本审核材料定位，不是正式来源主张 ID，也不得直接暴露给用户。

## 原子主张与可推断范围

| 候选主张 | 对应来源位置 | 可支持的有界判断 | 不能据此推出 |
|---|---|---|---|
| 持续潮湿、排水不良可能损害根系，黄叶、落叶和萎蔫可同时出现 | `ISU-CARE-2024-01 / Overwatering`；`ISU-ENV-2024-01 / Wilting` | 若黄叶与**根区持续潮湿**、排水异常或重复浇水事实同时存在，可把过湿压力列为候选并检查其他原因 | 单张黄叶图不能判定“用户浇太多”；仅表土潮湿不能确诊根腐病或命令换盆 |
| 根团长期干燥、浇水未到达整个根团或基质难以吸水，均可能造成供水不足与萎蔫 | `ISU-ENV-2024-01 / Wilting`；`UCIPM-HOUSE-2020-08 / 室内植物诊断表` | 若黄叶/萎蔫伴随可信的**根区干燥时间及浇水历史**，可把偏干压力列为候选 | 表土看起来干或单张照片不能证明根团缺水；不能给全部植物套固定浇水间隔 |
| 黄叶、褐变和落叶由多种因素造成，也可能有多个因素共同作用 | `ISU-YELLOW-2024-03-19 / Answer`；`ISU-ENV-2024-01 / Leaf Drop, Yellowing, or Browning`；`UCIPM-HOUSE-2020-08 / What Causes Houseplant Problems?` | 缺少植物身份、根区水分、近期养护或其他排除证据时，维持“待判定”，列出会改变判断的下一项观察 | 不能把黄叶等同于缺水、过湿、肥害、病原或虫害中任何一个；不能用模型自评百分比补证据 |
| 施肥、光照、温度、湿度及生物性问题也是黄叶/落叶的可能方向 | `ISU-CARE-2024-01 / Over-Fertilization`；`ISU-ENV-2024-01 / Leaf Drop, Yellowing, or Browning`；`UCIPM-HOUSE-2020-08 / Pest Notes: Introduction` | 水分证据不充分或互相冲突时，保留其他原因作为鉴别候选并补采证据 | 不得仅凭排除水分方向，就自动判定其他具体病因 |

## 首个安全行动候选及禁区

可优先审核的最小 Action 是“在决定是否浇水前，检查与目标植物相符的根区/基质水分，并记录近期浇水、盆器排水和异常持续时间”。`ISU-CARE-2024-01 / Overwatering` 支持先检查实际水分而非只按日程浇水；`ISU-ENV-2024-01 / Wilting` 支持区分根团过干和持续过湿。**它仍是待审行动候选**：具体检查深度、器具、何时浇水及何时停止，须按植物和栽培方式审核，不使用全植物通用固定值。

本批来源**不支持**直接发布剪叶、药剂/粉剂处理、固定停肥两周、固定温湿度、强制浇水或强制停水等动作。竞品截图出现这些步骤，不构成来源证据。病原性病害、害虫或根腐的确诊与处理必须进入各自的证据及安全审核；若根区证据冲突，优先补问/检查，不通过更长的生成式解释掩盖未知。

## 下一道门

1. 在题包中核实“根区潮湿/干燥”“最近浇水”“排水异常”等输入如何取得、何时失效；盆土表面图像不得直接当根区测量。
2. 为上述主张补齐逐植物适用范围、来源定位、许可/公开链接边界、审核人和审核结论；将支持、反驳与禁忌分别挂到 Outcome、Action 和映射。
3. 先写独立 Expected：相同黄叶症状在过湿、偏干与证据不足输入下分别归约；同时覆盖过湿/偏干冲突、缺失植物身份、禁忌动作及知识撤回。
4. 通过 P1 DTO/DDL 与空库读回门后，才可生成兼容 release；本文件本身不构成发布批准。
