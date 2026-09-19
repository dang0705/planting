# P1 API 骨架入口

- [具体路由登记表](route-registry.json)：唯一的 P1 路由事实源；每条路由包含 owner、Phase、安全级别、请求/响应合同、幂等方式和错误集合。
- [OpenAPI 3.1 骨架](openapi.p1.json)：由登记表机械生成，不代表字段级 API 已在 P1 全部实现。
- [制品清单](manifest.json)：登记路由表和 OpenAPI 的 SHA-256。
- [生成器](generate-openapi.mjs)：修改路由登记表后运行 `node docs/backend-v2/api/generate-openapi.mjs`。

P1 禁止以 `/**` 代替具体路由。P6 在此骨架上补齐字段级 schemas、示例、发布与回退说明，再形成正式前端接入文档。
