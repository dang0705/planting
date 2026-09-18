# ClickUp Fetch Result

- taskId: `86exxzd5t`
- customTaskIds: `false`
- source: `task_id_arg`
- title: 统一问诊题干与答案选项数据层：固定 questionId / text / options
- status: backlog
- assignees: -
- tags: -
- subtasks: 0
- comments: 0
- attachments: 0
- nativeChecklistItems: 24
- hardConstraints: 23
- factsQuality: pass / score=100
- weakStructure: false
- missingFacts: -

## Facts quality gate

- status: pass
- score: 100
- highRisk: true
- warnings: -
- requiredHumanActions: -

## Native checklist items

- [ ] Checklist / 定位当前题包生成逻辑。 (828b6175-480a-4947-9832-075792716781/957040e2-89b4-4df9-b6a0-628b83376fd4)
- [ ] Checklist / 定位 packageTopic、questionId、text、helpText、options 的来源。 (828b6175-480a-4947-9832-075792716781/54246d68-dd23-4272-9eb6-003dd267949f)
- [ ] Checklist / 确认是否存在运行时临时生成 questionId 的逻辑。 (828b6175-480a-4947-9832-075792716781/b2da5659-4afb-4c0a-91fe-6b20fc65acc7)
- [ ] Checklist / 梳理黄叶模式题包中的 watering_frequency_context。 (828b6175-480a-4947-9832-075792716781/cb0fb993-2b6f-4e55-a180-f554156eb401)
- [ ] Checklist / 梳理萎蔫 / 枯萎模式题包中的 watering_frequency_context。 (828b6175-480a-4947-9832-075792716781/a5aadf53-794b-4a17-9082-f9f48de81191)
- [ ] Checklist / 对比两个模式下该 topic 的 questionId、text、helpText、options 差异。 (828b6175-480a-4947-9832-075792716781/e6d0de16-0178-4a6f-9525-159d1cdf0328)
- [ ] Checklist / 建立统一 questionRegistry / questionBank 或等价数据层。 (828b6175-480a-4947-9832-075792716781/ddba1b0f-b5e9-4de3-b317-a7b38c1a5cec)
- [ ] Checklist / 每个题目定义固定 questionId。 (828b6175-480a-4947-9832-075792716781/933e18c2-0a42-4c90-846f-39ba1ef7c9c4)
- [ ] Checklist / 每个 questionId 固定绑定 text、helpText、answerType、options。 (828b6175-480a-4947-9832-075792716781/e130b154-c457-47b3-a4db-0d8a074a112f)
- [ ] Checklist / 题包改为引用稳定 questionId，不再各自内联生成题目身份。 (828b6175-480a-4947-9832-075792716781/589aa32b-6e5a-49a8-979c-1b136f592daf)
- [ ] Checklist / 后端返回题包时，通过 questionId 展开完整题目结构。 (828b6175-480a-4947-9832-075792716781/4db9e87f-4621-468b-8761-e8af006973a8)
- [ ] Checklist / 修正 watering_frequency_context.text 为：请您选择在过去的10天内，哪几天浇了水？ (828b6175-480a-4947-9832-075792716781/2c9f58b0-e0b1-4e06-9187-d7d7a3bf61f0)
- [ ] Checklist / 修正 watering_frequency_context.helpText：以当前萎蔫 / 枯萎模式版本为准。 (828b6175-480a-4947-9832-075792716781/13358737-5a7c-4751-85a9-cdd166d11976)
- [ ] Checklist / 确认黄叶模式与萎蔫 / 枯萎模式返回同一套 watering_frequency_context 题目定义。 (828b6175-480a-4947-9832-075792716781/c3a9cb2b-c0b8-4d3d-a581-94ac55d73109)
- [ ] Checklist / 确认通过 questionId 能查到固定答案选项。 (828b6175-480a-4947-9832-075792716781/8b5fe55f-d03c-4997-861b-f80deee126df)
- [ ] Checklist / 确认不修改 outcome / route 判定权重。 (828b6175-480a-4947-9832-075792716781/5cc8b400-7ea4-40d6-be4f-956df5e86b78)
- [ ] Checklist / 确认不修改数据库发布链路，除非题目定义已由数据库托管且必须修正数据。 (828b6175-480a-4947-9832-075792716781/cddef81b-f1a1-4feb-aa51-5564c69e486d)
- [ ] Checklist / 补充测试：同一 questionId 在不同题包中 text / helpText / options 一致。 (828b6175-480a-4947-9832-075792716781/e59034af-7439-4c53-9093-7960761aaafb)
- [ ] Checklist / 补充测试：接口返回的题包不包含运行时随机 questionId。 (828b6175-480a-4947-9832-075792716781/4d536040-0906-48ec-80c8-1081f6d95bde)
- [ ] Checklist / 补充测试：watering_frequency_context 在黄叶与萎蔫 / 枯萎模式中输出一致。 (828b6175-480a-4947-9832-075792716781/06af408b-b47a-4259-97a4-4bdc503df7e4)
- [ ] Checklist / 运行 lint / 类型检查。 (828b6175-480a-4947-9832-075792716781/ad1167cb-cece-42f4-8d02-f15aa8a706cf)
- [ ] Checklist / 手动验证黄叶模式问诊流程正常。 (828b6175-480a-4947-9832-075792716781/5b8d8d06-943c-4400-85be-5e5780534735)
- [ ] Checklist / 手动验证萎蔫 / 枯萎模式问诊流程正常。 (828b6175-480a-4947-9832-075792716781/5a766038-641e-4afa-852d-f51987e886ca)
- [ ] Checklist / 在任务结果中记录：修正了哪些题目定义、删除了哪些临时生成逻辑、最终稳定 questionId 是什么。 (828b6175-480a-4947-9832-075792716781/544389e5-0637-4bc7-8caa-9cc7de936d41)

