# HF_AutoTrain真实推理接入与标签映射规范_v1

## 1. 目标

本文件用于冻结当前仓库里 HF AutoTrain 真实推理链路的实现口径，使其与以下基线保持一致：

- `docs/多图业务融合与当前阶段自有模型技术路线裁决_v1_完整最终版.md`
- `docs/多图业务融合与双模型路线联动增补规范_v1_完整最终版.md`
- `docs/new-rules/视觉模型适配层与双模型多图融合代码落地审查_v1.md`

本轮不是再讨论“HF 要不要接”，而是明确：

1. HF 真实推理如何进入当前运行时
2. HF 原始标签如何映射到标准 `symptom_key`
3. 哪些标签只允许进入流程层，不允许进入事实层

---

## 2. 当前真实推理入口

当前仓库内已新增：

- `AI-training/inference.py`
- `AI-training/app.py`
- `AI-training/Dockerfile`
- `AI-training/requirements.txt`

当前模型来源：

- `henglidadi/symptoms`

当前服务输出为 HF 原始分类结果，不直接输出 diagnosis，不直接输出 outcome。

当前 HTTP 接口：

### 2.1 健康检查

`GET /health`

返回：

- `provider`
- `model_name`
- `service_version`
- `labels`

### 2.2 单图预测

`POST /predict`

输入 JSON：

```json
{
  "image_url": "https://...",
  "image_base64": "data:image/jpeg;base64,...",
  "top_k": 3,
  "input_organ_hint": "leaf"
}
```

说明：

1. `image_url` 与 `image_base64` 二选一
2. `input_organ_hint` 仅作为服务层补图提示的辅助输入，不构成事实

输出 JSON：

```json
{
  "provider": "hf_autotrain",
  "model_name": "henglidadi/symptoms",
  "service_version": "hf_inference_service_v1",
  "top_label": "yellowing",
  "predictions": [
    { "label": "yellowing", "score": 0.69 }
  ],
  "image_quality_grade": "medium",
  "analyzability": "medium",
  "suggested_followup_capture": [],
  "normalization_notes": [],
  "image_meta": {
    "width": 640,
    "height": 419,
    "mode": "RGB"
  }
}
```

注意：

1. 这是 HF 原始推理输出，不是最终业务 contract
2. 标准化仍由 `hf_autotrain_visual_adapter` 完成

---

## 3. 当前标签空间

当前模型配置已验证标签共有 4 个：

1. `yellowing`
2. `brown_spots`
3. `healthy`
4. `bacterium`

当前标签空间明显小于正式视觉症状标准化字典，因此必须通过映射层进入统一 contract。

---

## 4. 当前正式映射口径

当前映射文件：

- `cloudfunctions/diagnose-http/constants/hf-autotrain-label-map.js`

### 4.1 yellowing

映射为：

- `symptom_key = leaf_yellowing`

口径：

1. 这是直接映射
2. 允许进入候选层
3. readiness 按分数带状转换

### 4.2 brown_spots

当前映射为：

- `symptom_key = brown_spots_halo`

但必须明确：

1. 这是一个**保守降级映射**
2. `brown_spots` 原标签颗粒度比 `brown_spots_halo` 更宽
3. 因此当前实现会：
   - 降低置信
   - 将 readiness 上限压到 `cautious`
   - 写入 `normalization_notes`

当前备注固定写入：

- `hf_label_brown_spots_mapped_to_brown_spots_halo`

这意味着：

> 当前 `brown_spots` 不是“无条件 admitted 的标准事实”，而是“受约束映射后的视觉候选”。

### 4.3 healthy

`healthy` 当前**不允许**直接进入 evidence。

当前实现口径：

1. 不生成正式症状 candidate
2. 只在高分时写入流程层 `route_hints`
3. 固定写入备注：
   - `hf_label_healthy_not_written_to_evidence`

对应原因：

1. `healthy` 不是视觉症状键
2. 第一版非问题性结论必须更保守
3. route hint 不能反写事实层

因此当前行为是：

> `healthy` 只作为“可能的非问题性信号”，不能直接作为 diagnosis 事实输入。

### 4.4 bacterium

