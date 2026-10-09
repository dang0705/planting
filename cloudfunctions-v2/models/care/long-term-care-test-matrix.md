# 长期植物养护测试矩阵 `long-term-care/v1`

- Expected 来源：`long-term-care-contract.md`（2026-10-09 冻结；用户裁决 U1–U9、主代理裁决 T1–T8）；`mvp-watering-policy-contract.md` §3a；mvp 矩阵 I1（水量 40～300 mL）；`watering-decision-model.md` §7（只有实际浇水事实重置进度）。
- TDD：Classic。分两批交付：第一批「合同 + DDL + 模型 v2」，第二批 HTTP。

## 第一批：DDL 与模型 v2（已实现）

| ID | 场景 | Expected | 层 | 文件 |
|---|---|---|---|---|
| M1 | manifest 依次登记 025/026/027，owner care/user-plant/care | — | unit_real_data | `test/care/long-term-care-migrations.spec.ts` |
| M2 | 025 列、唯一键、复合归属外键、可空唯一 proposal 链接、拒绝 UPDATE 触发器；无 ALTER/TIMESTAMP | §10 | unit_real_data | 同上 |
| M3 | 026 绑定表只追加、目录引用 512、最新索引 | §1、§10 | unit_real_data | 同上 |
| M4 | 027 只给 care_facts 加拒绝 UPDATE 触发器，不拦 DELETE | §10 | unit_real_data | 同上 |
| M5 | 全量 manifest 真实建库；025/026 UPDATE 被拒；他人植物外键被拒；care_facts UPDATE 被拒、DELETE 允许 | §10 | unit_real_data（MySQL） | `test/e2e/long-term-care-schema.mysql.spec.ts` |
| M6 | total-ddl 登记新表（追加 Expected） | §10 | unit_real_data | `test/p1-total-ddl.spec.ts` |
| V1 | v2 制品 = v1 去掉固定 TTL、换回退 24/封顶 72、合同版本 v2 | U6 | unit_real_data | `test/configuration/mvp-watering-policy-v2.spec.ts` |
| V2 | v2 可解析；v1 仍可解析；v2 混入 TTL / 缺封顶 / 封顶<回退 / 回退非正、v1 混入 v2 字段 → invalid | U6 | unit_fake | 同上 |
| V3 | 有效期：湿 48h、微湿 42h（手算）；慢速封顶 72h；无/不连续时段回退 24h；干无后续浇水 72h；观察后浇水 → 到浇水时刻；观察前浇水不影响；仅表土干同「干」；v1 固定 24h | §8 | unit_fake | `test/care/watering/mvp-soil-evidence-validity.spec.ts` |
| V4 | 组合用例：v2 根区干 30h 前 → 仍可浇水 40～300；80h 前 → 不可；之后浇过水 → 不可；v1 30h 前 → 不可（兼容） | §8、I1 | unit_fake | `test/care/watering/assess-mvp-watering-v2.spec.ts` |
| V5 | 读取器接受 v2；Schema 版本与正文合同版本不一致 → invalid | U6 | unit_fake | `test/care/mysql-mvp-watering-policy-reader.spec.ts` |

## 第二批：HTTP（待实现）

品种绑定 PUT；长期浇水建议（结果 + 建议同事务、提交字段拒绝、无绑定缺证据、归档 409、建议有效期 U7）；记录浇水（7 天补记、只 watering、不可改）；摘要；计划列表（默认 20、上限 50、游标）；确认建议（三选一、窗口/7 天推迟、只能一次、过期 409）；完成计划（版本冲突、done/skipped、附浇水/盆土）；日历字段；脱敏；幂等重放/冲突；MySQL 端到端。

## 未覆盖

真实 Open-Meteo 网络、CloudBase 部署、测试库发布（由主代理执行）；状态跨度口径的用户确认（见交付报告）。
