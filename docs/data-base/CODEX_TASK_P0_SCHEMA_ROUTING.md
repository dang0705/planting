
# CODEX_TASK_P0_SCHEMA_ROUTING.md

## 1. 任务目标

为现有 `diagnose-http` 服务增加 **schema 路由层**，使系统能够根据环境选择：

- `cloud1_dev`
- `cloud1-2grufevs395a9d5e`

同时保证：

- 不破坏现有诊断逻辑
- 不修改字段名
- 不改变 repository 返回结构

本任务 **只实现 schema routing**，不实现 importer / diff / publish / rollback。

---

# 2. 当前问题

当前 repository SQL 使用裸表名，例如：

```sql
SELECT * FROM problems
```

文件示例：

- cloudfunctions/diagnose-http/repositories/problem-repository.js
- cloudfunctions/diagnose-http/repositories/symptom-repository.js
- cloudfunctions/diagnose-http/repositories/question-repository.js

这会导致：

- 无法区分 dev / prod 数据库
- 无法支持数据发布流程

---

# 3. 实现目标

所有 repository SQL 必须改为：

```sql
SELECT * FROM ${schema}.problems
```

schema 由统一 resolver 决定。

---

# 4. 新增模块

新增目录：

```
cloudfunctions/diagnose-http/db/
```

新增文件：

```
schema-resolver.js
table-helper.js
```

---

# 5. schema-resolver.js

职责：

根据运行环境返回 schema 名称。

示例实现：

```javascript
function resolveSchema(env) {

  const PROD_SCHEMA = "cloud1-2grufevs395a9d5e"
  const DEV_SCHEMA = "cloud1_dev"

  if (process.env.NODE_ENV === "production") {
    return PROD_SCHEMA
  }

  if (env === "prod") {
    return PROD_SCHEMA
  }

  return DEV_SCHEMA
}

module.exports = { resolveSchema }
```

---

# 6. table-helper.js

职责：

统一生成带 schema 的表名。

示例：

```javascript
const { resolveSchema } = require("./schema-resolver")

function table(env, name) {

  const schema = resolveSchema(env)

  return `${schema}.${name}`
}

module.exports = { table }
```

---

# 7. repository 改造规则

所有 repository 必须改为使用 table helper。

### 原代码

```javascript
const sql = `
SELECT *
FROM problems
WHERE problem_key = ?
`
```

### 修改后

```javascript
const { table } = require("../db/table-helper")

const sql = `
SELECT *
FROM ${table(env, "problems")}
WHERE problem_key = ?
`
```

---

# 8. 修改范围

必须修改以下 repository：

- problem-repository.js
- symptom-repository.js
- prior-repository.js
- causality-repository.js
- question-repository.js

禁止修改：

- SQL 查询字段
- 返回对象结构
- 业务逻辑

---

# 9. env 来源

env 可以来自：

- HTTP header `x-env`
- 或函数参数

示例：

```javascript
const env = event.headers["x-env"]
```

---

# 10. 生产环境限制

生产环境必须强制使用：

```
cloud1-2grufevs395a9d5e
```

即使前端传入：

```
x-env: dev
```

也必须忽略。

---

# 11. 验收标准

完成后必须满足：

1. repository SQL 不再出现裸表名
2. 所有表通过 `${schema}.table` 访问
3. dev 环境可读 `cloud1_dev`
4. prod 环境强制 `cloud1-2grufevs395a9d5e`
5. 现有诊断 API 输出完全不变

---

# 12. 禁止事项

本任务 **禁止实现**：

- Excel importer
- diff engine
- publish engine
- rollback engine

这些属于后续任务。

---

# 13. 完成标志

完成以下条件即认为 P0 成功：

- diagnose-http 可在 dev schema 正常运行
- diagnose-http 可在 prod schema 正常运行
- SQL 已全部使用 schema resolver
