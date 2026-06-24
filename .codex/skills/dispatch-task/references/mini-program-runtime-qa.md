# Mini Program Runtime QA

仅当 acceptance 明确要求小程序端上行为时读取。

QA Contract 必须提供：

```text
- projectPath
- automator_port
- page
- selectors_or_test_ids
- operations
- endpoint_and_payload（如适用）
- assertions
- evidence_required
```

规则：

1. projectPath、端口和 selector 来自项目规则/Contract，不硬编码在 agent 配置。
2. 先验证 automator 会话与页面上下文，再执行真实交互；仅端口可连不算通过。
3. 优先稳定 test id；不得把坐标或中文文案作为首选 selector。
4. 工具/登录/IDE blocker 与产品 failure 分开记录，保留原始错误。
5. implementer 只做最小 smoke；正式矩阵由 QA 执行，禁止重复完整自动化。
6. unit tests 不属于 QA。
