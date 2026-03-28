# DATA_PUBLISHING_SYSTEM_SPEC_v2.md

## 1. 文档目的

本文档定义植物诊断系统的数据发布机制。  
本版与当前真实项目约束保持一致：

- 后端目前只有一个运行环境
- 数据库有两个 schema：
  - `cloud1_dev`
  - `cloud1-2grufevs395a9d5e`
- 诊断系统仍在使用现有 repository 代码
- 因此发布系统必须是**非侵入式增量接入**，不能先打碎诊断流

---

## 2. 当前架构前提

### 2.1 数据流

```text
Excel / AI补数
        ↓
cloud1_dev
        ↓
diff / review
        ↓
publish
        ↓
cloud1-2grufevs395a9d5e
```

### 2.2 诊断流

```text
diagnose-http
        ↓
repositories
        ↓
读取选定 schema 的表
```

### 2.3 当前阶段原则

当前阶段优先级是：

1. 不破坏现有诊断流
2. 让 Excel 更新可控
3. 让 dev/prod 可比较
4. 再逐步增加 row_hash / publish / rollback

---

## 3. 第一版发布系统目标

第一版只要求实现以下能力：

1. Excel 导入到 `cloud1_dev`
2. 与 prod 做行级 diff
3. 输出可审查的 diff 结果
4. 支持把已批准变更发布到 prod
5. 支持按 batch 粗粒度回滚

第一版暂不要求：

- 完整后台 UI
- 复杂权限系统
- 所有表都支持字段级 merge
- 一次性重构所有 repository

---

## 4. 导入范围

第一版导入/发布系统必须覆盖以下表：

1. `problems`
2. `symptoms`
3. `symptom_problem_evidence`
4. `genus_problem_profiles`
5. `problem_host_profiles`
6. `plant_problem_profiles`
7. `problem_causality`
8. `question_library_v5_real`
9. `question_option_mapping_v5_real`
10. `question_strategy_v5_real`
11. `question_generation_engine`
12. `diagnosis_result_explanations`

注意：

- 这 12 张表必须和 Excel 字段完全对齐
- 字段名必须按 Excel 原名落库

---

## 5. 导入规范

### 5.1 Import Job

每次导入必须生成唯一 `batch_id`。

格式建议：

```text
batch_YYYYMMDD_NNN
```

示例：

```text
batch_20260328_001
```

导入记录写入：

- `cloud1_dev.import_jobs`

### 5.2 导入步骤

1. 读取 workbook
2. 按 sheet 分发到对应 importer
3. 字段映射（Excel 列名直接映射 DB 列名）
4. 标准化
5. 生成 `row_hash`（如果当前表已支持）
6. upsert 到 `cloud1_dev`

---

## 6. 字段标准化规则

### 6.1 通用规则

- trim 字符串
- 空字符串转 `NULL`
- JSON 字段必须是合法 JSON
- 数字字段转 number
- 布尔/枚举字段按当前 Excel 真实值保留，不在 importer 中擅自改名

### 6.2 关键约束

以下字段不得在 importer 中擅自改名：

- `problem_name`
- `problem_cn`
- `genus_compatibility`
- `host_compatibility`
- `plant_id`
- `final_prior_score`
- `relation_strength`

---

## 7. row_hash 策略

### 7.1 当前建议

row_hash 是发布系统推荐能力，但第一版必须采取**兼容式接入**。

也就是说：

- 如果表已补充 `row_hash` 字段，则使用 `row_hash`
- 如果表尚未补充 `row_hash`，则允许用“业务字段拼接比较”替代

### 7.2 目的

避免一开始就为了推 row_hash 而改坏现有诊断表结构。

### 7.3 row_hash 算法

- `SHA256`
- 只包含业务字段
- 不包含：
  - `source_batch_id`
  - `version_tag`
  - `review_status`
  - `published_batch_id`
  - 时间戳字段

---

## 8. dev 写入策略

导入到 `cloud1_dev` 时使用：

```sql
INSERT ... ON DUPLICATE KEY UPDATE
```

规则：

- 不存在 → 插入
- 存在 → 更新业务字段
- 如启用 `row_hash`，同时更新 `row_hash`

业务唯一键按表分别定义：

