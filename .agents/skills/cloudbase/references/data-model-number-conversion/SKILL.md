---
name: data-model-number-conversion
description: "CloudBase 数据模型与 MySQL 表同步时的数字、日期、布尔字段类型校对、迁移、写入和验收规则。"
version: 1.0.0
alwaysApply: false
metadata:
  priority: "high"
---

# CloudBase 数据模型数字转换与同步

本 skill 用于 CloudBase CMS 数据模型绑定 MySQL 表、模型发布、SQL 初始化和批量同步。它记录的是已经在真实模型和真实数据上验证过的类型边界，不能用“接口返回成功”替代模型页面和读回数据验收。

## 先确认两份事实

每次操作都先分别读取：

1. **模型 schema**：使用 `manageDataModel(action="get")` 或 `list`，确认模型字段的 `type`、`format`、是否必填和是否为模型当前暴露字段。
2. **物理表 schema**：使用 `queryMysqlDatabase(action="runQuery")` 查询 `INFORMATION_SCHEMA.COLUMNS`，至少读取 `DATA_TYPE`、`COLUMN_TYPE`、`IS_NULLABLE`、`COLUMN_DEFAULT`。

不要根据 CMS 页面标题、历史截图或字段名称猜类型。模型 schema 与物理表 schema 是两份独立事实；物理表改了也不会自动改变已有模型字段定义。

## 已验证的类型边界

### 日期时间

- CloudBase 模型中的 `type: "number", format: "datetime"` 要求行值是 **Unix epoch 毫秒数**，例如 `2026-09-16T04:12:25.000Z` 应写成 `1789531945000`。
- MySQL `DATETIME` / `TIMESTAMP` 是日期类型，不能把 ISO 字符串直接写入上述模型数字字段。否则 CMS 会报“字段格式有误，应为数字类型”。
- **禁止**直接执行 `ALTER TABLE ... MODIFY COLUMN old_datetime BIGINT`。真实验证表明，这样得到的是 `YYYYMMDDHHMMSS` 形式的日历数字（例如 `20260916041225`），不是 epoch 毫秒。
- `UNIX_TIMESTAMP(value)` 使用数据库会话时区。转换和回读必须在同一数据库时区内校验，不能让宿主机时区悄悄改变结果。

### 布尔/启用开关

- 当模型把 0/1 开关声明为数字字段时，MySQL `tinyint(1)` 可能被 CloudBase 识别成布尔类型并触发“数据异常”。已验证的处理是按模型契约改为 `TINYINT`（不带 `(1)`），保留原有可空性、默认值和 0/1 数据。
- 不要把所有 `tinyint(1)` 盲目改掉。只处理模型当前暴露且模型类型不匹配的字段；未绑定到该模型的字段保持不变，除非另有独立 schema 证据。

### BIGINT

- 模型可见的数字字段（包括 epoch 毫秒和模型使用的主键）使用有符号 `BIGINT` 更稳妥。
- `BIGINT UNSIGNED` 在模型发布/schema diff 中可能无法识别并导致发布异常。改类型前必须先检查最大值不超过有符号 `BIGINT` 上限，并保留主键与业务键。

### 文本容量

- 模型发布前检查预设文本字段的 **字节数**，不是字符数；单表预设文本字段总和不得超过 `65535` 字节。
- 使用 `OCTET_LENGTH` 统计真实值，发现超限、截断或字符集不一致时停止发布，不用放宽 schema 来掩盖问题。

## 安全迁移方式

只有在模型 schema 已明确要求数字日期、且物理表当前仍是日期类型时，才进行以下迁移：

1. 先做只读预检：统计源列的空值、非法值、最小/最大时间和主键范围。
2. 为每个日期列增加临时 `BIGINT` 列，例如 `_cms_updated_at_ms`；不要覆盖原列。
3. 用数据库表达式填充：

   ```sql
   UPDATE table_name
   SET _cms_updated_at_ms = UNIX_TIMESTAMP(updated_at) * 1000
   WHERE updated_at IS NOT NULL;
   ```

4. 读回校验：源值非空时临时列必须非空；用 `FROM_UNIXTIME(_cms_updated_at_ms / 1000)` 做同库 round-trip（往返）比较；差异不为零就停止。
5. 通过校验后，把原列改名为 `*_legacy`，再把临时列改成模型原字段名。保留 legacy 列，至少经过一次模型页面、单行读回和批量审计后再另行评估清理。
6. 失败时回退临时变更或按相反的重命名恢复，禁止直接删表、删模型或重建模型作为第一方案。

`DATETIME` 带有毫秒/微秒时，先明确目标 epoch 精度，再把允许的舍入误差写进校验条件；不能用“看起来接近”代替精确规则。

## MCP 操作边界

- `queryMysqlDatabase(action="runQuery")` 只做查询；`manageMysqlDatabase(action="runStatement")` 执行写入或 DDL。
- 一次 `runStatement` 只提交一条 SQL。`DELETE; INSERT` 这种多语句请求会被解析器拒绝，必须拆成独立调用，并在每次调用后读回。
- `success: true` 只表示 MCP 接受了语句；`rowsAffected: 0` 可能是幂等更新已经没有变化，不等于失败。必须核对关键字段的实际读回值。
- 当前 MCP 可以读写 MySQL 和读取/发布模型，但不能可靠地修改已有模型的字段类型。不要把物理 DDL 成功当成模型结构已更新；发布后还要重新读取模型 schema 并检查 CMS 页面。

## 写入程序的固定做法

- 写入前读取目标表的 `INFORMATION_SCHEMA.COLUMNS`，按真实 `DATA_TYPE` 做适配。
- 数字日期列把 `Date`/合法 ISO 日期转为 epoch 毫秒；日期列保留 `Date`/数据库日期值；`null` 和 `undefined` 不得被伪造为当前时间。
- 转换逻辑放在一个公共 helper 中，并用独立 Expected（外部契约定义的期望值）测试：至少覆盖 epoch 毫秒、ISO 字符串、原生 `Date`、日期类型保留和空值透传。
- 发布、导入、差异记录、回滚等所有写入入口都必须复用同一适配器，不能只修一次手工同步脚本。

## 最小验收门

顺序固定为：

1. 读模型 schema 和物理 schema，完成类型分类与容量预检。
2. 只同步一条真实记录，确认业务键、日期、0/1 开关和空值均正确。
3. 读回物理表，并重新打开 CMS 模型页面，确认真实行可见且没有“数据异常”。
4. 批量同步后核对成功数量、失败数量、字段来源、round-trip 差异和审计记录。

任何一个条件失败都标记为未验收并停止批量扩大：

- 模型 schema 与物理 schema 仍不匹配；
- 日期值不是 epoch 毫秒或往返校验有差异；
- 0/1 开关仍出现字段异常；
- CMS 页面没有发布、没有真实行或出现“数据异常”；
- 必填字段、业务键、文本字节上限或来源校验失败。

不要删除并重建模型来绕过类型问题。先保留原数据和 legacy 列，修复可审计的物理映射，再重复最小验收门。
