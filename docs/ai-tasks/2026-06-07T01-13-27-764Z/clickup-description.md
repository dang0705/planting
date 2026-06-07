背景

当前问诊体系已经从早期复杂的动态诊断流，收敛为更清晰的结构：

问诊采用 route + 固定症状模式 + 固定题包。
不再需要后端在 diagnosis-engine 中承担过重的动态推理、动态下一题、复杂状态推进职责。
对于黄叶、枯萎、长势不佳、虫害等模式，后端理论上只需要维护“模式 => 题包”的映射关系。
前端在拿到当前模式题包后，本地完成题目展示、答案收集、上一题/下一题、完成态判断。

因此，diagnose-http 中现有 diagnosis-engine 的复杂度应当大幅降低。当前任务目标不是新增诊断能力，而是把已经不再需要的旧复杂度清掉，让代码结构贴合当前产品事实。

目标

大幅简化 diagnose-http 的 diagnosis-engine 代码，使后端职责收敛为：

根据问诊模式返回该模式对应的固定题包，并为后续多 outcome / 单 outcome 控制预留扩展入口。

必须做

梳理 diagnose-http 当前 diagnosis-engine 的真实职责。
删除或简化已经不符合当前问诊模式的复杂逻辑，包括但不限于：
动态下一题推导。
复杂题目推进状态机。
与逐题加载绑定的兼容逻辑。
后端侧不必要的诊断流程编排。
已不再被前端消费的中间结构或旧字段。
建立或整理清晰的“模式 => 题包”映射结构。
后端按 mode 返回对应题包，不无差别返回所有模式题库。
黄叶模式应能返回当前固定题包。
其他模式可保留扩展口，不要求本任务完整实现所有模式题包。
题包结构中应预留 outcome 控制入口，例如：
当前题包是否允许多 outcome。
当前题包是否倾向唯一 outcome。
该能力只要求结构上可扩展，不强制完成完整 outcome 判定实现。
保持当前 route + 固定症状模式 + 固定题包 的产品口径。
控制 diff 范围，优先删减冗余代码，而不是新增一层复杂抽象。

不做

不重写黄叶 outcome / route 判定权重。
不引入新的评分系统。
不恢复逐题动态请求模式。
不把所有模式题库无边界全量下发。
不修改数据库发布链路。
不改动与本任务无关的养护算法、天气算法、支付、登录、图片识别等模块。
不为了兼容旧流程保留大量无效分支，除非有明确线上兼容需求。

建议设计方向

后端职责收敛

后端侧可以收敛为类似结构：

type DiagnosisMode = 'yellow\_leaf' | 'wilting' | 'poor\_growth' | 'pest'

type OutcomePolicy = {
allowMultipleOutcomes?: boolean
preferSingleOutcome?: boolean
}

type DiagnosisQuestionPackage = {
mode: DiagnosisMode
route: string
questions: DiagnosisQuestion\[\]
outcomePolicy?: OutcomePolicy
}

核心思想：

mode 决定题包。
route 只保留必要的路径识别能力。
questions 是当前模式固定题包。
outcomePolicy 只作为未来扩展入口，当前不强制完成复杂 outcome 计算。

简化方向

应优先把代码变成：

getQuestionPackageByMode(mode)

而不是继续维护：

getCurrentQuestion()
getNextQuestion()
resolveDynamicBranch()
advanceDiagnosisState()
mergeQuestionRuntimeContext()

如果这些函数在当前模式下已经没有真实价值，应删除或显著简化。

CheckList

定位 diagnose-http 中 diagnosis-engine 的入口文件与调用链。
确认当前前端是否已经按 mode 获取题包。
梳理当前 engine 中哪些逻辑仍被使用，哪些只是旧动态问诊残留。
建立清晰的 mode 到题包映射。
黄叶模式能返回固定题包。
后端不再承担逐题推进职责。
删除或简化动态下一题逻辑。
删除或简化复杂状态机逻辑。
删除不再使用的兼容字段、工具函数或中间结构。
为题包预留 outcomePolicy 或等价扩展入口。
不修改 outcome / route 判定权重。
不修改数据库发布链路。
不影响结果页现有四项独立输出边界。
运行 lint / 类型检查。
手动或最小测试验证：指定 mode 能返回对应题包。
回测黄叶题包：过浇/缺水、施肥、光照、通风问题均能正确命中对应 outcome；四项均不确定时输出 uncertain。
在任务结果中说明删除了哪些旧复杂代码，以及保留了哪些必要兼容点。

验收标准

diagnose-http 的 diagnosis-engine 明显简化，职责边界清晰。
后端可以按问诊模式返回对应固定题包。
黄叶模式题包可正常返回。
不再依赖后端逐题计算下一题来推进当前问诊流程。
没有引入所有模式题库无差别全量下发。
没有修改 outcome / route 判定权重。
没有修改数据库发布链路。
代码删除量或复杂度下降应当明显，不能只是包一层新抽象后保留旧逻辑。
lint / 类型检查通过。
任务结果中必须记录：
实际简化了哪些文件。
删除了哪些旧逻辑。
当前 mode => 题包入口在哪里。
outcome 扩展入口如何预留。

Codex 执行提示

执行前先读取最小必要上下文，不要全量扫描无关文档。优先定位：

diagnose-http 云函数或接口入口。
diagnosis-engine 相关文件。
当前问诊 mode 标识。
当前题包定义位置。
前端调用该接口的数据结构。

本任务本质是“删除旧复杂度 + 收敛职责”，不是新增诊断系统。不要扩大任务边界。