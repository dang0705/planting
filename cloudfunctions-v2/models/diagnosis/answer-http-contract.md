# 问诊答案 HTTP 合同

本合同具体化已登记的 `answerDiagnosisQuestion`，不改变题包范围：V2 只复用 V1 黄叶、萎蔫及虫害题目，不复用旧业务记录。

`POST /api/v2/diagnosis/sessions/{diagnosisSessionRef}/answers` 使用 Bearer 身份和必填 `Idempotency-Key`。会话引用沿用登记的 8～100 字符约束。长期植物请求正文为：

```json
{"userPlantRef":"upl_example123","requestMode":"answer_submit","answers":[{"questionKey":"soil_status","optionKey":"unknown"}]}
```

允许的复合证据字段仅为 `airEnvironmentByQuestionId`、`airEnvironmentSnapshotsByQuestionId`、`careBehaviorTimeline`、`care_behavior_timeline`。证据内容必须继续通过已冻结的空气和时间线合同及服务端题包校验。拒绝其他根字段和答案项额外字段；客户端不能提交题包、用户身份、发布引用或诊断结论。请求中的植物引用只用于核对，不能授予归属。

`DiagnosisSessionResponse` 在答案提交操作中的成功分支为：

```json
{"data":{"diagnosisSessionRef":"diagnosis-example","answersRecorded":true}}
```

这只确认整包答案已记录，不能表示诊断完成、已有结论或生成养护事实。首次及重放响应完全一致，不公开内部状态、主键、摘要、模型版本或原始证据。其他会话操作的响应分支不由本合同冒充实现。

归属会话不存在返回 404 `NOT_FOUND`；答案或证据非法返回 400 `VALIDATION_FAILED`；不同答案覆盖既有提交或同键异参返回 409 `IDEMPOTENCY_CONFLICT`；缺失或损坏服务端快照、发布未准入、有效游客尚未接入对应路径时返回 503 `SERVICE_UNAVAILABLE`。身份无效返回 401 `PRINCIPAL_INVALID`。不能因游客路径未实现而把有效游客说成非法身份。

请求链使用既有共享 JSON 上限 1048576 字节和幂等保留期 168 小时。没有新增领域阈值；正文大小先于认证，归属在答案事务内重新核验。服务端发布准入必须先于首次业务提交；读取固定题包文件不等于发布。当前处理器仅为可注入的协议适配，不加入构建入口或部署。

错误只使用固定中文公开消息。用例输出不符合成功/错误白名单时返回脱敏内部错误，不能将任意依赖返回值直接公开。
