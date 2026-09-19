# P1 普通 JSON 请求体上限 RED 证据

- 日期：2026-09-20
- 独立 Expected：`docs/backend-v2/architecture/configuration-variable-catalog.json` 中已确认的 `http.json_body_limit_bytes = 1048576`；`docs/backend-v2/contracts/http-api.md` 固定请求大小与媒体类型限制必须先于 JSON 与 DTO 校验。
- 被测真实路径：`cloudfunctions-v2/src/server.ts` 构建为 `dist/server.cjs`，由 `cloudfunctions-v2/test/foundation-http.spec.ts` 启动真实 9000 端口并通过 HTTP 请求验证。
- RED 命令：`npm run build && npx vitest run --config vitest.config.mjs test/foundation-http.spec.ts`

## 失败结果

新增用例“恰好 1 MiB 的 JSON 越过大小限制并进入 DTO 校验”构造精确 1,048,576 UTF-8 字节的合法 JSON。此请求应越过大小门，并因 `message` 超出 DTO 最大长度返回 `400 VALIDATION_FAILED`；修复前实际返回 `413 PAYLOAD_TOO_LARGE`。

Vitest 报错摘录：

```text
AssertionError: expected 413 to be 400
- Expected
+ Received
- 400
+ 413
```

根因是 `cloudfunctions-v2/src/server.ts` 将请求体上限写为 `4 * 1024`，与已确认的 1,048,576 字节不一致。该文件在此 RED 证据之后才允许进行最小修复。

## 合同来源可追溯性 RED

- RED 命令：`npm test -- --run test/p1-api-skeleton.spec.ts`
- 新增 Expected：HTTP 公共合同必须直接写明普通 JSON 请求正文上限为 `1,048,576` 字节，并绑定配置项 `http.json_body_limit_bytes`；配置目录不能只引用一个没有精确值的文档。
- 失败结果：`AssertionError: HTTP 公共合同必须明确冻结普通 JSON 请求正文上限及其配置项来源`。
- 根因：修复前 `http-api.md` 只写“请求正文超过该路由上限”，没有记录普通 JSON 路由的冻结值和配置项名称，无法独立复核配置目录来源。
