# 生成式视觉诊断测试环境上线清单（2026-10-11）

- 适用范围：ClickUp z8v0kmvhnd「视觉诊断 3/4」，测试环境 `cloud1-2grufevs395a9d5e`，测试库 `qinghuazhi_v2_test`。
- 本清单只写顺序、命令和检查点。本轮**没有部署，也没有执行任何云端 SQL**。每一步写库或部署前，都需要用户另行授权，由主代理统一执行。
- 一句话原则：**先建表、再发布策略、最后部署代码**。
  - 新代码读不到策略或表时只返回 503，不会回退到默认值。
  - 旧代码不读本次新增的三张表和三个策略，所以前两步可以提前做。
- 首个发布版的版本组如下（用户 2026-10-11 裁决）：
  - 提示词 `visual-diagnosis-prompt/v1.3`，前缀摘要 `20c6418e…35fe80`；
  - 输出结构 `diagnosis-visual-gen-output/v1`；
  - 药剂名单 `diagnosis-visual-gen-agent-allowlist/v1`，规范化摘要 `46a36bba…64b60`；
  - 模型兜底顺序 qwen3.7-flash → … → qwen3.5-plus-2026-02-15，关闭 thinking，默认 `json_object`；
  - 成本策略 `diagnosis-visual-cost/v1`：预占 23 点、上限 17,920 微元；
  - 预占有效期 300 秒。

## 0. 前置检查（本地）

1. 在「HEAD + 本次改动」的干净目录里依次跑以下检查，要求 0 失败：
   - 全量 `vitest`；
   - 两套 `tsc`；
   - `oxlint src test`；
   - `node scripts/build.mjs`。

   构建会自检 `dist/functions/diagnosis` 里是否只有 `sharp-linux-x64-0.35.5.node` 和 `libvips-cpp.so.8.18.7` 两个平台二进制，不符合就直接失败。
2. 本机 Docker 跑下面三组真实库测试：
   - `npx vitest run --config vitest.mysql.config.mjs test/e2e/visual-diagnosis-repository.mysql.spec.ts`
   - `… test/e2e/visual-diagnosis-flow.mysql.spec.ts`
   - `… test/e2e/subscription-provider-unknown.mysql.spec.ts`
3. 逐个校验发布文档，并记录每个的 `contentSha256`：

```bash
cd cloudfunctions-v2
node scripts/policy-release.mjs validate models/policy-releases/subscription.ai_reservation.v1.release.json
node scripts/policy-release.mjs validate models/policy-releases/diagnosis.visual_generation.v1.release.json
node scripts/policy-release.mjs validate models/policy-releases/subscription.capability_catalog.v1-1.release.json
```

2026-10-11 本机校验结果（`contentSha256`）。上线前重跑一次，结果必须一致：

- `subscription/ai_reservation` v1.0.0：`982ef15085c0c249aaed39f26692431c2797c2c06d117cb4362150df5686e125`
- `diagnosis/visual_generation` v1.0.0：`c445cc653e6933259eafcb0354c0772773176f975cdb26086a8ff57ac6e72e7b`
- `subscription/capability_catalog` v1.1.0：`dc3e90c111f8222de5a66f8297325795cc62421f591ce25b48103c848f3c0ff3`

## 1. 迁移 032（只建新表，不改既有表）

前置迁移：001（users）、003（user_plants）、016（authenticated_ephemeral_plant_cases）。测试库已执行过。

1. 预演：

```bash
node scripts/apply-schema-cloudbase-test.mjs --dry-run
```

   该脚本按 manifest 全量改写，只取输出中 `032_diagnosis_visual_sessions.sql` 那一段的语句。**不要用 `--apply` 重跑全量**，001–031 已经存在。
2. 按下面的顺序逐条执行（`tcb db execute` 一次只能执行一条语句）：

