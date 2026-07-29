# High-Risk Workflow

仅用于 API/schema、迁移、安全、跨系统状态机、不可逆数据操作或兼容性风险。普通 UI/局部功能不得读取。

## Strict Decision Lock

main 在 Handoff Contract 中补充：

```text
decision_lock:
- level: strict
- architecture_invariants:
- data_or_api_contract:
- compatibility_requirements:
- dependency_policy:
- migration_or_rollback:
- authorized_schema_changes:
- stop_conditions:
- local_decisions_allowed:
```

规则：

1. 锁定的是接口、不变量、兼容和回滚，不是逐行伪代码。
2. 只有存在真实备选时才记录 rejected option；禁止为了格式虚构方案。
3. 未授权依赖、schema、API 或数据迁移一律阻断。
4. implementer_deep 可在不变量内自行决定局部函数和模块拆分。
5. main review 必须逐项核对 strict fields 与 diff/evidence。
