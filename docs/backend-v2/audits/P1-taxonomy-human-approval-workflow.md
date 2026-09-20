# P1 植物分类人工批准与种子清单工作流审计

## 当前结论

产品负责人已明确采纳 [99/7/4/90 人工裁决](P1-taxonomy-human-decision-2026-09-20.md)，并生成完整的 [逐条批准制品](P1-taxonomy-human-approval-2026-09-20.json) 与 [未激活 seed](taxonomy-approval-2026-09-20/seed-manifest.json)。当前 `seedEligible=106`，4 条 `TRANSFORM_PENDING` 尚未完成身份重建，active release 仍为 `STOP`；未写 CloudBase、CMS 或 MySQL，也未形成线上可读分类发布。

## 发现与闭环

原有链路包含：

- `taxonomy-review-validator.mjs`：校验四个代理审核批次的完整性和准入前置条件；
- `taxonomy-validation-manifest.mjs`：在内存中合并建议，并支持传入 `humanApprovals`；
- `plant-identity-validation-manifest-v1.json`：保存不可变审核包分片及当前全量隔离状态。

原有链路缺少一个独立的人工批准制品合同，不能强制绑定批准批次、人工主体、批准时间、完整批准范围和审核包原始字节 SHA，也没有把批准记录和新种子清单以失败关闭方式一次性落盘。

新增 [人工批准与种子清单工作流说明](../implementation/taxonomy-human-approval-workflow.md) 与
`taxonomy-human-approval-workflow.mjs`，补齐以下硬门：

1. 只接受 `p1-taxonomy-human-approval/v2`，并要求 `human:` 受控人工主体；`agent:` 和 `reviewerAgent` 一律拒绝。
2. 逐个回读 200 条审核分片，验证分片 SHA、下标、来源引用、原始行 SHA 和代理建议集合。
3. 批准范围必须逐条覆盖 200 条记录，精确为 99/7/4/90；90 条隔离记录必须显式写出保持 `QUARANTINE`，4 条待转换记录必须绑定 canonical、身份层级、权威来源和稳定 ID 重建要求。
4. 审核包 SHA 不匹配、批准制品缺失、范围缺项/多项/错配、输出目录已存在或写入异常时不创建或覆盖任何结果。
5. 成功结果只能落入一个此前不存在的新目录，并固定为 `SEED_PARTIALLY_READY_NOT_ACTIVE` 与 `activeRelease=STOP`；不触碰线上或人工裁决前的审计快照。

## 测试证据

测试文件：`cloudfunctions-v2/test/p1-taxonomy-human-approval-workflow.spec.ts`。

- RED：在工作流脚本尚不存在时运行，5 项测试全部因模块缺失失败。
- GREEN：当前 7 项测试全部通过，覆盖真实审核包 113/7/80 原始建议、99/7/4/90 人工改判、4 条待转换目标、代理主体拒绝、审核包 SHA 错误、批准制品缺失、已有输出不覆盖、原子落盘和现有审核包不变。
- `npm run typecheck`：通过。
- 针对新增测试的 `oxlint`：0 warning、0 error。
- 针对新增测试的 `oxfmt --check`：通过。

正式批准制品与本地 seed 已生成且 SHA-256 读回一致；没有执行导入、发布和线上读回。

## 未覆盖边界

4 条待转换记录的重建和复核、ClickUp 最终状态回读、真实 MySQL/CMS 导入、发布事务、active release 切换和端上读取，仍需各自的后续验收；本工作流只提供本地制品级前置硬门，不能替代这些验收。
