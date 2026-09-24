# P2 展示百科修订内容摘要证据

- 对应任务：[P2 CMS 分类、百科和发布](https://app.clickup.com/t/z8v0kmr971)。
- Expected：[CMS 展示百科补全 Worker](../implementation/cms-enrichment-worker.md) 的 `content_hash` 规则与[展示型内容 v1 Schema](../contracts/schemas/plant-encyclopedia-display.v1.schema.json)。
- 层次：`unit_real_data`。使用真实 JSON Schema 与 Node SHA-256；不访问 CMS、CloudBase、Qwen、MySQL 或 HTTP。

## 黄金向量和测试门

完整展示正文的摘要字节固定为：

```json
{"appearance":"绿色叶片","distribution":"热带地区","introduction":"展示介绍","qa":[{"answer":"心形。","question":"叶形如何？"}]}
```

该行不含末尾换行，以 UTF-8 求 SHA-256 后为 `cf4fe6ae53e68fdf6e2291fb1cebe0bbb1c2aafc77299a0ec0926c33a89f6167`。对象键重排后摘要不变；修改问答内容或顺序后摘要变化。未知结构版本、越界字段无法取得摘要；调用方随后改动原始草稿也不会改变已准备的正文与摘要。

RED：测试先于 `prepareEncyclopediaDisplayRevision` 落盘，4/4 失败（函数缺失）。GREEN：展示型准入、通用规范 JSON 摘要与诊断候选复用接线后，目标及既有诊断摘要测试 18/18 通过。反向验证：临时移除规范 JSON 的对象键排序后，百科和诊断的 4 条测试失败；恢复排序后 11/11 重新通过。

后端全量非 MySQL 测试为 84 个文件、477 个测试通过；TypeScript 类型检查、改动文件的 oxlint/oxformat 和构建通过。构建命令所在 shell 为 Node 24，出现项目要求 Node 22 的 engine 提示；因此该构建结果不单独证明 Node 22 运行时验收。全仓 `format:check` 仍显示 56 个既有或其他工作区文件的格式差异，改动的 4 个 TypeScript 文件单独检查通过。

本证据只证明本地结构准入和摘要字节规则，不证明文案真实准确、CMS 人工审核身份、数据库落盘/读回、发布切换或贡献奖励。原有诊断摘要的公开语义保持不变。
