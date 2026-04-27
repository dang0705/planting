# 症状模式（symptom_class）更新专项 Review

## 结论

对这次写入的两份文档：

- `AI_DIAGNOSIS_MASTER_SPEC_v2.md`
- `AI_DIAGNOSIS_CODEX_MINIMAL_EXEC_SUMMARY_v2.md`

我的高规格 review 结论是：

```text
方向正确，而且必须保留；
但当前文档仍有 8 个会影响 Diagnose-process 稳定落地的缺口，
如果不补，Codex 很容易把 symptom_class 做成“概念存在、运行时失效”的半成品。
```

---

## 一、已成立的部分

### 1. 已正确区分 symptom_type 与 symptom_class
这是正确的，必须保留。

- `symptom_type` 负责证据来源属性
- `symptom_class` 负责诊断分流模式

这是当前系统从“症状词典”升级为“可收敛问诊系统”的关键一步。

### 2. 已把 symptom_class 放入运行时分层
这点也是对的。

因为 symptom_class 不是 question selector 的微调参数，而是：

```text
AI symptom → follow-up 之间的中间桥梁层
```

所以放进 MASTER SPEC 主体而不是只写进 addendum，是正确决策。

### 3. 已把 symptom_class 写进 Codex 极简摘要
这也对。

因为如果只写在 MASTER SPEC，不写进极简摘要，Codex 很容易继续按旧链路：

```text
AI symptom → problem → question
```

---

## 二、当前文档的关键缺口

## 缺口 1：没有写死 symptom_class 与 pattern_key / location_key / distribution_key 的关系

### 问题
现在文档说了：

- `symptom_class != symptom_type`

但还没有正式写死：

```text
symptom_class 不是 pattern_key 的替代品，
而是建立在 location / pattern / distribution 等底层属性之上的上层分流维度
```

### 风险
Codex 很可能直接把：

- `pattern_key`
- `symptom_class`

做成二选一，甚至拿 `pattern_key` 直接顶掉 `symptom_class`。

### 建议
在 MASTER SPEC 里补一条硬规则：

```text
location_key / pattern_key / distribution_key 保留为“表象描述层”；
symptom_class 作为“问诊分流层”新增；
两者不得互相替代。
```

---

## 缺口 2：没有写死一个 symptom 是否允许多 class 映射

### 问题
当前文档写了“主 class + 次级映射”的方向，但没有明确成硬结构。

### 风险
Codex 可能直接偷懒：
- 每个 symptom 只给一个 class
- 不支持 secondary class
- 以后复杂 symptom 无法扩展

例如：
- `leaf_twist`
- `patchy_browning`
- `distorted_growth`

这类都可能跨多个模式。

### 建议
正式规定：

- 每个 symptom 必须有 `primary_class_key`
- 允许 0~N 个 secondary class
- secondary 必须有 `mapping_strength`

推荐结构：

- `symptom_classes`
- `symptom_class_mapping`
  - `symptom_key`
  - `class_key`
  - `mapping_strength`
  - `is_primary`

---

## 缺口 3：没有写死 class 判断的输入来源优先级

### 问题
当前文档只说“visual symptom 先归到 symptom_class”，但没规定到底依据什么归类。

### 风险
Codex 可能：
- 只按 symptom_key 写硬编码
- 或只按 pattern_key 粗暴分类
- 或把 note/data_source 忽略掉

### 建议
补硬规则：

class 判定优先级应为：

1. `symptom_class_mapping` 显式映射
2. symptom 的强特异 note / source-backed alias
3. `location_key + pattern_key + distribution_key`
4. 仅在无明确映射时才做 fallback heuristics

---

## 缺口 4：没有写死 class-gated 只是“收窄”，不能“截断”

### 问题
当前文档写了：

```text
ClassGatedCandidateProblems
=
problems allowed by symptom_class
∩ evidence-hit problems
∩ prior-supported problems
```

这个表达有价值，但如果按“交集”硬做，风险很大。

### 风险
一旦 class 误判或 mapping 不全，候选问题会被过早截断，直接漏诊。

### 建议
改成更稳的规则：

```text
symptom_class 用于候选加权和优先级收缩，
默认不作为首轮硬白名单截断；
只有高置信特异 class 才允许更强 gating。
```

也就是说：

- `symptom_class` 优先做 soft gate
- 不要默认做 hard gate

---

## 缺口 5：没有写死 class 切换规则

### 问题
现在文档强调了“先按 class 收敛”，但没明确何时允许从一个 class 切到另一个 class。

### 风险
问诊过程中会卡死在错误模式，或者反过来太容易乱跳。

### 建议
补规则：

只有以下情况允许切 class：

1. 当前 class 内高价值题已问尽
2. 连续 `unknown >= threshold`
3. top problems 跨多个 class 且分差接近
4. 新增 visual/context evidence 明显指向另一 class

并且每次切 class 必须记录：
- `from_class`
- `to_class`
- `switch_reason`

---

## 缺口 6：没有写死非视觉 context symptom 是否参与 class

### 问题
你现在的 `symptoms` 里已经有很多 context / background 项：

- `recent_direct_sun_increase`
- `low_light_context`
- `watering_excess_background`
- `watering_deficit_background`
- `fertilization_gap`

