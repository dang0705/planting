# P1 身份域语义审查：当前合同与 DDL 闭环

- 审计编号：`P1-identity-semantics-2026-09-20`
- 服务 ticket：`z8v0kmr970`
- 当前状态：`STATIC_CONTRACT_DDL_AJV_PASS / RUNTIME_CONCURRENCY_CLOUDBASE_OPEN`
- 审计范围：统一用户、平台身份绑定/解绑/重绑、登录 session、游客持有证明、内部 service nonce、唯一约束、CapabilitySnapshot 与公开引用边界。
- 结论边界：当前合同、状态机、001/003 DDL、TypeScript 类型、AJV Schema 和静态测试已覆盖 P1 身份语义项；这不是 P2 identity 运行实现，也不证明真实 `/api/v2`、CloudBase、MySQL 并发或跨域链路已验收。
- 入口核验：`node docs/backend-v2/verify-entrypoint.mjs` 当前通过；Master Plan 为 `2199` 行，SHA-256 `1a8382b83eb7720425f201afef9920e148e8eda3b15618e112516839fac10357`。

## 1. 当前事实源与 SHA-256

本次复核只读取当前 v2 合同、数据、DDL、类型、Schema、manifest 和正式测试；不读取旧迁移材料、运行数据、前端实现或 CloudBase 线上数据。`unit_real_data` 的 SHA 一致只证明制品字节和登记关系，不替代真实环境证据。

| 当前事实源 | SHA-256 |
|---|---|
| `docs/backend-v2/contracts/principal-and-capability.md` | `dff62758dd223ed2249ebd0d9717548109bd57873fab042d49907865ff0d5524` |
| `docs/backend-v2/contracts/guest-session-claim.md` | `b0b4e53d44cc84556f8e13104cdd7f700430a1ac3451e78fc52e7f1469da395b` |
| `docs/backend-v2/contracts/user-plant.md` | `704355797729e7a13d218f9a2cac96fc3e65b1833250ed85c205e7a5e8b18878` |
| `docs/backend-v2/contracts/http-api.md` | `0ecf6dc11211f9276bde005bdcd92f0ae5a30e82c9b65888dd54c74a6058a8ee` |
| `docs/backend-v2/data/state-machines.md` | `c14b685993e5178e52e5bfcb683674b736c3020ac76eab9b60105bbe9a89d5d9` |
| `docs/backend-v2/data/v2-data-dictionary.md` | `ac41572a0f8263725722bb060092668361e155b393ab0f9da5bd7a8654902f54` |
| `docs/backend-v2/data/manifest.json` | `ace61653cedc5f7d73f5560a98eae53c0b16aa4c86fcca48a6d9d4e1ae0cd387` |
| `docs/backend-v2/architecture/configuration-variable-catalog.json` | `7f51103ed728465e4645b853cadac008765cb61ed4abfc2df4ee686a9e4d9c9e` |
| `docs/backend-v2/schema/001_identity.sql` | `e1adf7fc04a33cfd1bb0945c9298e4c6a832edc28096d874973eb420890466d6` |
| `docs/backend-v2/schema/003_user_plant.sql` | `2e8494c23e7bd7a26871e2031b934ab2746a89b2d7af5ca4a9abbd469cc5c6b2` |
| `docs/backend-v2/schema/manifest.json` | `ad7e0e8a198ce6b14db7ab6abf0cbffb93e33fbbce640572ab123a18bd173f77` |
| `cloudfunctions-v2/src/contracts/types.ts` | `81ed6d656be12ce6bdeaa2870d6b33c96819953e5f6534a4dcfd11869d374b75` |
| `cloudfunctions-v2/src/contracts/schemas.ts` | `d156dd0d224234669975e9e239fd8de04827192c2ee2db79188baf90d30892af` |
| `cloudfunctions-v2/test/p1-identity-foundation.spec.ts` | `8b5ae09e92eb1c3c34adbad3198741e558a1a4cb7625e2dcfb086c0a0286ed3d` |
| `cloudfunctions-v2/test/p1-public-contracts.spec.ts` | `e0d063d7b00d56b5050d09ff2bba4d626713841cd9b4a2a6e2f289c1becfb1cb` |
| `cloudfunctions-v2/test/p1-guest-session-claim.spec.ts` | `e2b6da58ce3ca54839ec69bb61f32496059a0a2ca8c2e04ca6b3e87d24498245` |
| `cloudfunctions-v2/test/p1-state-and-data-dictionary.spec.ts` | `e2d791d823f5dc930b282aa5cc0f364f7fffddc765e2eff41d1524a9dac9cea0` |

## 2. 当前已冻结的身份语义

### 2.1 统一用户、平台身份与 session

