# 症状模式剩余 block 收口说明（v3）

本次只做 3 个明确收口动作，目标是把剩余的“设计未定 block”在进入 Codex 前清掉。

## 已完成

### 1. 收紧 context_only 伪症状
已将以下条目统一改为：

- `primary_class_lock_allowed_v1 = False`

涉及：

- `low_light_context`
- `recent_direct_sun_increase`
- `watering_deficit_background`
- `watering_excess_background`

这意味着：
- 可用于 question / context / explanation
- 不可锁定 `primaryClass`
- 不可留下“背景事实能否锁主模式”的歧义

### 2. 降级未验证题组资产
已将以下 group 先降级为不可运行：

- `leaf_spot_texture_group`
- `leaf_surface_residue_group`

处理方式：

- `effective_runtime_v1 = False`
- `runtime_block_reason = asset_not_verified`
- `asset_status = missing_or_unverified`

这样 Codex 后续只需去做“资产存在性核查”，而不会在接线时继续吃到自相矛盾的数据。

### 3. 明确 `parent_class_key` 的 schema 决策
已单独生成说明文档，正式定稿为：

```text
v1 中 parent_class_key 作为 taxonomy label 落库，不做 FK。
```

## 一句话结论

```text
这 3 个收口动作完成后，
剩下的就基本是 Codex 的工程实现工作，
不再是设计未定 block。
```
