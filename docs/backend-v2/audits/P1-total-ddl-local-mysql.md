# P1 总 DDL 本地 MySQL 8.4 复验

- 当前结论：`LOCAL_MYSQL_EMPTY_DATABASE_PASS`。
- 证据等级：本机隔离 MySQL `8.4.11` 的真实空库验证；不是 CloudBase MySQL、不是公开 API、不是发布授权。
- DDL 版本：`backend-v2-schema/v1`，按当前 manifest 的 8 份 SQL 执行：`001 → 002 → 003 → 004 → 007 → 005 → 006 → 008`。
- 环境边界：使用 Docker Desktop `29.8.0` 启动一次性官方 `mysql:8.4` 容器，不映射宿主端口，数据目录为容器内临时文件系统；镜像摘要为 `sha256:85b9bf2e29cf836ecb8c2a15a935d4ba0c606631dff1dd79531a11983c638f2a`，实际服务端为 MySQL `8.4.11`。未连接、读取或修改 CloudBase。

## 实际执行命令

```bash
docker run --rm -d --name qhz-v2-p1-mysql-20260920 \
  --tmpfs /var/lib/mysql:rw,nosuid,size=1g \
  -e MYSQL_ALLOW_EMPTY_PASSWORD=yes mysql:8.4 \
  --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci

docker exec qhz-v2-p1-mysql-20260920 mysqladmin --no-defaults -uroot ping
docker exec qhz-v2-p1-mysql-20260920 mysql --no-defaults -uroot \
  -e 'CREATE DATABASE qhz_v2_p1_a CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
while IFS= read -r sql_file; do
  docker exec -i qhz-v2-p1-mysql-20260920 mysql --no-defaults -uroot qhz_v2_p1_a < "$sql_file"
done < "$ddl_files_from_current_manifest"
```

`ddl_files_from_current_manifest` 由 `docs/backend-v2/schema/manifest.json` 的 `files` 顺序生成，未手工重排或跳过文件。

## 空库建表结果

| 检查 | 真实结果 |
|---|---:|
| `INFORMATION_SCHEMA.TABLES`（当前 Docker 复验库） | `90` 张表 |
| `trial_entitlements` 有效插入 | `user_internal_id=1`，`starts_at_ms=1700000000000`，`expires_at_ms=1700086400000` |
| 能力快照有效插入 | `1` 条，引用 `subscription/capability_catalog` 已发布策略 |

## Docker 双空库确定性复验

2026-09-20 在同一个全新一次性容器中创建两个独立空库，每个空库都严格按当前 manifest 的顺序执行全部 8 份 DDL。两个数据库均创建 `87` 张表；使用容器内 `mysqldump --no-data --skip-comments --skip-add-locks --skip-set-charset --compact` 导出后，两个结构导出的 SHA-256 均为：

```text
4bce86b3082ab46426d50c8ac1fd9ef428b2a2ed3e855ffa5d9d95e3ddca52c4
```

字节比较结果为一致。`qhz_v2_p1_a` 的 `INFORMATION_SCHEMA` 读回如下：

| 检查 | 结果 |
|---|---:|
| 表 | 90 |
| 缺表中文注释 | 0 |
| 缺字段中文注释 | 0 |
| 非 `utf8mb4` 表 | 0 |
| 缺内部 `id` 的表 | 0 |
| 缺受控 `_openid` 的表 | 0 |
| `_openid` 索引 | 0 |
| 外键 | 107 |
| CHECK 约束 | 137 |
| UNIQUE 约束 | 146 |
| 不可变触发器 | 4 |

## 001 → 005 试用权益约束

先写入三名统一用户，分别用于有效样例、起算锚点负向样例和窗口负向样例。有效样例中
`trial_entitlements.starts_at_ms` 与 `users.created_at_ms` 均为 `1700000000000`，并且
`expires_at_ms - starts_at_ms = 86400000`。

| 负向写入 | 真实结果 | 证明的约束 |
|---|---|---|
| 用户 2 的 `starts_at_ms=1701000000001`，而 `users.created_at_ms=1701000000000` | MySQL 外键拒绝（`Cannot add or update a child row`） | `fk_trial_user_created_at` 强制试用起算等于用户创建时间。 |
| 用户 3 的 `starts_at_ms=1702000000000`、`expires_at_ms=1702086399999` | MySQL CHECK 拒绝（`Check constraint`） | `ck_trial_window` 强制固定 24 小时（`86400000` 毫秒）窗口。 |

两个负向样例使用独立用户，避免每用户一次试用唯一键先行遮蔽被测约束。最终 `trial_entitlements` 仅有 `1` 条有效记录。

## 007 → 005 能力策略发布外键

