# Plan 数据合同

完整格式以 `../assets/plan.schema.json` 和 `../assets/plan.template.json` 为准。

## 顶层

```text
contractVersion  固定为 4
contentId        2~64 位小写字母、数字、连字符；必须与 CLI --content 一致
targetPlatforms  douyin / xiaohongshu / wechat_channels
title            视频标题
goal             希望改变的一个核心认知或行为
targetDurationSec 目标时长
tone             整体气质
subtitlePosition 顶 / 偏顶部 / 中 / 偏底部 / 底部
scenes            叙事阶段数组
```

## Scene

```text
id       全片唯一，建议 scene-01
role     钩子 / 问题展开 / 原因解释 / 产品展示 / 结果收益 / 行动引导
purpose  该叙事阶段为什么存在
shots    一个或多个具体镜头
```

## Shot

```text
id               全片唯一，建议 shot-01
type             plant / person_voiceover / person_dialogue / existing_video
visual            画面素材需求
speech            语音事实源
durationHintSec   1~30 秒整数
prompt            只写视觉动作、镜头和真实性要求
rhythm            紧凑 / 自然 / 舒缓
emotion           受控中文状态
stance            默认 / 安抚 / 鼓励 / 共情
expression        默认 / 低声 / 耳语 / 喊叫 / 玩笑 / 秘密感
transitionAfter   硬切 / 轻柔
```

## visual

所有字段都必须存在，没有值时使用空字符串：

```text
category     person / plant / symptom / app_capture
role         person 时填写 roles.json 中稳定的 roleId；其他 category 可留空
gender       空字符串 / 女性 / 男性
plant        植物名称
symptom      症状名称
feature      功能或画面特征
description  完整、可拍摄、可审核的画面描述
```

匹配关系：

```text
person_dialogue / person_voiceover → category=person
plant                              → category=plant 或 symptom
existing_video                     → category=app_capture
```

## speech

```text
mode     dialogue / voiceover / none
speaker  说话者；无语音时空字符串
text     唯一台词与字幕事实源；无语音时空字符串
voice    通常留空，由 Prepare 根据人物性别和项目配置解析
```

匹配关系：

```text
person_dialogue  → dialogue + 非空 text
person_voiceover → voiceover
```

## 禁止 Provider 参数

Plan 不允许包含：

```text
Azure voice/style/styleDegree/temperature
Wan model/seed/negativePrompt/resolution
VideoRetalk 参数
FFmpeg 参数
具体素材文件路径或 assetId
```

这些属于确定性 Engine 的 Provider/Prepare 层。

## 人物 Role

`person_dialogue` / `person_voiceover` 的 `visual.role` 使用当前工作区
`config/roles.json` 注册的稳定 `roleId`。

角色定义和新增规则见 `roles.md`。
