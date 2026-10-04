# 已发布档案写入策略读取合同

归属 E03 原票 `z8v0kmr9mj`。本增量接通已有档案 PATCH，不新增可配置变量、默认值、表或自动发布能力。

档案策略采用 `user-plant / profile_minimum_completeness`，正文 Schema 为 `user-plant-profile/v1`。正文仅包含配置目录已确认的 `profileVersion`、`requiredFields`、`acceptedIdentityStates`、`rewardOncePerUser`；对应唯一 Schema 文件为 `profile-completeness-policy.v1.schema.json`。当前 PATCH 只保存已冻结昵称和测量事实，不因此宣称完整档案或发放奖励。

公共 HTTP 写策略采用 `http / request_write`，正文 Schema 为 `http-request-write-policy/v1`。正文仅包含 `jsonBodyLimitBytes=1048576` 与 `idempotencyRetentionHours=168`，对应目录既有普通请求大小及通用幂等保留项；唯一 Schema 为 `http-request-write-policy.v1.schema.json`。单位转换为毫秒使用精确的小时换算，不生成新的保留期策略。

读取器在一次只读 SQL 中联合活动指针与不可变发布表，取得上述两份记录。每份必须核验域、策略代码、Schema、发布引用与版本、活动指针版本及摘要、完整 JSON Schema 和规范 JSON SHA-256、active 状态、已验真时间及生效区间。当前时刻为服务端捕获的有效 UTC 毫秒；生效下界包含，失效上界不包含。验真时间不得晚于当前时刻，失效时刻必须晚于生效时刻；没有截止可为 null。缺失、重复、损坏或不满足条件返回不可用，不补造值；数据库异常保持异常，由 HTTP 边界统一拒绝。

每个 PATCH 请求在正文读取前获取一次快照；后续大小限制和写命令消费同一快照。活动指针随后变化不替换本请求策略。发布引用及摘要仅为内部追溯信息，不进入公开响应或日志。读取不写发布、不改变指针、不执行 DDL；正式发布与真实登录仍分别验收。