- `problems.problem_key`
- `symptoms.symptom_key`
- `symptom_problem_evidence` 组合键
- `genus_problem_profiles` 组合键
- `problem_host_profiles` 组合键
- `plant_problem_profiles` 组合键
- `problem_causality` 组合键
- `question_library_v5_real.question_key`
- `question_option_mapping_v5_real` 组合键
- `question_strategy_v5_real` 组合键
- `question_generation_engine.engine_rule_key`
- `diagnosis_result_explanations.problem_key`

---

## 9. diff engine

### 9.1 当前项目中的 diff 重新定义

当前项目已有 `data-diff-builder.js`，但它是：

- 列对齐检查
- schema/字段完整性辅助

它**不是**发布系统的 diff engine。

本规范中的 diff engine 指的是：

```text
cloud1_dev 数据
vs
cloud1-2grufevs395a9d5e 数据
```

的行级比较引擎。

### 9.2 diff 类型

- `added`
- `updated`
- `removed`

### 9.3 diff 逻辑

#### added

dev 有，prod 没有

#### updated

dev 和 prod 业务键相同，但业务字段不同

#### removed

prod 有，dev 没有

### 9.4 SQL 规则

第一版允许：

- 使用 `row_hash` 比较
- 或使用“拼接业务字段比较”

但输出结果必须统一写入：

- `cloud1_dev.publish_diffs`

---

## 10. review 机制

### 10.1 审核状态

默认：

- `pending`

审核后：

- `approved`
- `rejected`

### 10.2 原则

- 只有 `approved` 的 diff 才能发布
- `removed` 必须谨慎处理
- 第一版默认不做物理删除

---

## 11. publish engine

### 11.1 发布方向

只允许：

```text
cloud1_dev → cloud1-2grufevs395a9d5e
```

### 11.2 发布策略

#### added

插入 prod

#### updated

按业务唯一键更新 prod

#### removed

默认不删除，执行：

```text
is_active = 0
```

如果当前表暂时没有 `is_active`：

- 第一版允许只记录 removed diff，不立刻 publish 删除
- 等表完成软删除字段补齐后再启用

### 11.3 当前阶段的现实约束

由于现有诊断流仍在直接读 prod 表，因此 publish engine 必须满足：

- 不能破坏当前字段名
- 不能改变当前 repository 已依赖字段
- 不能在 publish 时引入新命名

---

## 12. rollback engine

### 12.1 回滚粒度

以 `publish_batch` 为粒度

### 12.2 回滚数据来源

- `publish_diffs.old_row_json`

### 12.3 回滚逻辑

#### added

失效或删除（第一版优先失效）

#### updated

恢复 old_row

#### removed

恢复 `is_active = 1`

如果表尚无 `is_active`，则第一版先标记人工处理

---

## 13. schema 路由与诊断系统兼容

### 13.1 必须补一个统一 schema 选择层

当前 repository SQL 多为：

```sql
SELECT * FROM problems
```

这与双 schema 架构不兼容。

必须新增统一能力：

- schema resolver
- qualified table helper

### 13.2 开发期策略

开发期允许：

- 前端通过编译环境或请求头透传 env
- 后端根据 env 选择 dev/prod schema

### 13.3 生产期策略

生产后端必须强制读 prod schema，不能信任前端透传 env。

---

## 14. 推荐模块结构

```text
src/
  data-system/
    importer/
      excel-importer.ts
    diff/
      diff-engine.ts
    publish/
      publish-engine.ts
    rollback/
      rollback-engine.ts
    review/
      review-engine.ts
    db/
      mysql.ts
      schema-resolver.ts
      table-helper.ts
    utils/
      hash.ts
      compare-row.ts
```

---

## 15. CLI 命令

建议 CLI：

- `import-data`
- `diff-data`
- `review-data`
- `publish-data`
- `rollback-data`

---

## 16. Codex 执行重点

Codex 必须按以下顺序实现：

1. 先保证表字段与 Excel 一致
2. 再补 schema 选择层
3. 再实现 dev importer
4. 再实现行级 diff engine
5. 再实现 publish
6. 最后实现 rollback

禁止顺序：

- 先强改表字段名
- 先假设 row_hash 已全部存在
- 先按旧 spec 重命名数据库字段

---

## 17. 最终原则

一句话：

```text
发布系统必须适配当前诊断流，而不是先打碎当前诊断流再重建。
```