| 顺序 | 语句 |
|---|---|
| 1.1 | `CREATE TABLE diagnosis_visual_images` |
| 1.2 | `CREATE TABLE diagnosis_visual_sessions`（外键依赖 users、user_plants、authenticated_ephemeral_plant_cases） |
| 1.3 | `CREATE TABLE diagnosis_visual_feedback`（外键依赖 1.2） |
| 1.4–1.9 | 6 个触发器：`tr_diag_visual_image_update`、`tr_diag_visual_session_insert`、`tr_diag_visual_session_update`、`tr_diag_visual_session_delete`、`tr_diag_visual_feedback_update`、`tr_diag_visual_feedback_delete` |

3. 读回核对，预期值分别为 3、6，以及三行 `0`：

```sql
SELECT COUNT(*) FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'qinghuazhi_v2_test'
   AND TABLE_NAME IN ('diagnosis_visual_images', 'diagnosis_visual_sessions', 'diagnosis_visual_feedback');
SELECT COUNT(*) FROM information_schema.TRIGGERS
 WHERE TRIGGER_SCHEMA = 'qinghuazhi_v2_test' AND TRIGGER_NAME LIKE 'tr\_diag\_visual\_%';
SELECT TABLE_NAME, TABLE_ROWS FROM information_schema.TABLES
 WHERE TABLE_SCHEMA = 'qinghuazhi_v2_test' AND TABLE_NAME LIKE 'diagnosis\_visual\_%'
   AND TABLE_NAME <> 'diagnosis_visual_evidence';
SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
 WHERE TABLE_SCHEMA = 'qinghuazhi_v2_test' AND TABLE_NAME = 'diagnosis_visual_sessions' ORDER BY CONSTRAINT_NAME;
```

   - 注意：`diagnosis_visual_evidence` 是 004 的旧表，`LIKE 'diagnosis_visual_%'` 会把它也匹配进来，所以要显式排除，或者像上面那样列出确切表名。
   - 约束读回应包含 `ck_diag_visual_session_subject`、`_status`、`_terminal`、`_quota`、`_time`，以及三个外键。
4. 门禁抽查。只在空表上做；验证完不需要清理，因为插入会被拒绝：

```sql
INSERT INTO qinghuazhi_v2_test.diagnosis_visual_sessions (visual_diagnosis_ref, user_internal_id, subject_kind, user_plant_internal_id, image_refs_json, reservation_ref, version_group_json, status, release_reason, charged_points, quota_outcome, record_sha256, completed_at_ms, created_at_ms, updated_at_ms)
VALUES ('vds_rollout_check_001', 1, 'user_plant', 1, '[]', 'aqr_rollout_check_001', '{}', 'failed_no_charge', 'model_failed', 0, 'released', REPEAT('0', 64), 1, 1, 1);
-- 预期被触发器拒绝：「新视觉诊断必须以未认领的处理中状态创建」
```

## 2. 发布并激活策略（旧代码不读取，可以提前上线）

每个策略都按「预演 → 发布 → 预演激活 → 激活 → 核对」执行。先看 dry-run 输出，确认无误后再加 `--apply`：

```bash
node scripts/policy-release.mjs publish models/policy-releases/<文件>.release.json
node scripts/policy-release.mjs publish models/policy-releases/<文件>.release.json --apply
node scripts/policy-release.mjs activate --domain <d> --policy <p> --version <v> --expect-current <期望当前> --actor <操作者> --reason visual_diagnosis_launch --evidence z8v0kmvhnd
node scripts/policy-release.mjs activate --domain <d> --policy <p> --version <v> --expect-current <期望当前> --actor <操作者> --reason visual_diagnosis_launch --evidence z8v0kmvhnd --apply
node scripts/policy-release.mjs list --domain <d> --policy <p>
```

| 顺序 | 策略 | 发布文档 | 版本 | `--expect-current` |
|---|---|---|---|---|
| 2.1 | `subscription/ai_reservation` | `subscription.ai_reservation.v1.release.json` | `subscription-ai-reservation/v1.0.0` | `none`（首次发布） |
| 2.2 | `diagnosis/visual_generation` | `diagnosis.visual_generation.v1.release.json` | `diagnosis-visual-generation/v1.0.0` | `none`（首次发布） |
| 2.3 | `subscription/capability_catalog` | `subscription.capability_catalog.v1-1.release.json` | `subscription-capability-catalog/v1.1.0` | **先 `list --domain subscription --policy capability_catalog` 查出当前活动版本号**，用它作为取值；不能写 `none`，测试环境已有旧目录 |

