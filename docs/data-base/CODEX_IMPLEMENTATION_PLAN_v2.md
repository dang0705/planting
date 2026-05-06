# CODEX_IMPLEMENTATION_PLAN_v2.md

## 1. 目标

实现与当前项目兼容的数据层改造，目标包括：

1. 校正数据库 spec，使其与 Excel 完全一致
2. 为现有 repository 补充 schema 选择能力
3. 实现 Excel → dev → diff → publish → prod 发布链路
4. 不破坏当前诊断系统运行

---

## 2. 当前前提

### 2.1 数据库结构

```text
MySQL
 ├── cloud1-2grufevs395a9d5e   (prod)
 └── cloud1_dev                (dev)
```

### 2.2 Excel 真源

字段真源：

- `plants_v13_user_friendly_full_v7.xlsx`

### 2.3 当前诊断仍依赖的表

必须继续可用：

- `problems`
- `symptoms`
- `symptom_problem_evidence`
- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`
- `problem_causality`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`
- `diagnosis_result_explanations`

---

## 3. 执行顺序（强约束）

### Step 1：校正 spec 与 Excel 一致

先完成：

- 校验 `DATABASE_SCHEMA_SPEC_v2.md`
- 校验字段名与 Excel 完全一致
- 禁止按旧 spec 创建错误字段名

输出：

- 最终 DDL 草案

---

### Step 2：补全 schema 选择层

新增：

- `schema-resolver`
- `table-helper`

目标：

- repository 层可以按环境读取：
  - `cloud1_dev`
  - `cloud1-2grufevs395a9d5e`

但：

- 生产环境必须强制 prod schema

---

### Step 3：最小侵入改造 repository

在不改变业务输出结构的前提下：

- 把裸表名 SQL 改成 `${schema}.table`
- 保持现有字段读取不变

禁止：

- 顺手改字段名
- 顺手改返回结构

---

### Step 4：创建/补齐表结构

按 Excel 字段真源创建或迁移以下表：

- `problems`
- `symptoms`
- `symptom_problem_evidence`
- `genus_problem_profiles`
- `problem_host_profiles`
- `plant_problem_profiles`
- `problem_causality`
- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_strategy_v5_real`
- `question_generation_engine`
- `diagnosis_result_explanations`

同时在 `cloud1_dev` 创建控制表：

- `import_jobs`
- `publish_batches`
- `publish_diffs`
- `review_logs`

---

### Step 5：实现 Excel importer

实现：

- workbook 读取
- sheet 分发
- 字段标准化
- upsert 写入 `cloud1_dev`

要求：

- Excel 列名直接映射数据库字段名
- 不做“美化式重命名”

---

### Step 6：实现 diff engine

要求：

- 比较 `cloud1_dev` 与 prod
- 输出 `added / updated / removed`
- 写入 `publish_diffs`

第一版允许：

- 无 row_hash 时使用字段比较
- 有 row_hash 时优先使用 row_hash

---

### Step 7：实现 review engine

最小版即可：

- `pending`
- `approved`
- `rejected`

---

### Step 8：实现 publish engine

要求：

- 只允许 `dev → prod`
- `approved` diff 才能发布
- 删除默认软删除
- 若表尚未补 `is_active`，先只记录 removed，不直接物理删

---

### Step 9：实现 rollback engine

基于：

- `publish_diffs.old_row_json`

至少支持：

- batch 级回滚

---

## 4. 推荐目录结构

```text
src/
  data-system/
    importer/
      excel-importer.ts
    diff/
      diff-engine.ts
    review/
      review-engine.ts
    publish/
      publish-engine.ts
    rollback/
      rollback-engine.ts
    db/
      mysql.ts
      schema-resolver.ts
      table-helper.ts
    utils/
      hash.ts
      compare-row.ts
  cli.ts
```

---

## 5. 第一版 CLI 命令

- `import-data`
- `diff-data`
- `review-data`
- `publish-data`
- `rollback-data`

---

## 6. 关键禁令

Codex 不得：

1. 按旧 spec 重命名数据库字段
2. 忽略问诊与解释表
3. 假设 repository 已经有 schema 选择层
4. 把现有 `data-diff-builder.js` 当成发布 diff engine
5. 为了推新 schema 先破坏当前诊断流

---

## 7. 成功标准

完成后应满足：

1. 数据库字段与 Excel 完全一致
2. 现有诊断流仍可运行
3. repository 可按环境读 dev/prod schema
4. Excel 可导入 cloud1_dev
5. dev/prod 可做行级 diff
6. 已审核 diff 可发布到 prod
7. 发布结果可回滚

---

## 8. 一句话原则

```text
先对齐 Excel 真源，再做兼容式增量改造，不要为了“更规范命名”破坏现有诊断系统。
```
