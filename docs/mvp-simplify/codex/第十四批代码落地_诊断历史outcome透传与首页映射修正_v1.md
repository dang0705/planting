# 第十四批代码落地：诊断历史 outcome 透传与首页映射修正 v1

## 1. 背景

第十三批完成后，诊断弹窗和结果承接页已经能正确识别：

- `problematic`
- `uncertain`
- `non_problematic`

但历史列表链路仍有一个语义缺口：

1. `diagnose-http /diagnosis/history` 返回列表时，没有把 `outcomeType` 暴露到 item 顶层。
2. 首页诊断历史卡片仍然只按 `severity` 粗暴映射 badge，导致 `uncertain` 会显示成“注意”。

这会让新框架的三类 outcome 在历史列表场景里重新退化回旧两分类。

## 2. 代码改动

### 2.1 `cloudfunctions/diagnose-http/services/session-service.js`

历史列表返回项补充：

- `outcomeType`

即 `listDiagnosisHistory()` 现在会返回：

- `historyId`
- `resultId`
- `outcomeType`
- `createdAt`
- `summary`

这样前端无需猜测，就能基于正式 outcome 语义渲染历史卡片。

### 2.2 `src/pages/index/index.vue`

首页植物卡片里的“诊断历史” badge 映射修正为：

- `non_problematic -> healthy`
- `uncertain -> unknown`
- 其他仍按 `summary.severity` 区分 `danger / warning`

同时把 `unknown` 的文案从“未知”改成“待确认”，避免把低置信度结果误读成数据异常。

### 2.3 `src/http-functions/diagnose/client.js`

前端历史列表 fallback 兼容也补齐：

- 旧结构 `data.list` 归一化时也会保留 `outcomeType`
- `non_problematic / uncertain` 会统一映射成低风险等级，不再误落成普通问题性结果

## 3. 校验

已完成静态校验：

- `node --check cloudfunctions/diagnose-http/services/session-service.js`
- `node --check src/http-functions/diagnose/client.js`

脚本层人工复核：

- `src/pages/index/index.vue` 中历史卡片映射逻辑已按 `outcomeType` 收口

## 4. 云端发布

本批已重新部署：

- `diagnose-http`

部署后复核结果：

- `Status = Active`
- `Layer = layer:39`
- 最新云端修改时间：`2026-04-06 16:48:16 +08`

## 5. 结果

本批完成后，诊断历史链路不再丢失 outcome 语义：

- 首页诊断历史卡片
- 诊断历史 fallback 归一化
- `diagnose-http` 历史列表返回

三处现在都能区分：

- 问题性结果
- 低置信度待确认结果
- 非问题性结果

这批属于“历史展示语义修正”，没有改 UI 结构，也没有引入新的交互流程。