- `users` 是统一用户主体；平台 OpenID、手机号、匿名 UID、设备 ID、IP 和 Cookie 不是 `user_id`。`public_user_id` 使用 `usr_...`，内部表只用 `user_internal_id`。
- canonical 平台主体键是 `(platform, app_scope, platform_subject_hash)`；摘要算法固定为受控密钥的 HMAC-SHA-256，密钥版本只保存引用。`platform_identities` 使用全局唯一键，撤销后更新原行，不允许物理删除后换用户重建。
- `active_slot` 与 `(user_internal_id, platform, app_scope)` 唯一键表达同一用户同平台应用范围最多一个 active 绑定；解绑路由按当前 session 的 `app_scope` 作用，最后一个 active 登录入口由稳定公开错误保护。
- `user_sessions` 只保存 bearer 摘要、统一用户、平台身份、session version、状态和时间；复合外键禁止用户、平台身份和认证平台拼接错位。MVP 登录 session 为 24 小时，refresh 窗口为 0。
- 状态机已明确 users、platform identities、sessions 的合法转换及首次登录唯一竞争规则；配置目录已将游客 24 小时、proof 轮换宽限 300 秒、用户 24 小时、服务签名时钟偏差 300 秒和 nonce 保留 600 秒标为 `confirmed`。

### 2.2 游客 proof 与认领

- `X-QHZ-Guest-Proof` 是唯一证明传输位置；URL、JSON、日志和错误响应不得携带原始 proof。服务端只保存 SHA-256、proof version 和最多 300 秒的上一版摘要宽限期。
- `ClaimGuestSessionCommand` 不接收 `proof_version`、`user_id` 或内部主键；服务端从锁定会话的验证结果写入 proof version。003 DDL 保存 proof version、processing lease、attempt count、失败原因和目标一致性约束。
- `guest_claim_commands` 是唯一公开 `claim_ref` 事实源；`guest_case_claims` 是不可变成功事实；`guest_plant_cases` 的 claimed owner 是可重建当前投影。合同要求新建植物、成功事实、案例投影和命令完成状态同一事务提交或全部回滚。

### 2.3 service 签名与 CapabilitySnapshot

- service 合同固定 `key_id/timestamp/nonce/body_sha256/scope/signature`、HMAC-SHA-256 规范化串、正负 300 秒时钟窗口、至少 600 秒 nonce 保留和 `(service_name, nonce_hash)` 不含 `key_id` 的唯一消费键。
- `ServicePrincipalDto` 的类型和 AJV Schema 按服务分支收窄为单一 scope；未知 scope、跨服务 scope、多个 scope 和 `ALL_*` 均拒绝；路由 registry 的 `requiredScope` 与服务白名单逐项对应。
- `CapabilitySnapshotDto` 已存在于 `types.ts`；Schema 严格区分 guest/user，guest 禁止 `user_id` 且植物上限为 0，user 必须有 `usr_...`；校验包装器拒绝 `generatedAt >= validUntil`。005 DDL 进一步约束主体形状、有效期和已发布能力策略复合外键。
- 公开 `UserPlantDto` 只返回 `upl_...`、生命周期、身份状态、版本和时间；内部 `user_internal_id`、平台主体、session_ref、proof、nonce 和快照内部引用不得进入公开响应。

## 3. P1 身份语义的当前静态裁决

下表只表示合同、类型、DDL 和静态测试层面的当前状态；`运行边界` 不是已通过声明，而是必须保留的未验证项。

