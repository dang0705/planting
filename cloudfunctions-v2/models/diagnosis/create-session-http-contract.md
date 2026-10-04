# 固定题包会话创建 HTTP 合同

具体化已登记 `POST /api/v2/diagnosis/sessions`、`createDiagnosisSession`、`CreateDiagnosisSessionRequest` 与 `DiagnosisSessionResponse` 的固定题包分支。

首版长期植物正文只允许 `userPlantRef` 和 `mode`，后者为 `yellow_leaf` 或 `wilting_droop`。虫害通过独立视觉与动态选题入口承接，不作为固定包默认值。用户身份来自 Bearer，不允许客户端提供新会话引用、题包、发布版本、状态或评分。必填 `Idempotency-Key`，沿用共享 HTTP 的 1048576 字节上限和168小时保留期。

成功 `data` 只包含 `diagnosisSessionRef`、`mode`、`questionPackage`。题包包含 `questionCount` 和 `questions`；每题只公开 `questionKey`、`text`、`inputKind`、`options`，可选 `helpText`、`whyThisQuestion`。选项只公开 `optionKey`、`text`、可选 `description`。`inputKind` 为 `choice`、`care_behavior_timeline` 或 `air_environment`，供未来前端展示对应输入；它不意味着证据已经填写或保存。

原V1题目完整内容继续保留在内部不可变快照，公开白名单不能泄漏 `routeKey`、`conditionKey`、`outcomeKey`、评分、内部发布引用、摘要或数据库主键。题数由具体发布快照决定，不能猜固定上限或默认答案。公开题目缺少合法显示文字时拒绝首次响应并回滚，不能发布半套题目。

一次共享事务完成占位、活动题包锁定、归属创建、原事务读回和公开响应保存。相同键同内容重放原会话与原题目，不再读当前active、不再生成引用；异参冲突返回409。提交结果未知时新连接只读核对，不自动再建会话。未发布、过期或损坏题包返回503；对象归属不存在返回404；请求非法400、身份非法401。合法游客在对应路径未接入前明确503，不能冒充身份非法。

请求摘要覆盖认证用户、植物引用和mode，时钟不是请求内容。同键重放不得因后来换版、退役或植物状态变化而返回不同的首次响应。新的产品动作必须使用新键。创建没有写养护事实、计划、奖励或诊断结论。

本合同首先用于可注入协议适配和隔离真实数据库验证；未通过题包正式审核、激活和真实身份闭环前，不加入生产构建或部署。
