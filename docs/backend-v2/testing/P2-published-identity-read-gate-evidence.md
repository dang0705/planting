# P2 植物身份公开读取准入证据

对应票据：[CMS 分类、百科和发布](https://app.clickup.com/t/z8v0kmr971)。本切片只完成已发布身份的 Repository 只读准入，不声称完成 CMS 发布事务或分类人工裁决。

## 独立 Expected

来源：`contracts/plant-taxonomy.md` 的「用户确认只能选择已经发布且未隔离的产品身份」「公开读取只经不可变 active release」，以及 P2 票据的「未发布/隔离身份不得进入 catalog/identify 查询」。

给定一个产品身份：只有该身份及其主要分类实体均为 `ACTIVE`，且当前生效的 `identity` 发布明细包含该身份、当前生效的 `taxonomy` 发布明细包含对应分类实体，才返回 `true`。表状态、发布头或指针各自单独存在均不充分；未知及非法引用只能返回 `false`。

## 测试路径与覆盖

- 层次：L3 / `unit_real_data`。
- 真实路径：`createMysqlPublishedIdentityRepository().isPublishedIdentity` → 参数化 SQL → 独立 MySQL 8.4 容器 → `schema/manifest.json` 全部正式 DDL。
- 替代边界：只替代连接管理的最小 SQL 执行端口；没有替代 Repository 查询、MySQL 约束或发布指针表。
- 未覆盖：分类来源证据真实性、人工裁决、正式发布事务、CMS、CloudBase MySQL、HTTP 鉴权、前端消费和真实数据激活。测试中的 `ACTIVE` 与 release 均为隔离夹具，不代表 P1 taxonomy 发布门已解除。

| 维度 | 用例 / 结果 | 依据 |
| --- | --- | --- |
| I1 协作链正常路径 | 两类指针与对应明细均存在时返回 `true` | 植物分类与身份合同 |
| I2 空集合 | 没有 active 指针、只有 taxonomy 指针均返回 `false` | 同合同的双发布准入 |
| I3 错误语义 | 未知/非法公开引用返回 `false`，参数化 SQL 不扩权 | 未发布身份不得进入公开读取 |
| I4 鉴权 | N/A：本对象只判断知识发布资格，不接受用户主体；业务 HTTP 鉴权另测 | Repository 职责边界 |
| I5 写中断 | N/A：该查询不写库；发布事务另测 | Repository 职责边界 |
| 反向准入 | 生效指针的明细只含其他身份、分类随后隔离时返回 `false` | 隔离身份不可确认 |

## RED / GREEN / 反写

- Test First：先新增真实 MySQL 用例，再创建 Repository；初次运行因入口未实现而无法加载。
- 行为 RED：Repository 临时返回 `false` 时，6 个中的正常路径用例失败：`expected false to be true`；其余拒绝路径通过。
- GREEN：参数化双发布明细关联实现后，6/6 通过。
- 执行反写：临时把身份发布明细的 `JOIN` 改成 `LEFT JOIN`，只运行“身份指针生效但明细只含其他身份”用例，实际失败为 `expected true to be false`；随后改回 `JOIN`。恢复前后源码 SHA-256 均为 `5147ff41fb7ecd362736552b22c56577701058f99a7b2e27b7a74d0ac33b15a6`；恢复后 6/6 再通过。

## 真实性卡

| Break | Expected | Real path | Mutation |
| --- | --- | --- | --- |
| 用 `ACTIVE` 表状态或仅发布指针放行未发布身份 | 两类 active 发布都必须含对象明细 | Repository SQL → mysql2 → 真实 MySQL 8.4 | 把身份明细强关联改成左关联，反向用例实际变红 |
| 把已隔离分类实体继续作为可确认身份 | 隔离后返回 `false` | 同上，真实更新分类状态再查询 | 去掉分类 `review_status` 条件将使隔离用例变红 |

本轮产品改动：仅修 A 或授权改产品（「分类与身份发布均生效且都含该对象时可以确认」）。
