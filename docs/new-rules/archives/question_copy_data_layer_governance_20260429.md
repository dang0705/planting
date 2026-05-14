# 问诊文案数据层治理规则 2026-04-29

## 结论

运行时不得把用户可见问诊题干、帮助文案、选项标题、选项说明作为主要来源硬编码在代码中。

静态文案必须来自数据层；动态文案必须来自数据层模板，并由运行时只负责填充变量。

## 正式数据来源

- `question_library_v5_real`
- `question_option_mapping_v5_real`
- `question_generation_engine` 仅作为模板审计资产和变量协议登记，不计入 formal runtime coverage。

## 运行时职责

- 选择 `question_key` 或 `template_engine_rule_key`
- 构造模板变量上下文
- 渲染 `{{variable}}` 模板
- 保存渲染后的题干、选项和变量快照，供 review 回放

运行时不得新增完整中文题干或完整中文选项文案作为常规路径。

## 必备字段

`question_library_v5_real`：

- `default_option_key`
- `ui_variant`
- `render_mode`
- `template_engine_rule_key`

`question_option_mapping_v5_real`：

- `option_description_user_cn`
- `display_order`
- `is_default`

`question_generation_engine`：

- `help_template_user_cn`
- `template_variables_json`
- `fallback_values_json`
- `render_policy`
- `option_template_json`

## 黄叶 gate 规则

- 黄叶首层 gate 必须声明问题目的：黄叶原因复杂，需要先分流，避免后续问题跑偏。
- 黄叶首层 gate 的默认选项为 `care_context`。
- 黄叶养护 gate 使用 `single_select_accordion`。
- 黄叶养护 gate 选项必须覆盖浇水、光照、施肥、通风湿度。
- 养护选项的具体解释放在 `option_description_user_cn`，不塞进题干。
- 浇水等动态范围使用 `{{watering_reference}}`、`{{watering_help}}` 等变量，由属级养护数据和天气湿度上下文渲染。

## 本次落地 SQL

`scripts/sql/question-data-layer-template-governance-20260429.sql`