- 2.3 只改动 `USER_DIAGNOSIS_VISUAL` 的范围（scope），从原值改为 `user_plant_or_authenticated_ephemeral`，其他能力不变。
  - 已签发、仍在有效期内的能力快照，`allowedCapabilities` 不受影响；新版本只对之后生成的快照生效。
- 依赖的既有策略必须已激活：`http/request_write`、`user-plant/asset_rules`、`user-plant/list_rules`（2026-10-10 上线清单第 2 节）。用 `list` 确认活动版本存在即可。
- 激活时如果实际当前版本与期望不符，CLI 以退出码 2 失败，指针不会被覆盖。

## 3. diagnosis 函数环境变量（只列名字；取值按配置目录与 Provider 档案）

| 变量 | 是否必需 | 说明 |
|---|---|---|
| `V2_MYSQL_HOST` / `V2_MYSQL_PORT` / `V2_MYSQL_DATABASE` / `V2_MYSQL_USER` / `V2_MYSQL_PASSWORD` | 必需（已有） | 测试库连接 |
| `LOG_LEVEL` | 可选（已有） | 日志级别 |
| `V2_CLOUDBASE_ENV_ID` | **新增，必需** | 云存储网关环境 ID。缺失时登记图片和发起诊断都返回 503 |
| `CLOUDBASE_STORAGE_API_KEY` | **新增，必需（凭证）** | 云存储 HTTP API Key，只在调用时按变量名读取 |
| `V2_CLOUDBASE_STORAGE_TOTAL_DEADLINE_MS` | 可选 | 云存储总时限，代码默认值见 Provider `cloudbase_storage` |
| `LLM_ALIYUN_BAILIAN_API_KEY` | **新增，必需（凭证）** | 百炼 API Key（Provider `bailian_qwen_diagnosis.credentialRef`） |
| `LLM_ALIYUN_BAILIAN_BASE_URL` | 可选 | 不设置时使用官方北京端点 |
| `V2_BAILIAN_DIAGNOSIS_TOTAL_DEADLINE_MS` | **新增，必需** | 单次模型调用总时限，取值见 `diagnosis.visual_gen.provider_total_deadline_ms`，代码不提供默认值 |
| `V2_BAILIAN_DIAGNOSIS_MAX_ATTEMPTS` | **新增，必需** | 同一模型内最多尝试次数，取值见 `diagnosis.visual_gen.provider_max_attempts`，代码不提供默认值 |

- 三个百炼变量缺任一个，都不创建模型客户端，发起诊断返回 503（不会预占点数）。越界时函数启动失败，错误信息只含变量名。
- 函数超时建议不低于 300 秒（与预占有效期相同），并在冒烟时实测（见第 7 节风险 B）。
- 函数包约 27 MB（压缩后约 10 MB），不需要 Layer。

## 4. 部署与网关

1. 部署 `dist/functions/diagnosis`（HTTP 函数，Node.js 22，`scf_bootstrap`）。部署前在干净工作树重新构建。
2. 网关：`/api/v2/diagnosis/visual` 前缀转发到 diagnosis 函数。
   - 若现有 `/api/v2/diagnosis` 前缀已整体转发到 diagnosis 函数，无需新增路由，只需确认子路径没被其他规则截走。
   - 五个接口如下：
     - `GET /api/v2/diagnosis/visual/upload-targets`
     - `POST /api/v2/diagnosis/visual/images`
     - `POST /api/v2/diagnosis/visual/sessions`
     - `GET /api/v2/diagnosis/visual/sessions`
     - `GET /api/v2/diagnosis/visual/sessions/{visualDiagnosisRef}`
3. 存储权限：`diagnosis/` 目录沿用「仅创建者和管理员可读写」。服务端写压缩图使用 API Key（管理员身份）。

## 5. 冒烟步骤（测试账号须为 trial 或 member，并有不少于 23 点的有效 AI 额度批次）

