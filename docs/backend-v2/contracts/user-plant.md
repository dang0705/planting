# 用户植物合同

## 公开引用

`user_plant_id` 是不透明公开引用；内部 `BIGINT UNSIGNED` 主键只存在数据库和 Repository 层。

## 最低档案

首株档案奖励所需完整度由 `user-plant-profile/v1` 冻结，至少包含：

- 合法用户植物身份状态（允许暂未识别）。
- 盆器。
- 位置。
- 光照环境。
- 通风与空气环境。

## 归属

任何读写必须同时校验 `user_id + user_plant_id`。跨用户、跨主体、已删除植物一律拒绝。

## 生命周期

```text
active ↔ archived → deleting → deleted
```

删除后不能恢复或写入；历史以审计和必要的归档记录保留。

