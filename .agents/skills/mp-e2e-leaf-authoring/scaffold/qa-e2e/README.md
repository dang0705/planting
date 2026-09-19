# Babolat compiled-asset E2E

`run.mjs` 把本仓 Taro 产物、suite 和 adapter 显式交给 `miniprogram-e2e`。

约定：

- 产物目录是 `src-taro/dist`，不是 `dist/dev/mp-weixin`
- sidecar `mp-e2e.contract.json` 由 weapp 构建插件和 adapter `prepare` 写入 `dist/`
- DevTools 复用日常进程的 automator `9420`，session `stop` 只断开连接，不退出开发者工具
- 会话探活是小程序内 `wx.request` 打 Magento `GET /rest/default/V1/directory/currency`
- 底座 suite 只有 `platform.live_runtime_proof`；业务叶子另加，不从 Planting catalog 迁过来

```sh
yarn e2e:verify-base
yarn e2e:doctor
yarn e2e:run
```
