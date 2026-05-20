# 2026-05-18 天气城市共享缓存与 geocoder 去重 handoff

## 任务目标

用户要求小程序拿到经纬度后，通过腾讯地图逆地理编码得到 `result.address_component.city`，并以该城市作为 `weather-http/weather/current` 的服务端缓存 key。相同城市客户端应在 24 小时内读取服务端缓存；缓存过期或为空时再请求外部天气 API。同时，Network 面板中 `https://apis.map.qq.com/ws/geocoder/v1/` 不应因首页双入口被调用两次。

## 本轮实现摘要

- `src/api/weather.js`
  - `getCityNameByLocation(latitude, longitude)` 增加同坐标 in-flight 复用和短期有效城市名缓存。
  - 只缓存有效城市名；`当前位置`、定位失败等兜底值不进入城市缓存。
  - `getWeatherInfo()` 支持向 `weather-http/weather/current` 传 `city`、`province`。
- `src/components/CustomNavbar.vue`
  - 天气刷新时把 `lat`、`lng`、`city`、`province`、`useCache` 一并传给天气接口。
- `src/pages/index/index.vue`
  - 删除 mounted 阶段重复定位逻辑，首页自动定位和天气刷新由 `CustomNavbar` 统一承担。
- `src/vue-query/weather/queries/current-weather.js`
  - `queryKey` 和请求体纳入 `city`、`province`、`useCache`。
  - `useCache=false` 时设置 `staleTime=0`，避免前端缓存短路真实刷新。
- `cloudfunctions/weather-http/app.js`
  - `weather_cache` 改为优先使用城市共享缓存：`cache_scope='city'`、`cache_key='weather:city:{city}'`、24 小时有效。
  - 城市缓存行使用合成 `_openid`，避免破坏历史 `_openid` 唯一索引。
  - 城市缓存命中后同步当前用户 user cache，供诊断服务继续按用户读取。
  - 无效城市名不写入、不命中 city cache。
- `cloudfunctions/diagnose-http/repositories/weather-repository.js`
  - 诊断天气上下文只读取 user cache 范围，避免误读城市合成缓存行。
- `scripts/sql/ensure-weather-cache-city-key-20260518.sql`
  - 记录 `weather_cache` schema 变更：`cache_scope`、`cache_key`、`city`、`province` 和 `uniq_weather_cache_scope_key(cache_scope, cache_key)`。

## SQL 与 CloudBase 状态

- 已通过 CloudBase MCP 确认 MySQL 实例可用。
- 已在 `cloud1-2grufevs395a9d5e.weather_cache` 和 `cloud1_dev.weather_cache` 增加字段：
  - `cache_scope`
  - `cache_key`
  - `city`
  - `province`
- 已在两个 schema 增加唯一索引：
  - `uniq_weather_cache_scope_key(cache_scope, cache_key)`
- 已通过 CloudBase MCP 部署：
  - `weather-http`：`updateFunctionCode` requestId `35d31f6f-90ec-487f-87df-07295dd92857`
  - `diagnose-http`：`updateFunctionCode` requestId `e6189ccd-c694-4878-90f1-9dfc84ecdc88`

## 已验证

- `node --check cloudfunctions/weather-http/app.js`
- `node --check cloudfunctions/diagnose-http/repositories/weather-repository.js`
- `npx oxlint src/api/weather.js src/vue-query/weather/queries/current-weather.js src/components/CustomNavbar.vue src/pages/index/index.vue cloudfunctions/weather-http/app.js cloudfunctions/diagnose-http/repositories/weather-repository.js`
  - 结果：0 errors；存在既有 `no-console`、`no-magic-numbers` warnings。
- `npm run build`
- `VITE_APP_ENV=development VITE_CLOUDBASE_ENV_ID=cloud1-2grufevs395a9d5e npx uni build -p mp-weixin`
- 真实 CloudBase gateway smoke，使用 `cloud1_dev`：
  - 有效城市首次请求：`cached=false`、`cacheScope=city_refresh`、返回 `cachedAt` / `expiresAt`。
  - 同一城市不同 openid 二次请求：`cached=true`、`cacheScope=city`。
  - `useCache=false`：`cached=false`、`cacheEnabled=false`、`cacheScope=''`。
  - 无效城市 `当前位置`：不命中、不写入 city cache，降级 user refresh。
  - smoke 测试行已清理。
- 微信开发者工具代理验收：
  - 通过 wechat-dev-tools MCP 连接 `dist/dev/mp-weixin`。
  - 清空日志后 `reLaunch pages/index/index`，等待 5 秒读取日志。
  - 定位、城市解析、天气刷新只出现一组：`位置权限状态: authorized`、`获取位置成功`、`获取城市信息成功`、`获取位置信息成功`、`刷新天气`。
  - 天气响应为 `cached=true`、`cacheScope=city`、`city=上海市`、`province=上海市`。

## 未直接验证

- wechat-dev-tools MCP 未暴露 Network request list，因此没有直接读取 Network 面板里的 `https://apis.map.qq.com/ws/geocoder/v1/` URL 计数。
- 当前自动化证据是运行日志代理验收：可证明冷启动只完成一次定位到城市解析链路；若验收方坚持 Network URL 级计数，仍需人工打开 Network 面板确认。
- production schema 已完成 DDL，真实 gateway smoke 本轮使用 development schema，避免污染正式天气缓存。

## 文档同步

- `docs/code-logics/01_后端云函数总览_与服务边界.md`
  - 更新天气服务职责：从“按用户缓存到次日零点”改为“优先按城市 24 小时共享缓存，并同步用户缓存供诊断读取”。
- `docs/code-logics/09_植物识别_图片存储_天气_用户植物模块.md`
  - 更新天气服务函数、前端 geocoder 去重、city cache 结构、无效 city 降级和 diagnose-http 读取边界。

## Subagent 线程复用表

| 角色 | 线程 | 本轮状态 |
|---|---|---|
| `task_planner` 替代 | `019e3b2d-80e2-7c63-98cc-804f83546e84` | 专用角色不可用，default 替代完成规划审查 |
| `code_explorer` 替代 | `019e3b2d-3023-76f0-b5fe-426643c59cfa` | 专用角色不可用，default 替代完成代码定位 |
| `architect_reviewer` 替代 | `019e3b2d-61a1-7241-b3e4-10c0d85a8bcd` | 专用角色不可用，default 替代完成实现前审查和实现后 review |
| `release_ops` 替代 | `019e3b3b-37f1-75b3-96ef-fd8a36eead43` | 专用角色不可用，default 替代给出部署、smoke、回滚审查 |
| `qa_reviewer` 替代 | `019e3b3f-08cf-7120-a8d6-344de9234fc9` | 专用角色不可用，default 替代进行只读 QA 审查 |

## 后续建议

1. 在微信开发者工具打开首页并观察 Network，确认单次进入首页只出现一次腾讯 geocoder 请求。
2. 如需验证 production city cache，可选一个明确测试城市执行一次真实 smoke，完成后手动过期或清理对应 `cache_scope='city'` 测试行。
3. 若后续发现同名城市缓存误复用，应把 `cache_key` 从 city-only 升级为 province + city；本轮按用户明确要求保持 city-only。
