# 角色与演员定义

## 边界

Role 是**可复用的人物身份与表演定位**，不是某一个 Shot 的临时描述。

Plan 的 `visual.role` 对 `person_dialogue` / `person_voiceover` 应优先填写稳定的 `roleId`，
而不是每个 Shot 重新发明一段人物描述。

当前角色注册表：

```text
qinghuazhi-video-workspace/config/roles.json
```

Skill 提供的默认注册表：

```text
assets/roles.json
```

工作区初始化时会复制默认角色注册表与对应人物标准图。

## 默认角色

### female-a

```text
定位：年轻女性绿植新手
性别：女性
speaker：新手
适用：困惑、焦虑、确认、安心等日常养护情绪
```

### male-a

```text
定位：年轻男性绿植讲解角色
性别：男性
speaker：讲解者
适用：解释、说明类镜头
```

`male-a` 的“专业感”只是视觉/表达气质，不得包装为真实专家、医生、园艺师或真实用户证言。

## Plan 使用规则

同一人物跨多个 Shot 时，保持同一个 `roleId`：

```json
{
  "visual": {
    "category": "person",
    "role": "female-a",
    "gender": "女性"
  }
}
```

角色的具体情绪、动作、视线和构图仍由当前 Shot 的：

```text
visual.description
prompt
rhythm
emotion
stance
expression
```

定义。

不要把：

```text
female-a
```

改写成：

```text
焦虑女生
安心女生
浇水女生
```

作为不同角色；这些是同一个 Role 在不同 Shot 的状态。

## 新增角色

新增可复用人物时，同时维护：

```text
qinghuazhi-video-workspace/config/roles.json
qinghuazhi-video-workspace/assets/person/<roleId>/
├── portrait.jpg
└── _meta.json
```

`_meta.json` 的 `gender` 应与 Role 注册表一致。

语音默认由 Role 对应人物素材的 `gender` 映射到
`config/project.json` 的 `voices`；Shot 明确设置 `speech.voice` 时才覆盖。
