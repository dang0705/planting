# Gate Token Telemetry Template

```text
Gate Token Telemetry:
- gate_name:
- counter_status: exact / estimated / unavailable
- counter_source: runtime_usage / session_jsonl / estimate / unavailable
- pre_gate_tokens:
- post_gate_tokens:
- gate_delta_tokens:
- main_cumulative_tokens:
- delta_basis:
- heaviest_sources:
- budget_status: green / yellow / red / unavailable
- compression_action:
- next_gate:
```

## 无效输出

以下不是 token telemetry，禁止使用：

```text
Gate Token Telemetry
- phase0: completed
- phase1_task_facts: completed
- phase1_5_brv_recall: completed
- agent_assignment: in_progress
```