`bacterium` 当前同样**不允许**直接进入 evidence。

当前实现口径：

1. 不生成正式症状 candidate
2. 只在高分时写入流程层 `route_hints`
3. 固定写入备注：
   - `hf_label_bacterium_not_written_to_evidence`

对应原因：

1. `bacterium` 属于解释型 / 病因型标签，不是视觉症状键
2. 当前正式基线要求 HF 与混元都统一停留在“视觉症状层”
3. 这类标签只能触发更保守的 follow-up 或交给混元 / 业务层继续判定

因此当前行为是：

> `bacterium` 只作为“模型输出了超颗粒度解释型标签”的流程提示，不能直接作为 diagnosis 事实输入。

---

## 5. 运行时接入位置

当前 HF 真实链路已进入：

- `cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js`

当前 adapter 支持两种输入模式：

### 5.1 真实 endpoint 模式

当配置：

- `HF_AUTOTRAIN_ENDPOINT`

时，adapter 会直接调用：

- `POST {endpoint}/predict`

### 5.2 预计算结果兼容模式

当图片输入中自带：

- `hfStructuredOutput`
- `hfClassificationResult`
- `precomputedClassification`

时，adapter 会直接吃预计算结构，不强依赖 endpoint。

这保证：

1. 新的真实链路可用
2. 旧的 shadow compare 预计算输入不会被改坏

---

## 6. 当前配置口径

当前配置文件：

- `cloudfunctions/diagnose-http/configs/index.js`

已新增：

```js
llm: {
  hfAutotrain: {
    endpoint: process.env.HF_AUTOTRAIN_ENDPOINT,
    apiKey: process.env.HF_AUTOTRAIN_API_KEY,
    timeoutMs: process.env.HF_AUTOTRAIN_TIMEOUT_MS,
    topK: process.env.HF_AUTOTRAIN_TOP_K,
    modelName: process.env.HF_AUTOTRAIN_MODEL_NAME
  }
}
```

说明：

1. HF endpoint 不再硬编码进业务逻辑
2. 主链与 shadow compare 都可复用同一 HF service
3. 是否启用仍由：
   - `LLM_SERVICE`
   - `LLM_SHADOW_SERVICE`
   控制
4. 若服务端启用鉴权，则：
   - Python service 使用 `HF_SERVICE_API_KEY`
   - Node adapter 使用 `HF_AUTOTRAIN_API_KEY`
5. 当前默认 `HF_AUTOTRAIN_TIMEOUT_MS` 已提升到 `60000`，用于覆盖首次冷启动拉取权重的耗时

---

## 7. 当前与多图规范的关系

当前实现已经满足：

1. HF 仍然是**单图识别器**
2. 多图融合仍由业务层完成
3. HF 不直接写 diagnosis
4. HF 不单独分叉业务流
5. HF 输出仍进入统一 `visual_normalized_image_result`

因此当前落地是：

> HF 真实推理已经接通到统一适配层，但多图 contract、聚合、admission、evidence 主链仍然只有一套。

---

## 8. 已验证事项

当前已完成本地验证：

1. `AI-training/main.py` 单图 CLI smoke
2. `AI-training/app.py` 本地 `/health`
3. `AI-training/app.py` 本地 `/predict`
4. Node 侧 `hf_autotrain_visual_adapter` 真实 endpoint 调用
5. Node 侧 `hf_autotrain_visual_adapter` 预计算结果兼容调用
6. 首次冷启动下载权重后，Node 侧在 `60000ms` 默认超时下可正常完成真实 endpoint 调用

---

## 9. 当前仍保留的边界

虽然 HF 真实推理链路已经在仓库中成立，但仍有以下边界未闭合：

1. 还没有正式部署到 CloudBase CloudRun
2. 还没有把正式 endpoint 回填到云端运行环境变量
3. `brown_spots -> brown_spots_halo` 仍属于过渡映射，不是颗粒度完全一致的最终解

因此当前最准确结论是：

> HF 已不再只是“契约级空壳适配器”，而是已经具备真实推理服务与真实 adapter 调用链；但正式云端 endpoint 和更细粒度标签体系仍属于下一阶段工作。