先写入 `business_policy_releases` 的一条
`subscription/capability_catalog` 发布，再写入发布内部键、领域、策略代码、发布引用、版本和内容
SHA-256 全部匹配的游客能力快照，插入成功。随后保持其他发布标识不变，仅将
`capability_policy_content_sha256` 改为不同的 64 位 SHA-256；MySQL 以
`Cannot add or update a child row` 拒绝该插入。最终 `capability_snapshots` 仅有 `1` 条有效记录。

这证明 manifest 的 `007 → 005` 顺序能够建立并执行复合外键；快照不能把策略版本字符串或不匹配的内容 SHA 冒充同一不可变发布。

## 未覆盖与继续条件

本次不证明 CloudBase MySQL 兼容性、CloudBase 权限、运行时事务、策略 JSON 的 TypeScript/AJV 校验、策略激活/回滚、公开 HTTP 脱敏或端上行为。任何 CloudBase 写入、生产 DDL、付费能力开放与现有库迁移均须另行授权和验收。

## 当前 DDL 修订的新增约束复验

`001_identity.sql` 使用 MySQL 8.4 可执行的 `REGEXP_LIKE`。使用全新隔离空库按当前 8 份 DDL 执行成功，`INFORMATION_SCHEMA.TABLES` 读回为 `90` 张表。以下是当前合同的真实写入结果：

Foundation 幂等表在同版 MySQL 中完成额外读回：合法 `processing → completed` 转换成功，168 小时到期差值为 `604800000` 毫秒；同作用域重复占位由 UNIQUE 拒绝，处理中携带响应与完成态缺失 JSON 均由 CHECK 拒绝。

四张奖励生产域 outbox 也在当前版本完成真实读回：合法 care pending 事件可无损读回事件版本、生产域、统一用户、用户植物、发生引用和策略版本；同域重复事件、错误生产域、缺失用户植物以及 pending 携带租约分别由 UNIQUE/CHECK 拒绝。identity 与 subscription 的通用 outbox 未被错误套用奖励事件专属字段。

| 场景 | 真实结果 | 证明的约束 |
|---|---|---|
| `authority_source='WCVP'` 的分类实体 | 插入成功 | WCVP 是允许的权威来源。 |
| `authority_source='UNKNOWN'` 的分类实体 | MySQL CHECK 拒绝 | `ck_taxon_authority_source` 拒绝未登记来源。 |
| `expires_at_ms IS NULL` 的 AI grant | MySQL NOT NULL 拒绝 | 所有额度批次必须在发放时锁定绝对到期时间。 |
| `expires_at_ms = granted_at_ms` 的 AI grant | MySQL CHECK 拒绝 | `ck_ai_grant_expiry_after_grant` 要求到期晚于发放。 |
| `reserved_amount=10`、`settled_amount=4`、`released_amount=5` 的 allocation | MySQL CHECK 拒绝 | `ck_ai_allocation_conservation` 强制预占额度等于结算加释放。 |
| `status='committed'` 但两个积分账本链接均为空的兑换 | MySQL CHECK 拒绝 | `ck_redemption_terminal_links` 强制终态链接一致。 |
| `status='applied'` 但 `applied_at_ms` 为空的奖励收件 | MySQL CHECK 拒绝 | `ck_reward_inbox_status` 强制 applied 的结果引用与生效时间。 |
| `status='rejected'` 但 `rejection_code` 为空的奖励收件 | MySQL CHECK 拒绝 | `ck_reward_inbox_status` 强制 rejected 的拒绝代码且禁止成功字段。 |

能力策略复合外键、试用起算锚点和 24 小时窗口也在同一当前修订空库复验：错误策略内容 SHA 与错误试用起算分别由外键拒绝，不足 24 小时试用窗口由 CHECK 拒绝。最终有效记录数为：WCVP 分类 `1`、试用 `1`、能力快照 `1`、AI grant `1`；allocation、兑换和奖励收件的非法行均为 `0`。

## 养护原子环境事实新增复验

当前 DDL 新增 `care_environment_observations`、`care_environment_snapshots` 和 `care_environment_derivations`，并为游客临时养护结果增加输入、算法、派生与结果哈希。MySQL 8.4.11 已验证：

- 同一全局天气快照可被两株用户植物分别引用，同一植物重复来源依然由 UNIQUE 拒绝。
- `weather_adapter` 写入 `indoor` 由 CHECK 拒绝。
- 非法游客输入哈希由 CHECK 拒绝。
- 原子事实、输入快照、派生指标和已生成游客结果的 `UPDATE` 均由 SQLSTATE `45000` 触发器拒绝。

详细字段与负向路径见 `P2-care-environment-foundation-2026-09-20.md`。
