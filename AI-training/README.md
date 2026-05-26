# AI-training

当前目录不再只是训练脚本入口，而是本项目中 HF AutoTrain 视觉分类模型的最小推理服务目录。

当前模型：

- `henglidadi/symptoms`

当前能力：

1. 单图 image classification
2. 输出原始 `label/score`
3. 输出基础质量分级与 analyzability
4. 供 `cloudfunctions/diagnose-http/services/visual-adapters/hf-autotrain-visual-adapter.js` 调用

## 本地运行

```bash
PORT=3900 AI-training/.venv/bin/python AI-training/app.py
```

健康检查：

```bash
curl http://127.0.0.1:3900/health
```

预测：

```bash
curl -X POST http://127.0.0.1:3900/predict \
  -H 'Content-Type: application/json' \
  -d '{"image_url":"file:///abs/path/to/image.jpg","input_organ_hint":"leaf"}'
```

## 环境变量

- `PORT`
- `HF_MODEL_ID`
- `HF_TOP_K`
- `HF_SERVICE_API_KEY`

补充：

- 新模型首次冷启动会拉取权重，Node 侧建议把 `HF_AUTOTRAIN_TIMEOUT_MS` 设为不低于 `60000`

当设置 `HF_SERVICE_API_KEY` 后：

- `/predict` 需要携带 `Authorization: Bearer <key>`
- Node 侧对应使用 `HF_AUTOTRAIN_API_KEY`

## 文件说明

- `inference.py`: 模型加载、图片读取、预测与基础质量判断
- `app.py`: HTTP 服务入口
- `main.py`: 本地 CLI smoke
- `Dockerfile`: CloudRun 容器部署入口

## 说明

本服务输出的是 HF 原始推理结果，不直接输出 diagnosis。  
标准化映射、route hint、admission 与多图聚合仍由 Node 侧运行时完成。
