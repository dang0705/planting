# 统一问诊题干与答案选项数据层：固定 questionId / text / options

## 背景

当前问诊题包中的题干与答案选项没有被有效统一管理。

已观察到的问题：

同一个 `packageTopic = watering_frequency_context`，在黄叶模式与萎蔫 / 枯萎模式中出现了截然不同的 `questionId` 和 `text`。

这说明当前 `questionId` 很可能是后端运行时临时生成，或由题包组装逻辑动态派生，而不是来自稳定的数据层定义。

这属于设计漏洞：

*   同一语义题目无法稳定追踪；
*   前端无法通过 `questionId` 识别固定题干与固定答案；
*   回测、埋点、结果归因、answer 映射都会变得不可靠；
*   同一 topic 在不同模式中可能漂移成不同问题；
*   后续扩展题包时会继续产生重复题、伪重复题和兼容分支。

## 目标

建立统一的问诊题目数据层，使题目具备稳定、可追踪、可复用的定义。

核心目标：

```plain
固定题干。
固定 questionId。
固定 text。
固定 helpText。
固定答案选项。
通过 questionId 能查到固定答案选项。
题包只引用题目定义，不再临时生成题目身份。
```

## 必须修正的具体问题

### watering\_frequency\_context 统一口径

当前 `watering_frequency_context` 应统一以萎蔫 / 枯萎模式中的题干为准：

```plain
请您选择在过去的10天内，哪几天浇了水？
```

对应 `helpText` 也以当前萎蔫 / 枯萎模式中的版本为准，不得在黄叶模式中另造一套不同 helpText。

如果当前代码中存在黄叶模式自己的 `watering_frequency_context` text / helpText，应删除或替换为统一题目定义。

## 范围

### 必须做

*   梳理当前题包中所有 `packageTopic`、`questionId`、`text`、`helpText`、`options` 的来源。
*   确认哪些题目是数据层定义，哪些是后端临时生成或运行时拼装。
*   建立统一的题目注册表或等价数据层，例如 `questionRegistry` / `questionBank`。
*   每个可复用题目必须有稳定 `questionId`。
*   每个稳定 `questionId` 必须绑定固定：
    *   `packageTopic`
    *   `text`
    *   `helpText`
    *   `answerType`
    *   `options`
    *   必要的 UI 配置
    *   必要的 answer → outcome 映射引用
*   题包只通过 `questionId` 引用题目定义。
*   后端返回题包时，从统一题目数据层展开完整题目结构给前端。
*   禁止同一个 `packageTopic` 在不同模式中无意漂移出不同题干。
*   若确实存在同 topic 但业务语义不同的问题，必须拆成不同 `questionId`，并明确命名，不得混用。
*   修正 `watering_frequency_context`：黄叶模式与萎蔫 / 枯萎模式必须返回同一套稳定题目定义。
*   `watering_frequency_context.text` 统一为：`请您选择在过去的10天内，哪几天浇了水？`
*   `watering_frequency_context.helpText` 以当前萎蔫 / 枯萎模式中的 helpText 为准。
*   确认前端通过接口拿到的是稳定 `questionId` 与固定答案选项。
*   补充最小测试或回测，验证同一 `questionId` 在不同题包中输出一致。

### 不做

*   不重写 outcome / route 判定权重。
*   不新增评分系统。
*   不修改数据库发布链路，除非当前题目定义确实已经由数据库托管且必须修正数据。
*   不把所有模式题库无边界全量下发给前端。
*   不改动天气、养护、支付、登录、图片识别等无关模块。
*   不为了兼容旧动态 questionId 保留大量无效映射层。

## 建议设计方向

### 1\. 建立题目注册表

建议结构方向：

```plain
type DiagnosisQuestionDefinition = {
  questionId: string
  packageTopic: string
  text: string
  helpText?: string
  answerType: 'single_choice' | 'multi_choice' | 'date_multi_select' | 'boolean' | 'text'
  options: DiagnosisAnswerOption[]
  ui?: Record<string, unknown>
}
```

其中 `questionId` 是稳定主键，不应在运行时随机生成。

### 2\. 题包只引用 questionId

题包配置应尽量变成：

```plain
type DiagnosisQuestionPackage = {
  mode: DiagnosisMode
  route: string
  questionIds: string[]
}
```

后端返回前端前，再通过 `questionRegistry` 展开为：

```plain
type DiagnosisQuestionPackageResponse = {
  mode: DiagnosisMode
  route: string
  questions: DiagnosisQuestionDefinition[]
}
```

### 3\. 禁止运行时临时生成 questionId

不应出现：

```plain
questionId: `${mode}_${topic}_${Date.now()}`
questionId: randomId()
questionId: hash(text)
```

也不应通过题包位置临时生成：

```plain
questionId: `q_${index}`
```

允许的方式是：

```plain
questionId: 'watering_frequency_context'
```

或更明确：

```plain
questionId: 'q_watering_frequency_last_10_days'
```

但一旦确定，不能随模式漂移。

### 4\. packageTopic 与 questionId 的关系

`packageTopic` 可以作为业务主题分类，但不应替代 `questionId`。

推荐关系：

```plain
packageTopic = 题目语义主题
questionId = 稳定题目身份
```

如果一个 topic 下确实有多个不同题目，必须显式拆分，例如：

