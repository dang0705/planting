# Agent Assignment Gate

## 定位

本文件是 Agent Assignment 的读取路由，不作为默认长规则文件读取。

默认先读：

```text
agent-assignment-core.md
```

按需追加读取：

```text
implementer-routing-policy.md
qa-docs-routing-policy.md
subagent-spawn-gate.md
```

## 读取原则

1. 判断是否需要代码改动、code_explorer 或 implementer 时，读取 `implementer-routing-policy.md`。
2. 判断 QA / docs_keeper 是否必选时，读取 `qa-docs-routing-policy.md`。
3. required named subagent 需要复用或 spawn 时，读取 `subagent-spawn-gate.md`。
4. 不得因为拆分读取而跳过 Reuse Gate、Spawn Contract Gate 或 Contract-Locked Engineer Gate。
5. main agent 仍不得亲自写代码，不得用 default / fallback 线程替代 named subagent。

## Token 读取边界

默认只读取 `agent-assignment-core.md`。不得把按需文件全部当成默认必读；只有触发对应判断时才读取 `implementer-routing-policy.md`、`qa-docs-routing-policy.md` 或 `subagent-spawn-gate.md`。
