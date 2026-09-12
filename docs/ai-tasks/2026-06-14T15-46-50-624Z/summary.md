# ClickUp Fetch Result

- taskId: `86exy7xr3`
- customTaskIds: `false`
- source: `task_id_arg`
- title: 实现自有历史天气缓存：D-1 到 D-10 滚动窗口（低成本对象存储方案）
- status: backlog
- assignees: -
- tags: -
- subtasks: 0
- comments: 0
- attachments: 0
- nativeChecklistItems: 0
- hardConstraints: 21
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

- 未检测到 native checklist items。当前 workflow 只使用 native checklist 回写。

## Hard constraints

- 不需要复杂 SQL  
  - source: clickup_task_description
- 不需要事务强一致  
  - source: clickup_task_description
- ### 必须做  
  - source: clickup_task_description
- *   不要求本任务一次完成实时天气 hourly 采样；实时采样可作为后续增强。  
  - source: clickup_task_description
- *   `timezone` 必须存在，后续按地点本地日期归档。  
  - source: clickup_task_description
- 注意：归档必须按 `WeatherLocation.timezone`，不能按云函数服务器时区。  
  - source: clickup_task_description
- 不要在用户请求中同步请求和风。  
  - source: clickup_task_description
- 必须区分数据来源，避免把预报快照伪装成严格历史实况。  
  - source: clickup_task_description
- 如果未来接入时光机补偿，缺字段必须标记：  
  - source: clickup_task_description
- - [ ] 生成植物诊断需要的派生特征。  
  - source: clickup_task_description
- ## 验收标准  
  - source: clickup_task_description
- 8. 天气窗口包含植物诊断需要的基础字段与派生特征。  
  - source: clickup_task_description
- 15. 任务结果中必须记录优化前后诊断链路对和风的依赖变化。  
  - source: clickup_task_description
- ### 1\. 不要把预报快照伪装成严格历史实况  
  - source: clickup_task_description
- MVP 第一阶段的数据本质是“每日预报快照归档”，不是严格的实况历史。字段上必须保留 `sourceKind` 和 `quality`，避免后续诊断解释变脏。  
  - source: clickup_task_description
- ### 2\. 不要在诊断请求里临时补抓天气  
  - source: clickup_task_description
- ### 3\. 不要把天气窗口主体放数据库  
  - source: clickup_task_description
- ### 4\. 不要无边界扩展地点  
  - source: clickup_task_description
- 只为业务真实需要的地点生成缓存，不做全国城市天气仓库。  
  - source: clickup_task_description
- 本任务只负责历史诊断窗口 D-1 到 D-10。若养护模式需要 D0 或未来 7 天，应另走 forecast cache，不要混在本任务里。  
  - source: clickup_task_description
- 不要全量扫描无关模块。不要扩大到问诊题包、outcome 权重、养护算法重构、支付、登录、图片识别等模块。  
  - source: clickup_task_description

## Written files

- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-14T15-46-50-624Z/clickup-task-facts.json: originalBytes=13945, writtenBytes=13945, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-14T15-46-50-624Z/clickup-task-full-facts.json: originalBytes=80274, writtenBytes=80274, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-14T15-46-50-624Z/clickup-request-records.json: originalBytes=2415, writtenBytes=2415, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-14T15-46-50-624Z/clickup-task.raw.limited.json: originalBytes=46422, writtenBytes=46422, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-14T15-46-50-624Z/clickup-comments.raw.limited.json: originalBytes=92, writtenBytes=92, limited=false
- /Users/jay/WebstormProjects/codex-thin-pipeline/runs/clickup-fetch/2026-06-14T15-46-50-624Z/clickup-description.md: originalBytes=14791, writtenBytes=14791, limited=false

> 此脚本为只读读取脚本，不调用 Codex，不执行 agent flow，不修改 ClickUp。