先准备一个登录 Bearer。不要在日志或聊天中回显令牌。

1. **长期植物**
   1. `GET /api/v2/diagnosis/visual/upload-targets?count=1` → 200，拿到 `cloudPath`。
   2. 用小程序或云存储把一张植物照片（JPEG/PNG/WebP，不超过 5 MB）上传到 `cloudPath + '.jpg'`。
   3. `POST /api/v2/diagnosis/visual/images`，正文 `{"files":[{"fileId":"cloud://…"}]}`，带 `Idempotency-Key` → 200 `registered`。
   4. `POST /api/v2/diagnosis/visual/sessions`，正文 `{"subject":{"userPlantRef":"upl_…"},"imageRefs":["dvi_…"]}`，带 `Idempotency-Key` → **202 `processing`**。
   5. 每 5 秒 `GET /api/v2/diagnosis/visual/sessions/{vds}`，60 秒内应进入终态：`completed` 带 `result`（diagnosis-result/v2）、`imageAssessment`、`chargedPoints ≤ 23`。
   6. 读回：

```sql
SELECT status, quota_outcome, charged_points, cost_micros, JSON_LENGTH(model_attempts_json), record_sha256 IS NOT NULL
  FROM qinghuazhi_v2_test.diagnosis_visual_sessions WHERE visual_diagnosis_ref = '<vds>';
SELECT status, settled_amount, actual_cost_micros FROM qinghuazhi_v2_test.ai_quota_reservations WHERE reservation_ref = (
  SELECT reservation_ref FROM qinghuazhi_v2_test.diagnosis_visual_sessions WHERE visual_diagnosis_ref = '<vds>');
```

   预期：会话 `completed / settled`，预占 `settled`，且 `settled_amount = ceil(actual_cost_micros / 800)`。
   7. 用同一个 `Idempotency-Key` 再 POST 一次，应返回与首次相同的 202 正文，且不新增会话和预占。
2. **临时案例**
   1. `POST /api/v2/user-plants/temporary-cases`（登录 Bearer）→ 拿到 `epc_…`。
   2. 按 1.1–1.3 登记图片。
   3. `POST /api/v2/diagnosis/visual/sessions`，正文 `{"subject":{"ephemeralPlantCaseRef":"epc_…"},"imageRefs":["dvi_…"]}` → 202，之后进入终态。
   4. 读回 `subject_kind = 'authenticated_ephemeral'`、`user_plant_internal_id IS NULL`，并确认 `care_*` 与 `user_plant_timeline_projection` 没有新增记录。
3. **游客**：用游客令牌（`Bearer guest.…`）分别请求 `GET …/upload-targets?count=1` 与 `POST …/sessions` → 都是 **403 `CAPABILITY_DENIED`**，并读回没有新增会话和预占。
4. **无凭证**：`POST …/sessions` 不带 Authorization → 401 `PRINCIPAL_INVALID`。

## 6. 回滚

| 情况 | 操作 |
|---|---|
| 诊断结果或成本异常，需要暂停视觉诊断 | 首次激活**没有上一版**：`rollback` 会返回 `not_found / NO_PREVIOUS_VERSION`（退出码 3），不能靠回滚来停用。要停用可以二选一：(1) 在网关停用 `/api/v2/diagnosis/visual` 前缀；(2) 部署上一版 diagnosis 函数（不含视觉路由）。已有结果保留在库中；在途会话的预占按第 7 节处理 |
| 4/4 发布 v2 后需要退回 v1.3 | 回滚 `diagnosis/visual_generation` 到 v1.0.0。v1.3 提示词随包保留（按摘要取用），在途诊断按创建时锁定的摘要继续处理，不受影响 |
| 能力目录 v1.1.0 有误 | `rollback --domain subscription --policy capability_catalog --expect-current subscription-capability-catalog/v1.1.0 …`，指回旧目录 |
| 新代码需要回退 | 直接部署上一版 diagnosis 函数。旧代码不读 032 三张表和本次三个策略，可以保留不动。若有 `processing` 状态的会话，按第 7 节方法处理它们的预占 |
| 迁移 032 需要撤下 | 不在本清单内。先停视觉诊断路由，再由 DBA 另行批准删表；已写记录按不可变要求保留 |

