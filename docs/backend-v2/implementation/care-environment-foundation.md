# 养护原子环境事实底座

## 任务边界

本实施入口只服务 P4 `care` 与需要环境证据的 `diagnosis` 用例。它不冻结 VPD 曲线、浇水权重或基准周期数值；这些只能在配置目录对应项转为 `confirmed` 后进入实现。

## 必读入口

1. [养护环境合同](../contracts/care-environment-foundation.md)
2. [统一养护输出合同](../contracts/care-capability-output.md)
3. [P4 阶段入口](../phases/P4-care-diagnosis-agent.md)
4. [关键变量目录](../architecture/configuration-variable-catalog.md)中 `care.environment.*`
5. [care/diagnosis DDL](../schema/004_care_diagnosis.sql)

## 固定实施顺序

```text
原子证据 DTO 与来源/范围/单位校验
→ 只追加原子事实 Repository
→ 不可变输入快照及 SHA-256
→ 按派生类型的版本化纯计算
→ 只追加派生指标 Repository
→ 养护上下文组装
→ 浇水 / 施肥 / 光照 / 通风 / 诊断
→ care-capability-result/v1
```

## 不可越过的门禁

- `weather_adapter` 产生的观察只能使用 `outdoor`，不得改标为室内或植物周围实测。
- 输入快照生成后不得中途更换证据；新证据必须创建新快照。
- 原子事实、快照、派生指标和已生成的游客结果只能追加；Repository 无更新方法，MySQL 触发器拒绝 `UPDATE`。
- 长期快照必须同时归属 `user_id + user_plant_id`。游客结果只嵌入 `guest_plant_case_ref` 所属的同语义快照，不创建假用户植物。
- 诊断若使用环境证据，只能读取已锁定的快照与派生指标，不得直接绕过 `care` 读取天气或养护配置。

## 验收证据

- 合同与架构：`test/p2-care-environment-foundation.spec.ts`。
- DDL 静态门：`test/p1-total-ddl.spec.ts`。
- 真实数据库：MySQL 8.4 空库双次重建、有效写入、负向约束与拒绝 UPDATE；见 [审计报告](../audits/P2-care-environment-foundation-2026-09-20.md)。

## 明确未覆盖

本切片不证明 CloudBase MySQL 兼容性、Provider 真实响应、传感器准确性、养护算法效果、公开 HTTP 响应或端上行为。
