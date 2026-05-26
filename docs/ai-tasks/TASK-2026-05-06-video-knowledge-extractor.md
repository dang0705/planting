# TASK: 视频知识提炼工具改造

## Goal / 目标

将原公开视频链接提取入口改造成“视频知识提炼工具”，支持本地视频、本地音频、手动字幕/文案和可选视频 URL。

## Non-goals / 非目标

- 不稳定抓取平台原生字幕。
- 不逆向抖音接口。
- 不处理验证码。
- 不使用代理池。
- 不抓评论区。
- 不抓账号主页。
- 不保存原视频、完整音频、完整字幕或完整逐字稿。

## Current Decisions / 当前已确认决策

- 主路径优先本地视频/音频，经 ASR 产生临时文本输入。
- 手动字幕/文案直接进入结构化提炼流程。
- OCR 仅作为本地视频的补充来源，依赖可配置命令。
- URL 仅做低频可访问性尝试，只读取页面可见标题、描述和章节要点。
- 输出只落人工审核队列 JSON，不再输出 Markdown 审核报告。
- 输出不保存完整逐字稿；保存抽象要点审核层、digest、片段数量、候选结构和审计记录。
- 提取脚本不加载诊断业务规则；审核维度、候选问诊问题、复核焦点由独立增强脚本基于规则 JSON 追加。

## Constraints / 约束

- ASR 通过 `VIDEO_KNOWLEDGE_ASR_COMMAND` 配置。
- OCR 通过 `VIDEO_KNOWLEDGE_OCR_COMMAND` 配置。
- OCR 默认每 10 秒抽取 1 帧，可通过 `--ocr-frame-interval-seconds` 调整。
- LLM 结构化通过 `VIDEO_KNOWLEDGE_LLM_COMMAND` 配置。
- 本地视频抽音频和抽帧依赖 `ffmpeg`；当前本机已安装 `ffmpeg`、`tesseract`、`whisper-cpp` 并完成过本地 smoke。
- 审核增强规则默认读取 `scripts/video-knowledge/review-dimension-rules.json`。

## Relevant Files / 涉及文件

- `scripts/video-knowledge/extract-video-knowledge.mjs`
- `scripts/video-knowledge/enrich-video-knowledge-review.mjs`
- `scripts/video-knowledge/review-dimension-rules.json`
- `docs/video-knowledge-extractor.md`
- `docs/video-knowledge-input.example.json`

## Acceptance Criteria / 验收标准

- 支持 `--video-file`、`--audio-file`、`--text`、`--text-file`、`--url`、`--input-file`。
- 账号主页 URL 被拒绝。
- 手动文案路径不在输出 JSON 中保存原文。
- 输出 JSON 包含人工审核队列、保留策略、禁止动作、抽象要点审核层、候选知识和审计记录。
- 提取输出不包含业务维度卡片；审核增强输出才包含 `detail_cards_for_review`。
- 脚本语法检查通过。

## Verification Plan / 验证计划

- `node --check scripts/video-knowledge/extract-video-knowledge.mjs`
- `node --check scripts/video-knowledge/enrich-video-knowledge-review.mjs`
- 手动文案 smoke：`npm run extract:video-knowledge -- --text="..." --manual-topic="植物养护"`
- 账号主页 URL 拒绝 smoke：`npm run extract:video-knowledge -- --url="https://www.douyin.com/user/..." --no-browser`
- 具体视频 URL 可访问性 smoke：`npm run extract:video-knowledge -- --url="https://www.douyin.com/video/..." --manual-topic="植物养护"`
- 审核增强 smoke：`npm run enrich:video-knowledge-review -- --input=docs/video-knowledge-candidates/xxx.json`
