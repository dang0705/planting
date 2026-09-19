# P1 配置架构 RED 证据

- 时间：2026-09-20（Asia/Shanghai）
- 测试层次：`unit_real_data`
- Expected 来源：用户明确要求在具体后端实现前，让关键业务变量可配置，并统一第三方 Provider 配置。

先落盘 `p1-configuration-architecture.mjs`，要求两张架构图、Canonical Master Plan、架构实施文档、硬规则、`AGENTS.md` 与 SHA-256 清单共同形成配置治理闭环；此时配置架构合同尚不存在，测试必须先失败。随后才允许更新架构。

## 目录可追溯性 RED（2026-09-20）

- 测试文件：`cloudfunctions-v2/test/p1-configuration-architecture.spec.ts`
- 测试层次：`unit_real_data`
- Expected 来源：P1 Phase 对逐项 Expected、来源、ClickUp ticket、阻断范围的要求，以及 `AGENTS.md` 8.1 的配置治理硬规则。
- 先失败命令：`./node_modules/.bin/vitest run test/p1-configuration-architecture.spec.ts --config vitest.config.mjs`（在 `cloudfunctions-v2`）
- RED 结果：`identity.guest.session_ttl_hours 缺少 Expected/测试元数据`。
- 随后实现：目录新增 `validationMetadata`，生成阅读版新增“Expected 与测试边界”；机器校验同时拒绝不可解析的来源锚点、不安全的仓库外路径、空 Expected、无阻断范围的 pending 项及不精确的 ClickUp 绑定。
- 明确未覆盖：本证据不证明策略运行时、DDL、CloudBase 读回、凭证有效性或真实 Provider 调用。

## 分类权威策略分层读回（2026-09-20）

- 测试层次：`unit_real_data`。
- Expected 来源：主代理已裁决的分类权威分层，以及目录变量 `plant-knowledge.taxonomy.authority_priority` 的已冻结值。
- 已核验：POWO/WCVP 并列主要来源，WFO 仅交叉核对，RHS_ICRA 仅栽培品种；冲突值为 `QUARANTINE_AND_HUMAN_REVIEW`。
- 阻断边界：64 项 `P1_PENDING` 仅阻断各自 `blockingScope`；P4/P5/S4 的后续数值、环境或发布验收不倒灌为 P1 配置架构总阻断。
- 未覆盖：本地目录读回不证明任何权威源网络调用、分类发布或生产环境可用性。
