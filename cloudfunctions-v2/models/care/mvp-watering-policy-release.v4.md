# care-watering-mvp/v4 发布正文说明

- 正文文件：`mvp-watering-policy-release.v4.json`；发布文档：`models/policy-releases/care.mvp_watering.v4.release.json`（发布版本 `care-watering-mvp/v4.0.0`）。
- 依据：用户 2026-10-10 第三轮裁定——缺段补齐 6 小时与光照系数并入现有浇水策略新版本，v3 行为保持可复算。
- 内容：与 `mvp-watering-policy-release.v3.json` 逐字段相同，仅 `contractVersion` 改为 `care-watering-mvp/v4`，并新增三个运行字段（取值等于迁移前代码常量）：

| 字段 | 取值 | 含义 | 绝对边界（目录 `care.watering.runtime_absolute_bounds`） |
|---|---|---|---|
| `dryingGapFillMaxHours` | 6 | 环境数据内部缺段可保守补齐的最长小时数（合同 8.11） | 0–24 |
| `maximumPpfdPerGhi` | 2.3 | Lux 锚点换算 PPFD 与室外 GHI 之比的物理上界（μmol/J） | 1.8–3 |
| `indoorClimateWindowHours` | 24 | 室内实测温湿度覆盖测量后的小时数（合同 2a 节） | 1–72 |

- 切换方式：策略发布 CLI `publish` 后 `activate --expect-current care-watering-mvp/v3.x.x`（以环境中实际 v3 版本号为准）；回滚用 `rollback`。
