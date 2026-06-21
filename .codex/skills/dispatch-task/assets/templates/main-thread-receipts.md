# Main Thread Receipt Templates

```text
Main Receipt:
- phase:
- status: pass / fail / blocked
- blocking:
- evidence_ref:
- next_action:
```

```text
Completion Receipt:
- required_total:
- passed:
- failed:
- blocked:
- not_verified:
- writeback_status:
- stop_allowed:
- blocker_refs:
```

## main-thread-budget-policy-01

Source: `references/main-thread-budget-policy.md`  
Context: Receipt-only 默认模式

```text
status
blocking
evidence_ref
next_action
```

## main-thread-budget-policy-02

Source: `references/main-thread-budget-policy.md`  
Context: Completion 对账

```text
Completion Receipt:
- required_total:
- passed:
- failed:
- blocked:
- not_verified:
- writeback_status:
- stop_allowed:
- blocker_refs:
```
