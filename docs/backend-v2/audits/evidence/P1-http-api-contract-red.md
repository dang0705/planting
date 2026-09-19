# P1 HTTP API 合同 RED 证据

- 时间：2026-09-20（Asia/Shanghai）
- 测试层次：`unit_real_data` 与本地真实 HTTP 端口测试。
- Expected 来源：Canonical Master Plan 的公开错误结构、固定请求顺序，以及已冻结 P1 合同。

## RED 1：合同注册表缺项

先在 `p1-contract-foundation.mjs` 中要求 `http-api/v1`，随后执行测试。测试以退出码 1 失败，失败原因为缺少 `http-api.md`。这证明测试不是从新增合同制品反推。

## RED 2：公开错误结构漂移

先把真实 HTTP 测试的 Expected 改为 `{ error: { type, message } }`，再构建并启动当前服务。8 条测试中 3 条失败：当前实现仍返回额外 `ok:false` 和 `error.code`，且非法 DTO 使用 `INVALID_REQUEST`，与合同的 `VALIDATION_FAILED` 不一致。

## RED 3：公开 AI 动作边界缺失

先增加 `publicAiAction` 合同测试，再执行 TypeScript 类型检查。类型检查失败，指出校验器集合不存在 `publicAiAction`，证明当前实现尚未区分“客户端产品动作”和“内部额度预占命令”。

## RED 4：严格错误 Schema 缺失

先增加错误响应的严格字段测试，再执行 TypeScript 类型检查。类型检查以退出码 2 失败，指出校验器集合不存在 `errorResponse`。该 Expected 明确要求拒绝额外的 `ok`、内部 `code` 和追踪字段。

这些失败均发生在对应实现和合同制品落盘前；后续不得修改 Expected 吞掉失败。
