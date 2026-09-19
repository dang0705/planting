# P1 业务配置与 Provider 架构退出闸门

- ClickUp：`z8v0kmr9gn`
- 结论：`ARCHITECTURE_AND_LOCAL_FOUNDATION_GO / ACTIVE_RELEASE_SCOPED_STOP`
- 范围：证明配置化裁决、关键变量目录、Provider 档案、类型化策略/AJV 合同、不可变发布与活动指针 DDL、请求级快照和本地静态门禁成立；不证明 CloudBase 读回、任何待冻结能力已激活或真实 Provider 可用。

## 已通过

- `AGENTS.md`、README、Canonical Master Plan 与 P1 Phase 均把“先判断是否值得配置化”设为开发前置硬规则；最终可配置范围由主代理写入唯一目录，领域子代理无权自行加开关或默认值。
- 机器目录共 162 项业务/治理变量，覆盖身份、权益、用户植物、植物知识/CMS、养护、问诊、存储、HTTP、可靠事件、性能容量与配置治理；每项具备状态、owner、来源、消费方、变更/失败边界、Phase、真实 ClickUp 绑定、Expected 与配置化裁决组。
- 已区分 74 项已冻结值、49 项待冻结值和 39 项不可配置硬规则；P1 直接实现依赖项的待冻结数量为 0。其余待冻结项已按首次消费点改挂 P3/P4/P5，仍登记原因与 `blockingScope`，不得被源码默认值绕过。
- 分类权威策略已冻结：POWO 与 WCVP 并列主要来源，WFO 只作交叉核对，RHS_ICRA 仅用于栽培品种；任一冲突必须 `QUARANTINE + 人工审核`，模型不得裁决冲突。
- 12 个首批 Provider 分别建档：百度识别、分类权威源、百炼问诊、百炼百科、和风天气、微信支付、平台通知、CloudBase Auth、Storage、CMS、Agent 与 MySQL。
- Provider 档案逐项覆盖 endpoint profile、`credential_ref`、连接/读取/总超时、重试与退避、限流、熔断、成本/预算、回退链、输出合同、审计保留、release 版本、SHA-256、生效/失效时间和阻断范围。
- 已冻结 CMS Worker 单并发、单任务最多 3 次、真实模型预算 0；产品模型家族与 Provider 精确 `model_code` 分层，百炼模型固定到 `qwen3.5-flash-2026-02-23`，禁止使用滚动别名静默换模；AI 动作按小青文本、文本诊断、单图和多图分别登记。
- 已冻结 `user-plant-profile/v1` 最低有效档案、十项精确能力白名单、`plant-encyclopedia-display/v1`、`diagnosis-model-output/v1` 及 `diagnosis-visual/v1` Prompt SHA-256；未知能力、越界百科字段、未知模型输出字段与 Prompt 哈希不匹配均失败关闭。
- P1 配置冻结范围裁决见 `P1-configuration-freeze-scope.md`：改挂后续 Phase 不解除阻断，只防止把必须依赖真实流量、供应商、支付沙箱或法务分类的参数伪装为 P1 已验证。
- `configuration-variable-catalog.md` 从 JSON 生成；架构 manifest 对 README、Master Plan、配置合同、变量目录及映射文件计算 SHA-256。
- 目录机器门禁验证每个 `sourceRefs` 为仓库内可解析路径，片段引用可在目标制品定位；变量 Expected 不为空，目录级 `unit_real_data` 元数据明确已覆盖与未覆盖范围；ClickUp ID 与链接精确绑定同一任务。
- `cloudfunctions-v2/src/configuration/**` 已建立 AI 预算与 Provider 发布的严格 TypeScript/AJV 合同、跨字段语义校验和不可变请求快照；额外密钥字段会被拒绝。
- `007_configuration.sql` 已建立业务策略发布、Provider 发布、活动指针、审计与请求快照表；`capability_snapshots` 通过复合外键绑定能力策略发布的引用、版本和内容 SHA-256。

## 当前停止项

- 49 项后续阶段 `P1_PENDING` 仍须在各自 `blockingScope` 前取得真实证据；本闸门不授权 Agent 猜值。它们只局部阻断 P3/P4/P5 的相应能力，不构成 P1 配置架构整体停止理由。
- 49 项待冻结值不得产生可激活 release；已完成的类型、Schema 和 DDL 只提供失败关闭的承载结构，不构成能力启用授权。
- CloudBase 与真实供应商未读回；需要认证时只能使用用户 Chrome `default/main` 主 profile。
- 目录校验仅覆盖静态架构制品，不把 JSON/Markdown 通过误报为 Provider 凭证、网络、成本或 CloudBase 真实验收。
- P4/P5/S4 的后续实现数值、环境验收或发布条件不得倒灌成 P1 总阻断；只有其对应能力进入 `blockingScope` 时才重新核验。

## 可回放校验

```bash
node docs/backend-v2/verify-entrypoint.mjs
node docs/backend-v2/architecture/generate-configuration-variable-catalog.mjs
node docs/backend-v2/architecture/generate-manifest.mjs
npm --prefix cloudfunctions-v2 run typecheck
npm --prefix cloudfunctions-v2 test -- --run test/p1-configuration-architecture.spec.ts test/p1-configuration-runtime.spec.ts test/p1-total-ddl.spec.ts
```

上述本地校验通过时，允许后续业务域引用已冻结的不可变发布合同；真实能力仍按各变量和 Provider 的 `blockingScope` 保持停止，直到相应真实证据齐备并发布可激活 release。
