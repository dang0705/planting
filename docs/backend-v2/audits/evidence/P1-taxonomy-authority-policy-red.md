# P1 分类权威来源策略 RED 证据

- Expected 来源：`plant-taxonomy/v1` 明确 POWO/WCVP 为主要分类依据、WFO 用于交叉核对、RHS/ICRA 用于栽培品种；冲突必须隔离并由人工审核，模型不得裁决。
- 测试层次：`unit_real_data`；直接读取机器配置目录与真实 DDL，不使用 mock。
- RED 命令：`npm test -- --run test/p1-configuration-architecture.spec.ts test/p1-taxonomy-ddl.spec.ts`
- RED 结果：2 个测试失败；白名单与 DDL 均遗漏 WCVP，权威优先级仍为 `P1_PENDING`，与已冻结合同矛盾。
- 修复边界：加入 WCVP，并将“优先级”改为按角色分工的不可变策略；不自动准入任何历史植物记录，也不以来源优先级自动解决冲突。