## 7. 必须在云端验证的两项风险

### 风险 A：sharp 的 linux-x64 二进制能否在 CloudBase 加载

- 机制：图片压缩模块在**第一次处理图片时**才加载 sharp。加载失败时，该次诊断按「模型失败」释放，不扣点，接口其余部分不受影响。
- 验证：
  1. 完成第 5 节第 1 步后，确认会话是 `completed`，而且 `model_attempts_json` 非空。
  2. 确认云存储里存在压缩图 `diagnosis/{usr}/visual-normalized/{yyyyMM}/{vds}-1.jpg`：控制台可见，或用 `get-objects-download-info` 查询返回非空。
  3. 若会话是 `failed_no_charge / model_failed` 且 `model_attempts_json = []`，说明处理在调用模型之前就失败了。这时：
     - 压缩图不存在 → sharp 加载失败或上传失败，查函数日志 `visual_diagnosis_processing_failed` 与启动日志；
     - 压缩图存在 → 问题在模型调用一侧。
  4. 若确认 sharp 加载失败，先检查运行时的 glibc 版本（需要 2.26 或以上）与架构（需要 x86_64）。不行就改用 Layer（层名 `{name}_cloud1-2grufevs395a9d5e`，用户 2026-10-11 已许可）。

### 风险 B：返回 202 后实例被冻结，导致后台处理中断

- 机制：POST 在提交事务、返回 202 之后，用 `setImmediate` 在同一进程里继续处理（认领 → 压缩 → 模型 → 结算 → 写终态）。如果平台在响应结束后冻结实例，处理会停住。
- 验证：
  1. **不轮询测试**：发起一次诊断后不发任何后续请求，等 120 秒再执行：

```sql
SELECT status, processing_claimed_at_ms, completed_at_ms, created_at_ms
  FROM qinghuazhi_v2_test.diagnosis_visual_sessions WHERE visual_diagnosis_ref = '<vds>';
```

     - `completed_at_ms` 有值 → 响应后会继续执行，风险不成立。
     - `processing_claimed_at_ms IS NULL` → 返回后立即被冻结，处理没有开始。
     - 已认领但没有终态 → 处理中途被冻结。
  2. **对照测试**：再发起一次，并每 5 秒轮询 GET。如果只有轮询时能完成，说明实例只在有请求时运转。
  3. 两次都对照函数日志的时间线；必要时临时把日志级别调到 `debug`。
- 若风险成立，可选三个方向（需要另行裁决，本票未实现）：
  - (a) POST 在同一请求内同步处理完再返回。合同允许 POST 返回终态，但请求耗时会上到约 30–60 秒，网关超时需要相应放宽；
  - (b) 写入发件箱，由事件函数或定时任务处理；
  - (c) GET 请求时发现会话超过一定时长仍未认领，就补触发处理。
- 兜底现状：同一幂等键重试会重新调度处理，同一会话只认领一次。注意：**AI 额度预占的到期扫描（`createScanExpiredAiQuotaReservationsUseCase`）目前没有接到任何定时函数**。如果处理一直没完成，预占会停在 `reserved`、点数一直被冻结，需要人工按对账处理，或在后续票里把到期扫描接入低频补扫。

## 8. 首个发布版未覆盖的范围

- `diagnosis.visual.retake_limit` 仍为 pending，**不挡主流程**。首版不实现补拍链路，用户补拍就是一次新的诊断（新的预占和扣点），与 1/4 合同「补拍为新的一次调用」一致。限制补拍次数要等补拍链路上线时再冻结。
- 长期植物的诊断上下文摘要内部接口（user-plant）还没实现，当前全部按「未知」拼装。
- 最小反馈只完成了数据结构（032 中的 `diagnosis_visual_feedback`），没有公开路由。
- 严格模式（`json_schema_strict`）的输出 Schema 还没单独发布，策略里只能用 `json_object`。
