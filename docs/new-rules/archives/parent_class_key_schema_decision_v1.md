# parent_class_key schema 决策说明（v1）

## 结论

当前 v1 中：

```text
parent_class_key 作为 taxonomy label 落库，
不做 FK（外键）。
```

## 原因

当前这些值：

- `biotic_disease_mode`
- `abiotic_stress_mode`
- `bridge_mode`
- `fallback_mode`
- `normalization_mode`
- `biotic_pest_mode`
- `abiotic_biotic_bridge_mode`
- `abiotic_bridge_mode`

更像分类标签 / 语义分桶，而不是 `symptom_classes` 中已存在的真实父级 row。

## v1 实施规则

- `parent_class_key` 允许为空
- `parent_class_key` 允许引用不在 `symptom_classes.class_key` 中的 taxonomy label
- repository 和 runtime 不应依赖它做 join
- 它只用于：
  - 分类展示
  - 人工 review
  - 后续版本整理

## 后续

如果未来要把“父类”做成正式实体，再单独设计父层级表；
在那之前，`parent_class_key` 不做 FK。
