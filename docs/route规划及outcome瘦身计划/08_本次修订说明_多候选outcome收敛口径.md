# 本次修订说明：从单 outcome 路径改为多候选 outcome 收敛

## 一、修订原因

原文档包中部分表述容易被理解为：

```text
系统先选择一个 outcome，然后沿该 outcome 的路径推进，最后闭合该 outcome。
```

这个口径不符合当前最新设计。

最新设计应为：

```text
系统先形成多个候选 outcome，再通过 route group、route、gate 和问诊回答逐步增强、削弱、阻断，最终收窄到 1～3 个前端可见 outcome。
```

因此，本次修订把相关文档统一改为：

```text
多候选 outcome 收敛式路径规划
```

---

## 二、核心修订点

### 1. outcome 的角色修正

原先容易被理解为：

```text
outcome = 单个最终答案
```

现在修正为：

```text
outcome = 用户可理解的处理方向、问题簇、非问题判断或不确定方向。
outcome 在运行时可以同时存在多个候选。
```

一个诊断过程可以同时维护多个候选 outcome：

```text
积水/根系压力
缺水压力
光照不足
自然老叶代谢
不确定
```

问诊的作用不是服务某一个固定 outcome，而是把候选集合收窄。

---

### 2. route 的角色修正

原先容易被理解为：

```text
route = 到达某个唯一 outcome 的路径
```

现在修正为：

```text
route = 某个候选 outcome 的可达证据路径。
route group = 同一入口场景下的一组分流路径。
```

例如黄叶不是一个最终处理方向，而是一个 route group：

```text
黄叶养护分流组
  ├─ 积水/根系压力
  ├─ 缺水压力
  ├─ 光照不足/生长偏弱
  ├─ 自然老叶代谢
  └─ 不确定
```

---

### 3. gate 的角色修正

gate 不只判断“能不能闭合”，还要判断：

```text
是否增强某个候选 outcome
是否削弱某个候选 outcome
是否阻断某个候选 outcome
是否允许前端展示
是否允许作为主方向
是否允许作为伴随观察方向
多个可见 outcome 的行动建议是否冲突
```

因此需要补充：

```text
display_gate
action_safety_gate
split_gate
```

---

### 4. 前端可见结果修正

原先容易被理解为：

```text
前端只展示一个 outcome。
```

现在修正为：

```text
前端可以展示 1～3 个 outcome。
```

推荐结构：

```text
主方向：0～1 个
伴随观察方向：0～2 个
不确定可排查方向：必要时 1～3 个
```

但必须遵守：

```text
公开行动建议不得互相冲突。
```

例如不能同时给出：

```text
马上浇透水
同时停止浇水 7 天
```

若缺水和积水方向同时存在且无法分清，应输出不确定 + 保守检查建议。

---

## 三、已修正文档

本次已修正以下文档中的单 outcome 口径：

| 文档 | 修订内容 |
|---|---|
| `00_总览_阅读顺序.md` | 总方案改为多候选 outcome 收敛，前端可见 1～3 个方向。 |
| `01_当前ranking诊断流代码盘点.md` | route 接入点从 `lockedOutcome` 改为 `visibleOutcomes`、`primaryOutcome`、`secondaryOutcomes`。 |
| `02_ranking到route改造计划_文件方法变量级.md` | 方法、变量、stopDecision、result-formatter 改为多候选集合与前端可见结果。 |
| `03_outcome路径规划设计_概念数据与运行时.md` | 全文重写为多候选 outcome 收敛式路径规划。 |
| `04_主动瘦身计划_养护类问题主轴.md` | 瘦身目标增加“问题服务候选收窄，而不是服务最高 outcome”。 |
| `05_数据表与导入改造方案.md` | 新增 `outcome_route_groups`，补充 `allow_as_primary`、`allow_as_secondary`、`action_conflict_group`。 |
| `06_视觉prompt与前端契约改造.md` | 禁止 LLM 输出主 outcome 或可见候选 outcome，前端契约改为 primary/secondary/visible。 |
| `07_Codex实施任务包_验收清单与风险.md` | Codex 任务从 `lockedOutcome` 改为多候选收敛和 visible outcome 输出。 |

---

## 四、给后续实施的硬约束

1. 不得把 route 模式实现成“第一轮选择一个 outcome，然后围绕它问到底”。
2. 必须维护候选 outcome 集合。
3. 同一入口症状允许打开多个候选 outcome。
4. 下一题必须优先服务候选收窄，尤其是区分相反处理动作。
5. 前端可见 outcome 最多 1～3 个。
6. 主方向最多 1 个，伴随观察方向最多 2 个。
7. 多个可见 outcome 的行动建议不得互相冲突。
8. LLM 不得输出主 outcome 或前端可见候选 outcome。
9. ranking 只能辅助候选排序和审计，不得直接决定公开结果。
10. 不确定结果可以展示通过 gate 的可排查方向，但不得泄漏内部最高 ranking。
