# 后端 v2 构建基线

该目录是青花植后端 v2 的影子重建根目录。当前只包含 P0 构建探针，用于证明严格 TypeScript、Node.js 22、CommonJS、原生 HTTP 9000 端口、DTO 校验、脱敏日志和最小部署包可以闭环。

`foundation` 不是第七个业务云函数，也不提供业务能力。后续实现仍严格限定为 `identity`、`plant-knowledge`、`user-plant`、`care`、`diagnosis`、`subscription` 六个业务域。

## 本地验证

```bash
npm ci --ignore-scripts
npm run verify
npm audit --omit=dev
```

`npm run build` 会生成：

- `dist/server.cjs`：Node.js 22 CommonJS 入口；
- `deployment/`：仅包含构建产物、启动脚本、包描述、锁文件和生产依赖；
- `package-manifest.json`：可审计的部署文件清单和入口摘要。

本目录尚未部署到 CloudBase，也不包含数据库、CMS、云存储或外部服务访问。
