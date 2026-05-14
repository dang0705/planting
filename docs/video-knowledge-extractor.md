# 视频知识提炼工具说明

## 定位

该工具是内部研究型“视频知识提炼”入口，不是视频爬虫，不是字幕保存工具，不是博主内容采集器。

主路径不依赖平台原生字幕抓取。平台 URL 只做有限、合规、低频的可访问性尝试。

## 支持输入

- 本地视频文件；
- 本地音频文件；
- 手动粘贴的字幕、文案或人工整理内容；
- 可选的视频 URL。

## 主处理路径

1. 本地视频文件：
   - 优先用 `ffmpeg` 临时提取音频；
   - 调用本机配置的 ASR 命令；
   - 如配置 OCR 命令，则抽帧 OCR，OCR 只补充 ASR，不作为唯一来源；
   - 临时音频和抽帧文件处理结束后删除。

2. 本地音频文件：
   - 直接调用本机配置的 ASR 命令；
   - 不保存完整逐字稿。

3. 手动字幕/文案：
   - 直接进入 LLM 结构化提炼候选流程；
   - 不落盘保存原始文案或完整字幕。

4. 视频 URL：
   - 只接受人工给定的具体视频链接；
   - 只读取页面可见标题、描述、章节要点等可访问文本；
   - 不逆向平台接口；
   - 不要求稳定抓取平台原生字幕。

## 使用方式

本地视频：

```bash
VIDEO_KNOWLEDGE_ASR_COMMAND='your-asr-command --input {input}' \
npm run extract:video-knowledge -- --video-file=/path/to/video.mp4 --manual-topic="黄叶"
```

本地音频：

```bash
VIDEO_KNOWLEDGE_ASR_COMMAND='your-asr-command --input {input}' \
npm run extract:video-knowledge -- --audio-file=/path/to/audio.m4a --manual-topic="浇水"
```

手动文案文件：

```bash
npm run extract:video-knowledge -- --text-file=docs/video-knowledge-manual-text.example.txt --manual-topic="植物养护"
```

直接粘贴短文案：

```bash
npm run extract:video-knowledge -- --text="这里粘贴人工整理的字幕或文案" --manual-topic="植物养护"
```

少量混合任务：

```bash
npm run extract:video-knowledge -- --input-file=docs/video-knowledge-input.example.json
```

可选 URL 兜底：

```bash
npm run extract:video-knowledge -- --url="https://www.douyin.com/video/1234567890" --manual-topic="黄叶"
```

输出目录：

```text
docs/video-knowledge-candidates/
```

## 本机能力配置

ASR 不内置在脚本中，需要通过环境变量配置：

```bash
VIDEO_KNOWLEDGE_ASR_COMMAND='your-asr-command --input {input}'
```

要求：

- 命令从 stdout 输出识别结果；
- `{input}` 会被替换为临时音频或原始音频路径；
- 脚本只在内存中截取短片段供 LLM 使用，不保存完整 ASR 输出。

OCR 是可选补充能力：

```bash
VIDEO_KNOWLEDGE_OCR_COMMAND='your-ocr-command --input {input}'
```

要求：

- 仅用于画面字幕明显的视频；
- 需要本机安装 `ffmpeg` 才能抽帧；
- 默认每 10 秒抽取 1 帧，可通过 `--ocr-frame-interval-seconds` 调整；
- OCR 结果只补充 ASR，不作为唯一来源。

## 审核规则配置

提取脚本不加载诊断业务规则，也不负责业务维度归类。它只负责从输入中形成可审核的抽象来源层：

- 来源通道；
- 片段数量和 digest；
- 抽象关键点；
- 时间线摘要；
- 覆盖提示。

人工审核层的维度、候选问诊问题和复核焦点由独立增强脚本追加，规则来自：

```text
scripts/video-knowledge/review-dimension-rules.json
```

默认增强命令：

```bash
npm run enrich:video-knowledge-review -- --input=docs/video-knowledge-candidates/xxx.json
```

也可以运行时指定审核规则：

```bash
npm run enrich:video-knowledge-review -- --input=docs/video-knowledge-candidates/xxx.json --review-rules-file=/path/to/review-rules.json
```

代码边界：

- `extract-video-knowledge.mjs` 只保留平台页面噪音过滤、输入校验、保留策略和来源层构建等工程规则；
- `enrich-video-knowledge-review.mjs` 只读取候选 JSON 和审核规则 JSON，追加 `detail_cards_for_review`，不访问视频平台、不做 ASR/OCR、不保存原文。

## 输入限制

URL 路径会拒绝：

- 博主主页；
- 账号主页；
- 搜索页；
- 话题页；
- 推荐流；
- 评论页；
- 非具体视频链接。

## 明确禁止

- 不逆向抖音接口；
- 不处理验证码；
- 不使用代理池；
- 不抓评论区；
- 不抓账号主页；
- 不保存完整字幕；
- 不保存完整逐字稿；
- 不保存原视频；
- 不保存完整音频。

## 数据保留策略

脚本不会保存：

- 原视频文件；
- 完整音频；
- 完整字幕；
- 完整逐字稿；
- 评论区；
- 用户资料；
- 封面图或截图；
- URL 平台接口原始响应。

提取脚本只保存：

- 来源类型；
- 来源 URL 或本地文件路径记录；
- 人工主题；
- 处理审计记录；
- 来源片段数量和 digest；
- 抽象要点审核层：关键点、时间线摘要、来源通道、覆盖提示；
- 抽象候选知识 JSON；
- `review_status = pending` 的人工审核状态。

审核增强脚本只在候选 JSON 上追加：

- `detail_cards_for_review`；
- `review_enrichment`；
- `review_enrichment_summary`。

## 输出内容

每次运行只输出一份 JSON，进入人工审核队列。

输出分为两层：

- `source_knowledge_layer`：给人工审核用，保存抽象关键点、时间线摘要、来源覆盖和缺口提示，不保存完整字幕。
- `knowledge_candidate`：给正式知识库候选用，包含问题簇、可观察证据、候选问题、候选行动建议、适用条件、误区和复核清单等字段。

所有候选知识默认：

```text
review_status = pending
```

未人工审核前不得进入正式诊断知识库。

## LLM 提炼

LLM 不内置在脚本中，需要通过环境变量配置：

```bash
VIDEO_KNOWLEDGE_LLM_COMMAND='your-llm-command --input {input}'
```

要求：

- 命令从 stdout 输出结构化 JSON；
- `{input}` 会被替换为临时 JSON 文件路径；
- 临时 JSON 中包含短片段摘要，但处理结束后删除；
- 输出文件不保存 LLM 输入短片段全文；
- 若未配置 LLM 命令，候选知识保持空结构并进入人工审核队列。

模型输出仍然只是候选知识，必须人工审核后才能合并到正式库。
