# Main Agent Quality Gates

## 定位

本文件是 main agent 质量门禁的读取路由，不作为默认长规则文件读取。

pre-implementation 阶段只读：

```text
main-pre-implementation-gates.md
```

post-implementation code review 阶段只读：

```text
main-post-implementation-review-gate.md
review-scope-policy.md
```

## 读取原则

1. 不得在 Phase 4 同时读取 pre 与 post 全量规则。
2. 不得提前读取 Main Agent Code Review Gate 细则。
3. 不得因为拆分读取而跳过 Technical Direction Gate、Implementation Contract Completeness Gate 或 Main Agent Code Review Gate。
4. 所有 gate 默认输出 receipt，详细证据写入 evidence_ref / appendix_ref。
