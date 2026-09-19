# 计划入口与代理触发盲探针报告

## 目的

在不向子代理提供仓库路径、计划文件名或入口文件名的前提下，验证三件事：

1. 能否自行发现本次重构的唯一实施入口和唯一计划正文；
2. 能否按渐进式披露只读取当前任务所需的最小入口，不递归深读；
3. 能否根据阶段门和职责表准确识别可触发的代理，并拒绝触发尚未具备 ticket/负责人/验收的代理。

## 探针 A：计划发现

- 模型：Luna Max。
- 输入约束：未提供路径、文件名或目录提示，只要求发现本次重构计划入口。
- 结果：通过。
- 发现链：`docs/backend-v2/README.md` → 根目录 Master Plan → `BASELINE.lock`。
- 核对结果：标题、2111 行和 SHA-256 `e8ee3511ee544ee4a5edcd12bf8cad0b3c02c397fb85eb459193ea854f29f428` 一致。
- 未深读：Master Plan 正文、Phase 正文、合同、实现、测试和云端内容。

## 探针 B：渐进式披露

- 模型：Terra Medium。
- 输入约束：未提供路径，只要求为身份合同任务找到最小必要资料并保留未读取范围。
- 结果：通过。
- 实际读取：入口 README 和一个 P1 直接子入口，共 42 行；下一依赖只列名未打开。
- 保留上下文：P1 是公共合同/身份准确性阶段门；公共合同由主代理维护；代码、数据库、CMS、Storage 和网关尚未开始写入。
- 明确未读：Master Plan 全文、其他合同、数据、实施、测试、ClickUp 和 tracker 正文。

## 探针 C：代理触发与阶段门

- 模型：Luna Max。
- 输入约束：未提供代理名称，只要求根据当前阶段和治理资料识别可触发代理。
- 结果：通过，但发现并已修正一个治理缺口。
- 正确结论：当前只能准备 P-1 的五个只读代理：
  - `audit_legacy_code_luna`
  - `audit_data_cms_luna`
  - `audit_external_sources_luna`
  - `audit_storage_memory_luna`
  - `taxonomy_inventory_luna`
- 拒绝事项：P-1 未退出前不得触发 P2/P3/P4 的实现代理；ClickUp 尚未连接，不得伪造 ticket ID；没有 ticket、输入哈希、允许路径和时间盒不得 dispatch。
- 原始缺口：职责表原先未完整列出 P-1 五个审计代理，以及 P5/P6 的只读代理；现已补齐 `agents/agent-ownership.md`，并把 P-1 拆为五个逻辑 ticket 规格。

## 结论

- 入口发现：通过。
- 渐进式浅读：通过。
- 代理触发：阶段门和模型档位判断通过；ClickUp ticket 的真实创建仍为 `PENDING_CLICKUP_ACCESS`，因此尚未进行外部 dispatch。
- 机器门禁：`node docs/backend-v2/verify-entrypoint.mjs` 已通过。

这份报告只记录可复核的探针结论，不替代 Master Plan、合同或 ClickUp ticket。
