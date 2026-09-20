# P2 养护原子环境事实底座审计

- 结论：`LOCAL_ARCHITECTURE_AND_MYSQL_PASS`。
- 证据边界：两套架构、Canonical Master Plan、冻结合同、配置目录、DDL 与本机 MySQL 8.4.11；不是 CloudBase 或算法效果验收。

## 架构闭环

`care` 是原子环境事实、输入快照与派生环境指标的唯一负责域。浇水、施肥、光照、通风和需要环境证据的诊断不再直接读取多个可变来源，固定经过：

```text
原子环境事实 → 不可变输入快照 → 版本化派生环境指标 → 养护上下文 → 建议
```

业务图中 `CareContext --> Diagnosis` 和 `Weather --> Diagnosis` 旁路已移除；诊断若需环境证据，只能使用已锁定快照及派生引用。

## 关键决策

- 天气快照是可被多株植物引用的全局外部证据；每株植物以自己的原子观察引用该快照，因此来源去重键包含用户与用户植物归属。
- 游客不创建长期环境三表，而是在 `temporary_care_results` 中内联保存同语义输入、算法、派生和结果哈希。认领不改写原结果。
- 不可变性由 Repository 只追加合同与 MySQL `BEFORE UPDATE` 拒绝触发器双重保证，不依赖调用方自觉。
- VPD 是派生环境指标，不是在旧温湿度分桶上追加的重复权重。MVP 不采用 FAO Penman–Monteith 直接决定家庭盆栽浇水。

## 真实 MySQL 结果

| 检查 | 结果 |
|---|---:|
| 空库双次重建 | 通过 |
| 表 | 90 |
| 外键 | 107 |
| CHECK | 137 |
| UNIQUE | 146 |
| 不可变触发器 | 4 |
| 两库结构 SHA-256 | `4bce86b3082ab46426d50c8ac1fd9ef428b2a2ed3e855ffa5d9d95e3ddca52c4` |

有效写入、室内外范围拒绝、同源天气多植物引用、游客哈希校验和四类 UPDATE 拒绝的可回放摘要见 [GREEN 证据](evidence/P2-care-environment-foundation-green-2026-09-20.txt)。

## 未验收

- CloudBase MySQL 真实环境兼容性和权限。
- 和风天气、盆土视觉或室内传感器的真实数据读回。
- 各派生算法 release、标准参考环境、证据新鲜度和修正上下限；它们保持 `P1_PENDING`，不得猜测默认值。
- 公开 HTTP、端上或实际植物养护效果。
