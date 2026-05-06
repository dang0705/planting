
# CODEX_TASK_P2_PUBLISH_ENGINE.md

## 1 目标

实现 **dev → prod 数据发布**。

输入：

publish_diffs

输出：

prod 数据更新

---

## 2 发布规则

仅允许：

cloud1_dev → cloud1-2grufevs395a9d5e

---

## 3 发布类型

added
updated
removed

---

## 4 added

SQL：

INSERT INTO prod
SELECT FROM dev

条件：

prod 不存在

---

## 5 updated

SQL：

INSERT ... ON DUPLICATE KEY UPDATE

更新字段：

业务字段
row_hash
updated_at

---

## 6 removed

默认不物理删除。

执行：

UPDATE prod
SET is_active = 0

---

## 7 发布批次

新增表：

publish_batches

字段：

batch_id
version_tag
status
created_at
published_at

---

## 8 CLI

新增命令：

publish-data

---

## 9 验收

1 approved diff 可发布
2 prod 数据正确更新
3 publish_batches 记录生成