这些并不是 AI visual symptom，但会强影响问诊模式。

### 风险
如果文档只把 class 理解成 visual-only，Codex 会忽略这些高价值背景信号。

### 建议
补硬规则：

```text
symptom_class 的触发来源不仅包括 AI visual symptom，
还包括高价值 context symptom / background symptom / diagnostic symptom。
```

也就是：
- visual 可以触发 class
- 问诊答案映射出的背景 symptom 也可以修正 class

---

## 缺口 7：没有写死 class 与 question_strategy 的关系结构

### 问题
当前文档只说“symptom_class + top_problem_key 双层选题”，但没规定 question 表结构怎么跟它挂。

### 风险
Codex 可能继续沿用旧 `question_strategy(problem_key)`，只是临时 if 一层 class。

### 建议
正式规定：
- `question_strategy` 需要升级支持 `class_key`
- 至少新增一层：
  - `class_key`
  - `problem_key`
  - `question_group_key`
  - `priority`
- 没有 class 命中的问题，不得参与第一轮 follow-up 竞争

---

## 缺口 8：没有写死 symptom_class 的数据审计要求

### 问题
MASTER SPEC 里把 symptom_class 当系统概念写进去了，但没规定：
- class 本身是否需要 source
- mapping 是否需要 audited/partial
- 如何处理聚合类/模糊类

### 风险
后面会出现：
- class 命名很漂亮
- 但完全没有审计状态
- 谁都能随手加一个 mode

### 建议
明确增加：

#### `symptom_classes`
- `class_key`
- `class_name_cn`
- `class_definition`
- `class_source_basis`
- `data_status`

#### `symptom_class_mapping`
- `symptom_key`
- `class_key`
- `mapping_strength`
- `is_primary`
- `data_status`
- `audit_note`

---

## 三、我对当前 symptom_class 文档部分的最终评级

### MASTER_SPEC_v2
**评级：B+**

优点：
- 已经把 symptom_class 升成正式层
- 方向对
- 足以阻止 Codex 完全忽略这一层

问题：
- 结构约束还不够硬
- 容易被实现成“只有概念，没有可靠运行时行为”

### CODEX_MINIMAL_EXEC_SUMMARY_v2
**评级：A-**

优点：
- 很适合让 Codex 快速抓住主约束
- 文字短，方向清晰

问题：
- 过于极简
- 如果不配合主规范，很容易把 class gating 实现成硬截断或硬编码分流

---

## 四、这次对 symptoms 的补充结果

我已基于当前 `symptoms` 内容，补充了：

- `symptom_class`
- `symptom_class_cn`
- `symptom_class_status`
- `symptom_class_source`
- `symptom_class_note`

并给出了独立的 `symptom_classes` 参考表。

### 当前补入的主要模式包括：

- `bacterial_leaf_spot_mode`
- `fungal_leaf_spot_mode`
- `leaf_spot_complex_mode`
- `sap_sucking_honeydew_pest_mode`
- `mite_damage_mode`
- `thrips_damage_mode`
- `chewing_pest_mode`
- `leafminer_mode`
- `root_rot_wet_wilt_mode`
- `soft_rot_mode`
- `yellowing_mode`
- `powdery_mildew_mode`
- `gray_mold_mode`
- `rust_mode`
- `virus_mosaic_mode`
- `water_stress_mode`
- `light_stress_mode`
- `humidity_stress_mode`
- `temperature_stress_mode`
- `general_stress_mode`
- `soil_moisture_pest_mode`
- `mechanical_damage_mode`
- `flower_stress_mode`
- `natural_aging_mode`
- `salt_dry_edge_mode`
- `leaf_edge_necrosis_mode`

### 这次补充采用的判断原则

不是简单按名字机翻归类，而是综合了：

1. symptom 当前表中的：
   - `location_key`
   - `pattern_key`
   - `distribution_key`
   - `note`
   - `data_source`

2. 权威园艺/病虫害资料对症状模式的归类逻辑：
   - 黄叶 / 缺素 / 脉间黄化
   - 刺吸害虫 / 蜜露 / 煤污
   - 螨害细网 / 点刺失绿
   - 叶斑类病斑 / 水渍斑 / 角形斑 / 同心轮纹
   - 白粉 / 灰霉 / 锈病 / 病毒花叶
   - 过湿 / 根腐 / 水肿 / 排水差
   - 低光 / 日灼 / 低湿 / 温度伤害

---

## 五、使用提醒

这次补充后的 `symptom_class` 可以先作为：

```text
soft gate / follow-up mode gate
```

来使用。

### 现阶段不建议直接做：
- 强硬白名单截断
- 一票否决 problem 候选
- 把 class 当最终诊断结果

### 更稳的用法是：
1. 先作为 question selector 的题组收敛层
2. 再逐步引入 candidate reweight
3. 最后才考虑高置信 class 的强 gating

---

## 六、一句话结论

```text
这次 symptom_class 方向是对的，而且必须保留；
但文档层还需要再补“关系、映射、切换、审计、软硬 gate 边界”这五类硬约束，
否则 Diagnose-process 仍然可能在实现时失真。
```
