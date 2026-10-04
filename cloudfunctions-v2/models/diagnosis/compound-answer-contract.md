# 复用题包的空气环境复合答案

归属 E05 `z8v0kmr974`。首版题目仍只复用 V1 黄叶、萎蔫和虫害。本合同不增加题目、数据库列或配置变量。

空气环境字段沿用 V1 `airEnvironmentByQuestionId` 和 `airEnvironmentSnapshotsByQuestionId`。题目及选项以服务端锁定快照为准；选择 `air_environment_recorded` 时，两份数据必须均存在、均有效且规范化后相同。选择 `air_environment_unknown` 时不能附带表单。任何非本次空气题的附加字段都拒绝。

简易表单使用数值 `schemaVersion: 3`、`mode: quick`、`quickAnswer.questionKey: air_exchange_frequency` 和 `frequent / regular / rare` 选项。详细表单使用 `mode: advanced` 和 `advancedInput`；兼容 V1 原始详细表单。详细输入只描述换气、冠层周围空间和设备风；保留 V1 枚举及关窗、新风和逐设备风向的规范化规则，不计算环境系数或诊断病因。

采集快照含 `input`、`source` 及可选原有时间和位置元数据。`saved_profile / temporary / temporary_save_succeeded / temporary_save_failed` 只是客户端申报来源，不能证明档案归属、持久化成功、测量真实性或许可。上层须另行核对服务端档案引用；本校验结果显式标记来源为未核验申报。客户端位置和时间元数据不授权访问、不进入本增量输出。

输出为按题目索引的只读规范化输入和申报来源；不携带其他客户端字段。缺失、非法及互相矛盾的数据失败关闭。校验不写养护事实，不生成治疗建议，不计算耗水倍率。浇水时间线的复合证据由后续实现单独验收，空气校验通过不代表完整答案提交已通过。

来源：当前 V1 `cloudfunctions/layer/utils/air-environment-evidence.js` 的表单字段及复合答案要求；用户明确批准复用 V1 三类题包；整体计划的服务端题包授权、证据分层和脱敏边界。V1 规范化代码作为兼容性证据，不作为 V2 环境算法发布。