## Hard constraints

- 建立统一的问诊题目数据层，使题目具备稳定、可追踪、可复用的定义。  
  - source: clickup_task_description
- ## 必须修正的具体问题  
  - source: clickup_task_description
- 对应 `helpText` 也以当前萎蔫 / 枯萎模式中的版本为准，不得在黄叶模式中另造一套不同 helpText。  
  - source: clickup_task_description
- ### 必须做  
  - source: clickup_task_description
- *   每个可复用题目必须有稳定 `questionId`。  
  - source: clickup_task_description
- *   每个稳定 `questionId` 必须绑定固定：  
  - source: clickup_task_description
- *   禁止同一个 `packageTopic` 在不同模式中无意漂移出不同题干。  
  - source: clickup_task_description
- *   若确实存在同 topic 但业务语义不同的问题，必须拆成不同 `questionId`，并明确命名，不得混用。  
  - source: clickup_task_description
- *   修正 `watering_frequency_context`：黄叶模式与萎蔫 / 枯萎模式必须返回同一套稳定题目定义。  
  - source: clickup_task_description
- *   不修改数据库发布链路，除非当前题目定义确实已经由数据库托管且必须修正数据。  
  - source: clickup_task_description
- ### 3\. 禁止运行时临时生成 questionId  
  - source: clickup_task_description
- 如果一个 topic 下确实有多个不同题目，必须显式拆分，例如：  
  - source: clickup_task_description
- 不要让相同 `packageTopic` 在不同模式下悄悄返回不同 `text`。  
  - source: clickup_task_description
- 最终接口中，黄叶模式与萎蔫 / 枯萎模式只要使用 `watering_frequency_context` 对应的“过去 10 天浇水日期”问题，就必须返回同一题目定义。  
  - source: clickup_task_description
- *   不要把黄叶模式的旧 text 继续保留为同 topic 的另一个隐式版本。  
  - source: clickup_task_description
- *   若前端需要日期选择 UI，应由固定题目定义提供稳定 UI 配置。  
  - source: clickup_task_description
- *   answer 结果必须能通过稳定 `questionId` 回溯到固定题干与选项。  
  - source: clickup_task_description
- - [ ] 确认不修改数据库发布链路，除非题目定义已由数据库托管且必须修正数据。  
  - source: clickup_task_description
- ## 验收标准  
  - source: clickup_task_description
- 12. 任务结果中必须记录最终稳定题目 ID 与映射关系。  
  - source: clickup_task_description
- 不能只在黄叶模式里把 text 改成一样；那只是遮住问题。真正要修的是：题目定义必须有唯一事实源，题包引用它，接口展开它。  
  - source: clickup_task_description
- 如果一个 `packageTopic` 下确实存在多个不同语义的问题，必须拆成多个稳定 `questionId`，并在命名上体现差异，不能继续让同一个 topic 承担多个隐式问题。  
  - source: clickup_task_description
- 本任务的核心是建立稳定题目数据层，不要扩大到 outcome 判定、route 权重、数据库发布链路或 UI 重构。  
  - source: clickup_task_description

## Written files

- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-13T06-30-20-714Z/clickup-task-facts.json: originalBytes=21636, writtenBytes=21636, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-13T06-30-20-714Z/clickup-task-full-facts.json: originalBytes=67492, writtenBytes=67492, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-13T06-30-20-714Z/clickup-request-records.json: originalBytes=2218, writtenBytes=2218, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-13T06-30-20-714Z/clickup-task.raw.limited.json: originalBytes=45545, writtenBytes=45545, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-13T06-30-20-714Z/clickup-comments.raw.limited.json: originalBytes=92, writtenBytes=92, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-13T06-30-20-714Z/clickup-description.md: originalBytes=10210, writtenBytes=10210, limited=false

> 此脚本为只读读取脚本，不调用 Codex，不执行 agent flow，不修改 ClickUp。