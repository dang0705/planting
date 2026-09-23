# 青花植后端 v2 实施资料导航

本文件是本次重构的唯一发现入口（Implementation Entry）。它负责告诉 agent 从哪里开始读、下一层读什么以及哪些内容暂不读取；它不是计划正文，也不允许复制计划正文。

根目录的 Master Plan 是唯一计划正文（Canonical Master Plan）。本目录的所有子文件只能把正文拆成可按需读取的实施资料，不能新增、删改或重新解释业务语义。

## 唯一基线

- 文件：[青花植后端v2底层架构重构计划_融合闭环终版.md](/Users/jay/WebstormProjects/planting/青花植后端v2底层架构重构计划_融合闭环终版.md)
- 基线标题：`青花植后端 v2 底层架构重构计划（完整融合闭环终版）`
- 基线 SHA-256：`0b94c71ea83e02134237c9c41b357e0a30e7d60250d6bc21eedca73d2d4c0732`
- 基线行数：2321
- 入口角色：agent 必须先读本文件；禁止绕过本文件直接进入 `.codex/plans/**`、旧副本或本目录子目录。
- 正文角色：只有根目录 Master Plan 可以作为完整计划正文；`BASELINE.lock` 是其机器可核对的锁，不是第二份计划。

## 入口核对

开始任何实施任务前，运行：

```bash
node docs/backend-v2/verify-entrypoint.mjs
```

该命令只读核对 Master Plan 的标题、行数、SHA-256、导航入口和进度数据；失败时必须停止并报告 `BLOCKED_PLAN_BASELINE`，不得自行修复或选择其他版本。

## 渐进式读取顺序

```text
Master Plan
→ architecture/ 架构模块
  → configuration-variable-catalog.md 按领域定位关键变量
  → configuration-variable-catalog.json 仅在字段核验时读取机器事实
→ contracts/ 业务与接口合同
→ api/ 具体路由与 OpenAPI 骨架
→ data/ 数据、状态与处置
→ implementation/ 实施细节
→ testing/ 测试与验收
→ phases/ 当前阶段
→ clickup/ 任务绑定
→ tracker/ 可视化追踪
```

Master Plan 保留完整目标、架构、边界、Phase、风险和完成标准；本目录只承载实施时需要按模块读取的细节。

## 渐进式披露纪律

1. 先读本文件和 `BASELINE.lock`。
2. 按 ticket 的 Phase 与模块，只打开一个直接子入口（例如 `phases/P1-contracts-identity-foundation.md`）。
3. 子入口只列出下一层文件名；只有验收标准明确需要时，才继续读取其中一个具体文件，并记录扩展原因。
4. 不得为了“了解全局”递归读取全部目录；未读取范围必须写在任务开始和交接记录中。
5. 入口、Master Plan、架构、合同、Expected 或 ticket 状态冲突时，停止实现，交由主代理裁决。
6. 涉及业务数值、阈值、期限、上限、预算、版本、Provider、超时或重试时，先在中文变量目录定位单项，再按该项 `sourceRefs` 深读；禁止一次性深读全部变量引用。

## 当前实施状态

- P-1 资产审计、P0 决策/证伪和既有 P1 合同/Schema 已通过对应出口门；当前已进入 P2 核心领域与共享基础设施实现。新版架构新增“已登录用户临时植物”P1 增量合同门，未冻结前不得开展该路径的 P3 实现或验收；不使其他已通过 P1 合同自动失效。
- 植物分类人工裁决已形成 106 条本地未激活种子候选；4 条待转换记录仍需重建和复核，active release 保持 `STOP`。该局部门禁不阻断 `identity`、`subscription`、`user-plant` 与 `foundation`。
- P2 Foundation 已开始首个 TDD 切片；进度和未覆盖范围以 `implementation/foundation-request-chain.md` 与对应 ticket 心跳为准，不以模块存在冒充整项完成。
- 数据库/CMS/Storage/网关写入：未开始。
- ClickUp：28 个任务均已创建；专职状态维护子代理每 30 分钟核对并同步实际状态。远端任务是否进入执行、审核或完成，以逐项读回的真实状态为准。
- 前端：不在本阶段范围。
