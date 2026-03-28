
# CODEX_TASK_P3_ROLLBACK_ENGINE.md

## 1 目标

实现 **发布回滚能力**。

基于：

publish_diffs.old_row_json

---

## 2 回滚粒度

batch_id

---

## 3 回滚逻辑

added

→ 失效或删除

updated

→ 恢复 old_row_json

removed

→ is_active = 1

---

## 4 CLI

rollback-data

示例：

npm run rollback-data --batch=xxxx

---

## 5 验收

1 指定 batch 可回滚
2 prod 数据恢复
3 rollback 记录生成
