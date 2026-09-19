# P-1 遗留与事实来源审计

## 目标

在任何新 Schema、DTO 或业务实现前，建立旧代码、旧数据、CMS、Storage、外部供应商、测试和 OpenViking 的可审计处置清单。

## 负责人

- `audit_legacy_code_luna`
- `audit_data_cms_luna`
- `taxonomy_inventory_luna`
- `audit_external_sources_luna`
- `audit_storage_memory_luna`

## 退出条件

- 每项资产有处置决定、替代物、Expected 来源和删除前置条件。
- 内容资产不因测试数据身份被一刀切删除。
- 用户运行流水不被当作 v2 迁移源。
- 全部审计制品有 SHA-256 和读回证据。

