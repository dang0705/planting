
# CODEX_TASK_P4_SCHEMA_VALIDATOR.md

## 1 目标

实现 schema validator。

用于防止：

Excel schema
DB schema
代码 schema

产生漂移。

---

## 2 输入

Excel schema
数据库 schema
代码字段引用

---

## 3 校验规则

1 Excel 字段必须存在 DB
2 DB 字段必须存在 Excel
3 repository 查询字段必须存在 DB

---

## 4 输出

生成报告：

schema-diff-report.json

---

## 5 CLI

validate-schema

---

## 6 验收

1 任意字段漂移会报错
2 CI 可运行 validator
