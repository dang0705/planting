
# CODEX_TASK_P1_IMPORT_AND_DIFF.md

## 1 目标

实现 **Excel → cloud1_dev → diff** 的最小闭环。

本阶段不涉及 publish 到 prod。

目标：

1. Excel 可导入 dev 数据库
2. dev 与 prod 可做行级 diff
3. diff 结果写入 publish_diffs

---

## 2 输入数据

Excel 真源：

plants_v13_user_friendly_full_v7.xlsx

字段必须与 Excel 完全一致。

禁止：

- 重命名字段
- 新建替代字段

---

## 3 新增模块

目录：

src/data-system/

结构：

data-system/
  importer/
    excel-importer.ts
  diff/
    diff-engine.ts
  db/
    mysql.ts
  utils/
    hash.ts

---

## 4 Excel importer

职责：

1. 读取 Excel
2. 根据 sheet 映射表
3. 字段标准化
4. 写入 cloud1_dev

库：

xlsx
mysql2
crypto

---

## 5 Upsert 写入

SQL：

INSERT ... ON DUPLICATE KEY UPDATE

业务唯一键：

- problems.problem_key
- symptoms.symptom_key
- symptom_problem_evidence (组合键)
- genus_problem_profiles (组合键)
- problem_host_profiles (组合键)
- plant_problem_profiles (组合键)
- problem_causality (组合键)

---

## 6 diff engine

比较：

cloud1_dev
vs
cloud1-2grufevs395a9d5e

输出：

added
updated
removed

---

## 7 diff 写入

写入表：

cloud1_dev.publish_diffs

字段：

batch_id
table_name
record_key
change_type
old_row_json
new_row_json
created_at

---

## 8 CLI

新增 CLI：

import-data
diff-data

示例：

npm run import-data
npm run diff-data

---

## 9 验收

成功标准：

1 Excel 数据可导入 dev
2 dev 与 prod 可生成 diff
3 diff 可写入 publish_diffs
