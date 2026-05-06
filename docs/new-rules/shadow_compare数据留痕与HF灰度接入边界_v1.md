# shadow_compare数据留痕与HF灰度接入边界_v1

## 1. 本轮目的

本文件用于说明当前仓库中已经落地的 `shadow compare` 能力，以及当前 HF 接入仍然受限的边界。

适用对象：

- `cloudfunctions/diagnose-http`
- 多图视觉入口
- 双模型灰度过渡

---

## 2. 当前已落地能力

### 2.1 主链与对照链已隔离

当前代码已经保证：

- 主链仍由主模型适配器输出驱动
- shadow compare 只做对照留痕
- shadow 结果不进入：
  - `admission_records`
  - `observed_evidence_set`
  - `diagnosis` 排序

因此当前已满足：

> 允许 shadow compare，但不允许污染主链。

---

### 2.2 当前已实现的配置入口

文件：

- `cloudfunctions/diagnose-http/configs/index.js`

当前支持配置：

```js
llm: {
  service: 'hunyuan',
  model: 'hunyuan-t1-vision-20250916',
  shadowService: '',
  shadowModel: ''
}
```

说明：

- `service/model` 定义主识别源
- `shadowService/shadowModel` 定义对照链来源
- 当 `shadowService` 为空时，shadow compare 关闭

---

### 2.3 当前已实现的适配器层

文件：

- `cloudfunctions/diagnose-http/services/visual-adapters/hunyuan-visual-adapter.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js`
- `cloudfunctions/diagnose-http/services/visual-adapters/index.js`

当前状态：

- 混元适配器可直接调用现有视觉主链
- HF 适配器已支持两种输入：
  - 预计算分类结果
  - 真实 HTTP inference service
- 适配器已支持 `adapterMetaOverride`

这意味着：

- 切换上游来源不需要改 diagnosis 主链
- 主链与对照链都能投影到统一标准化对象

---

### 2.4 当前已实现的 shadow 留痕位置

文件：

- `cloudfunctions/diagnose-http/services/visual-diagnosis-service.js`

shadow compare 结果当前会进入：

1. `visual_raw_image_records.raw_structured_output.shadow_compare`
2. `visual_normalized_image_results.pattern_candidates_json` 中的：
   - `shadow_compare_enabled`
   - `shadow_compare_status`
   - `shadow_compare_provider`
   - `shadow_compare_model_name`
   - `shadow_compare_adapter_name`
3. `visual_call_aggregate_result.aggregate_summary_json.shadow_compare_summary`

因此当前已经具备：

- 逐图留痕
- 单图标准化层留痕
- 批次级汇总留痕

### 2.5 当前已实现的公开结果出口

当前以下对外结果对象已可带出 shadow 相关摘要：

1. `/diagnosis/start`
2. `/diagnosis/answer`
3. `/diagnosis/result`
4. 最终快照与 runtime snapshot

当前公开字段包括：

- `visualBatchTrace`
- `visualAggregateSummary`
- `shadowCompareSummary`

说明：

- 公开结果只暴露批次摘要与 compare 摘要
- 不直接把内部 candidate 层和 shadow 原始结构整包暴露到客户端

---

## 3. 当前 shadow compare 状态定义

### 3.1 单图级状态

当前支持以下状态：

- `disabled`
- `succeeded`
- `failed`
- `skipped_no_shadow_input`

说明：

- 当配置未开启 shadow compare 时，状态为 `disabled`
- 当配置开启但当前图片没有可用 HF 输入时，状态为 `skipped_no_shadow_input`
- 这样不会把“没提供 shadow 输入”误记成模型失败

### 3.2 批次级状态

当前 `shadow_compare_summary.compare_status` 可能为：

- `disabled`
- `partial_or_succeeded`
- `skipped`
- `failed`

并同时记录：

- `compared_image_count`
- `succeeded_image_count`
- `skipped_image_count`
- `failed_image_count`
- `providers`
- `model_names`

---

## 4. 当前 HF 接入边界

### 4.1 已具备的部分

当前已经具备：

- HF 统一适配器接口
- HF 结果标准化出口
- HF 作为 shadow compare 源的运行时接线

### 4.2 尚未具备的部分

当前仓库内已经具备：

- `AI-training/app.py` 真实推理服务
- `AI-training/inference.py` 模型加载与预测逻辑
- `hf_autotrain_visual_adapter` 的真实 HTTP inference client

但当前仍未具备：

- 已部署并固定的 CloudRun endpoint
- 已写入云端环境变量的正式地址与密钥

因此当前最准确的表述应更新为：

> HF 真实推理链路已经在仓库内成立，并已本地验证通过；但正式云端 deployment 与运行环境配置仍未完成。

---

## 5. 当前可用接入方式

如果后续要在不改主链的前提下启用 HF shadow compare，当前最短路径是：

1. 保持主链 `service = hunyuan`
2. 打开 `shadowService = hf_autotrain`
3. 二选一：
   - 配置 `HF_AUTOTRAIN_ENDPOINT`
   - 或继续在每张图片输入里补充预计算分类结果

预计算兼容格式例如：

```json
{
  "imageRef": "xxx",
  "inputSlotType": "leaf",
  "shadowStructuredOutput": {
    "predictions": [
      {
        "label": "leaf_yellowing",
        "score": 0.91,
        "display_name_cn": "叶片黄化"
      }
    ]
  }
}
```

配置真实 endpoint 时：

- 混元仍负责主链
- HF 会在 shadow compare 中直接调用真实推理服务
- 主 diagnosis 不受影响

配置预计算结构时：

- 混元仍负责主链
- HF 仅作为对照链被记录
- 主 diagnosis 不受影响

---

## 6. 下一阶段建议

若继续推进，优先级建议如下：

1. 把 HF service 部署到 CloudRun
2. 回填正式 `HF_AUTOTRAIN_ENDPOINT`
3. 用现有离线脚本持续形成 compare 数据基线
4. 再决定是否把 HF 从 shadow 提升到某些稳定症状的主识别源

当前已新增离线评估脚本：

- `scripts/terminal-e2e/report-shadow-compare.mjs`

运行方式：

```bash
npm run report:shadow-compare -- --input path/to/json-or-dir
```

脚本输入支持：

- 单个诊断结果 JSON
- 结果详情导出目录
- JSON 数组

脚本输出包括：

- case 级 compare 状态
- compare 图像数汇总
- provider / model 分布
- 批次 ID 与 route primary action 对照信息

当前不建议直接跳到“HF 主链切换”，因为：

- 真实推理链路还没接通
- compare 数据还没形成稳定评估闭环

---

## 7. 结论

当前 shadow compare 已从“文档要求”变成“代码中存在的灰度留痕能力”。  
它已经满足最关键的规范要求：

- 可以开启双模型对照
- 主链仍保持单一
- shadow 结果不会污染 admitted 主结果
- 已具备离线 compare 报表能力

但当前仍不能宣称“HF 已正式接入上线”，因为在线推理链路和正式部署配置仍未具备。
