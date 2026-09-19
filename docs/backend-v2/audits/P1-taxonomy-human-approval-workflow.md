# P1 植物分类人工批准与种子清单工作流审计

## 当前结论

本次只补齐本地“人工批准制品 → 待导入种子清单”的可审计工作流，**没有执行任何人工批准**，也没有改变现有 `seedEligible=0`、active release STOP、ClickUp、tracker、配置目录、CloudBase、CMS 或现有 admission manifest。

当前真实状态仍以 [P1 分类法真实人工批准审核包](P1-taxonomy-human-approval-packet.md) 为准：113 条 `REUSE_AS_IS`、7 条 `TRANSFORM`、80 条 `QUARANTINE` 都等待产品负责人明确核阅；代理建议不具备批准效力。

## 发现与闭环

原有链路包含：

- `taxonomy-review-validator.mjs`：校验四个代理审核批次的完整性和准入前置条件；
- `taxonomy-validation-manifest.mjs`：在内存中合并建议，并支持传入 `humanApprovals`；
- `plant-identity-validation-manifest-v1.json`：保存不可变审核包分片及当前全量隔离状态。

原有链路缺少一个独立的人工批准制品合同，不能强制绑定批准批次、人工主体、批准时间、完整批准范围和审核包原始字节 SHA，也没有把批准记录和新种子清单以失败关闭方式一次性落盘。

新增 [人工批准与种子清单工作流说明](../implementation/taxonomy-human-approval-workflow.md) 与
`taxonomy-human-approval-workflow.mjs`，补齐以下硬门：

1. 只接受 `p1-taxonomy-human-approval/v1`，并要求 `human:` 受控人工主体；`agent:` 和 `reviewerAgent` 一律拒绝。
2. 逐个回读 200 条审核分片，验证分片 SHA、下标、来源引用、原始行 SHA 和代理建议集合。
3. 批准范围必须逐条覆盖 200 条记录，精确为 113/7/80；80 条隔离记录必须显式写出保持 `QUARANTINE`。
4. 审核包 SHA 不匹配、批准制品缺失、范围缺项/多项/错配、输出目录已存在或写入异常时不创建或覆盖任何结果。
5. 成功结果只能落入一个此前不存在的新目录，并固定为 `SEED_READY_NOT_ACTIVE` 与 `activeRelease=STOP`；不触碰线上或现有审计制品。

## 测试证据

测试文件：`cloudfunctions-v2/test/p1-taxonomy-human-approval-workflow.spec.ts`。

- RED：在工作流脚本尚不存在时运行，5 项测试全部因模块缺失失败。
- GREEN：实现后 6 项测试全部通过，覆盖真实审核包 113/7/80 精确集合、人工批准范围绑定、代理主体拒绝、审核包 SHA 错误、批准制品缺失、已有输出不覆盖、原子落盘和现有审核包不变。
- `npm run typecheck`：通过。
- 针对新增测试的 `oxlint`：0 warning、0 error。
- 针对新增测试的 `oxfmt --check`：通过。

正式批准制品尚不存在，因此没有生成 `approval-record.json` 或 `seed-manifest.json`，也没有执行导入、发布和线上读回。

## 未覆盖边界

产品负责人是否真的核阅权威分类证据、ClickUp 中的人工批准内容、真实 MySQL/CMS 导入、发布事务、active release 切换和端上读取，仍需各自的后续验收；本工作流只提供本地制品级前置硬门，不能替代这些验收。