```plain
packageTopic: watering_frequency_context
questionId: q_watering_dates_last_10_days

packageTopic: watering_frequency_context
questionId: q_watering_amount_or_throughness
```

不要让相同 `packageTopic` 在不同模式下悄悄返回不同 `text`。

## watering\_frequency\_context 统一要求

最终接口中，黄叶模式与萎蔫 / 枯萎模式只要使用 `watering_frequency_context` 对应的“过去 10 天浇水日期”问题，就必须返回同一题目定义。

推荐固定定义：

```plain
{
  questionId: 'q_watering_dates_last_10_days',
  packageTopic: 'watering_frequency_context',
  text: '请您选择在过去的10天内，哪几天浇了水？',
  helpText: '<以当前萎蔫 / 枯萎模式中的 helpText 为准>',
  answerType: 'date_multi_select',
  options: '<固定答案选项或日期选择配置>'
}
```

注意：

*   不要把黄叶模式的旧 text 继续保留为同 topic 的另一个隐式版本。
*   若前端需要日期选择 UI，应由固定题目定义提供稳定 UI 配置。
*   answer 结果必须能通过稳定 `questionId` 回溯到固定题干与选项。

## CheckList

- [ ] 定位当前题包生成逻辑。
- [ ] 定位 `packageTopic`、`questionId`、`text`、`helpText`、`options` 的来源。
- [ ] 确认是否存在运行时临时生成 `questionId` 的逻辑。
- [ ] 梳理黄叶模式题包中的 `watering_frequency_context`。
- [ ] 梳理萎蔫 / 枯萎模式题包中的 `watering_frequency_context`。
- [ ] 对比两个模式下该 topic 的 `questionId`、`text`、`helpText`、`options` 差异。
- [ ] 建立统一 `questionRegistry` / `questionBank` 或等价数据层。
- [ ] 每个题目定义固定 `questionId`。
- [ ] 每个 `questionId` 固定绑定 `text`、`helpText`、`answerType`、`options`。
- [ ] 题包改为引用稳定 `questionId`，不再各自内联生成题目身份。
- [ ] 后端返回题包时，通过 `questionId` 展开完整题目结构。
- [ ] 修正 `watering_frequency_context.text` 为：`请您选择在过去的10天内，哪几天浇了水？`
- [ ] 修正 `watering_frequency_context.helpText`：以当前萎蔫 / 枯萎模式版本为准。
- [ ] 确认黄叶模式与萎蔫 / 枯萎模式返回同一套 `watering_frequency_context` 题目定义。
- [ ] 确认通过 `questionId` 能查到固定答案选项。
- [ ] 确认不修改 outcome / route 判定权重。
- [ ] 确认不修改数据库发布链路，除非题目定义已由数据库托管且必须修正数据。
- [ ] 补充测试：同一 `questionId` 在不同题包中 text / helpText / options 一致。
- [ ] 补充测试：接口返回的题包不包含运行时随机 questionId。
- [ ] 补充测试：`watering_frequency_context` 在黄叶与萎蔫 / 枯萎模式中输出一致。
- [ ] 运行 lint / 类型检查。
- [ ] 手动验证黄叶模式问诊流程正常。
- [ ] 手动验证萎蔫 / 枯萎模式问诊流程正常。
- [ ] 在任务结果中记录：修正了哪些题目定义、删除了哪些临时生成逻辑、最终稳定 questionId 是什么。

## 验收标准

1. `questionId` 不再由后端运行时临时生成。
2. 同一个稳定 `questionId` 始终对应同一套 `text`、`helpText`、`answerType`、`options`。
3. 题包只引用稳定题目定义，不再在不同模式中私自内联变体。
4. 前端接口响应中仍能拿到完整题干与答案选项。
5. 通过 `questionId` 可以查到固定答案选项。
6. 黄叶模式与萎蔫 / 枯萎模式中的 `watering_frequency_context` 输出一致。
7. `watering_frequency_context.text` 固定为：`请您选择在过去的10天内，哪几天浇了水？`
8. `watering_frequency_context.helpText` 以当前萎蔫 / 枯萎模式版本为准。
9. 没有修改 outcome / route 判定权重。
10. 没有修改数据库发布链路，除非题目定义当前已由数据库托管且任务结果中明确说明。
11. 相关测试 / 回测通过。
12. 任务结果中必须记录最终稳定题目 ID 与映射关系。

## 风险与注意事项

这不是文案微调任务，而是题目身份与题目数据层的治理任务。

不能只在黄叶模式里把 text 改成一样；那只是遮住问题。真正要修的是：题目定义必须有唯一事实源，题包引用它，接口展开它。

如果一个 `packageTopic` 下确实存在多个不同语义的问题，必须拆成多个稳定 `questionId`，并在命名上体现差异，不能继续让同一个 topic 承担多个隐式问题。

## Codex 执行提示

执行前优先读取最小必要上下文：

*   diagnose-http 题包生成逻辑。
*   diagnosis-engine 中 question package 相关代码。
*   黄叶模式题包定义。
*   萎蔫 / 枯萎模式题包定义。
*   前端消费题包接口的数据结构。
*   当前 answer → outcome 映射是否依赖 `questionId`。

本任务的核心是建立稳定题目数据层，不要扩大到 outcome 判定、route 权重、数据库发布链路或 UI 重构。