| P1 编号 | 当前事实与证据 | 运行边界 |
|---|---|---|
| `P1-ID-01` | 静态已定：`state-machines.md` 已定义 users、platform identities、sessions 的合法转换；001 状态 CHECK 与 identity foundation 测试同步。 | 状态机实际 Command、审计和跨表事务未运行验证。 |
| `P1-ID-02` | 静态已定：配置目录将 session TTL、refresh、clock skew、nonce TTL 标为 `confirmed`；合同固定 24h/0h/300s/600s。 | 策略发布读取、失效关闭和线上时钟未验证。 |
| `P1-ID-03` | 静态已定：app scope 已进入 canonical key；001 有 `uq_platform_subject` 与 active slot，合同明确删除粒度。 | 并发绑定和多应用真实读回未验证。 |
| `P1-ID-04` | 静态已定：合同规定同一主体终身只归属首次用户，撤销恢复原行，跨用户冲突返回脱敏 `IDENTITY_BINDING_CONFLICT`；DDL 保留唯一事实。 | bind/unbind/rebind HTTP 用例和人工冲突流程未实现/验证。 |
| `P1-ID-05` | 静态已定：合同、数据字典和001共同固定 HMAC-SHA-256、密钥版本引用和密文用途；原始主体不得进入业务域/日志。 | 密钥托管、轮换迁移和真实日志扫描未验证。 |
| `P1-ID-06` | 静态已定：合同与001已固定外部凭证验证后按 bearer SHA-256 读取 session，复合外键和24h session约束已落盘。 | CloudBase bearer 验证、session签发/撤销运行链路未验证。 |
| `P1-ID-07` | 静态已定：001 已有 users、binding、session、nonce 的枚举、摘要和时间 CHECK；identity foundation 测试覆盖约束文本。 | 跨表状态一致性、版本递增和非法转换的真实事务未验证。 |
| `P1-ID-08` | 静态已定：guest 合同已固定 proof header、哈希、版本、300秒宽限和常量时间比较边界；003 保存对应摘要/版本。 | 匿名主体绑定、proof 生成轮换和24h边界未在 CloudBase 运行验证。 |
| `P1-ID-09` | 静态已定：guest 合同与003已固定唯一事实源、三表复合一致性、租约恢复和失败不写成功事实；专项 guest claim 测试覆盖静态约束。 | MySQL 事务崩溃恢复、租约竞争和重复回放未验证。 |
| `P1-ID-10` | 静态已定：HTTP 合同、001 和 identity foundation 测试已覆盖 key_id、请求时间、body hash、scope、nonce唯一键和签名版本字段。 | 验签成功与 nonce 原子占用、密钥轮换和真实服务请求未验证。 |
| `P1-ID-11` | 静态已定：types/schemas 按服务白名单收窄 scope，route registry 已登记逐路由 requiredScope。 | 真实 middleware 执行、scope 与业务 handler 的联动未验证。 |
| `P1-ID-12` | 静态已定：CapabilitySnapshot 类型、AJV 互斥分支、时间顺序包装器、005 DDL主体/策略外键和测试均已存在。 | 能力快照运行生成、过期重新裁决和公开投影未验证。 |
| `P1-ID-13` | 静态已定：001/003 的状态时间约束、proof/claim/nonce 唯一性和专项测试已落盘；总 DDL 测试读取 schema manifest。 | 空库真实建表、跨表读回和并发约束仍需真实 MySQL 验收。 |
| `P1-ID-14` | 静态已定：`state-machines.md` 已规定首次登录在单事务中完成并发唯一竞争重读赢家、不得留下孤儿用户。 | 真实并发压测、唯一竞争后的 users/binding/session 计数未验证。 |
| `P1-ID-15` | 静态已定：`http-api/v1`、types/schema 和 API registry 已登记身份冲突、最后绑定、游客认领和主体失效的稳定公开错误，且不枚举内部所有者。 | 真实 HTTP 错误映射、日志/响应脱敏和 CloudBase Gateway 未验证。 |

## 4. 当前本地测试证据

- `p1-identity-foundation.spec.ts`：读取真实 001/003/005 DDL、状态机并通过 CapabilitySnapshot、服务 scope、proof、状态/时间 CHECK 的静态 Expected。
- `p1-public-contracts.spec.ts`：通过 guest/user/service principal、UserPlant 脱敏、认领目标、奖励事件和 AI 动作边界的 AJV 负向 Expected。
- `p1-guest-session-claim.spec.ts`：通过 guest claim 单一事实源、三表复合关联、事务文字合同、processing lease、proof version 和 target 一致性的静态 Expected。
- `p1-state-and-data-dictionary.spec.ts`：通过状态机、数据字典和 `data/manifest.json` 的 SHA 读回；新鲜度测试还核验本审计 sidecar。
- 所有上述测试层级为 `unit_real_data` 或 `unit_fake`；它们不连接 CloudBase/MySQL，不把 HTTP 200、字符串存在或 SHA 一致当作身份运行时通过。

## 5. 仍未验证与继续条件

当前没有身份业务函数、真实 `/api/v2` identity handler 或 CloudBase 运行证据，因此不得宣布 P1 identity foundation 已上线。必须保留以下边界：

1. 在真实 MySQL 空库中读回 001/003 的索引、外键、CHECK、认领三表一致性，并执行 first-login、bind/unbind、session revoke、guest claim 和 service nonce 的并发/回滚/重放测试。
2. 通过真实 CloudBase 身份 Provider 验证匿名主体、平台凭证、bearer 映射、密钥引用和错误脱敏；不能用 OpenID、设备 ID 或 HTTP 200 替代。
3. 实现 P2 identity Command/Repository/HTTP 后，重新核对 public projection、统一 `user_id` 归属、session_version 原子递增、最后绑定保护、scope middleware 和审计事件。
4. 在所有运行证据完成前，保持 `RUNTIME_CONCURRENCY_CLOUDBASE_OPEN`；本审计只声明当前合同、类型、Schema、DDL 和静态测试已形成的静态状态。
