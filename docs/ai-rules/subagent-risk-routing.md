# Subagent 风险路由规则

使用 `implementer_fast` 的条件：

1. 范围局部。

2. 风险低。

3. 文件少。

4. 已有明确实现边界。

5. 不涉及诊断核心逻辑、数据结构、部署或 replay。

使用 `implementer_deep` 的条件：

1. 多文件实现。

2. 诊断流。

3. outcome 路径规划。

4. 问题簇。

5. gate 守卫。

6. replay 逻辑。

7. 云函数。

8. 数据结构迁移。

9. API 协议变更。

10. 多文件状态管理改造。

11. CloudBase / 数据库 / 后端高风险改动。

## 升级规则

当 `implementer_fast` 发现以下任一情况时，必须停止实现并请求 main agent 改派 `implementer_deep`：

1. 修改范围超过原 Dispatch Plan。

2. 涉及多文件核心逻辑。

3. 涉及诊断 runtime、outcome、gate、replay。

4. 涉及 CloudBase 云函数或部署。

5. 涉及数据结构或 API 协议。

6. 需要判断 `docs/new-rules/` 的核心规则解释。

7. 需要重构模块边界而非轻量搬迁。
