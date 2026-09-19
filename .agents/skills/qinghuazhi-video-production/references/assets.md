# 素材库与传递边界

## 生产素材分类

```text
person
plant
symptom
app_capture
```

目录：

```text
qinghuazhi-video-workspace/
└── assets/
    ├── person/<roleId>/
    ├── plant/<plant>/
    ├── symptom/<symptom>/<plant>/
    └── app-capture/<feature>/
```

详细结构见 `assets/asset-contract.json`。

## Skill 与 Workspace

Skill 的：

```text
assets/workspace-template/assets/
```

只携带稳定、可复用的种子素材。

完整生产素材库保存在：

```text
qinghuazhi-video-workspace/assets/
```

这里持续保存真实人物、植物图、症状图和青花植小程序录屏。

## 小程序录屏

`app_capture` 只能来自真实青花植小程序：

```text
assets/app-capture/<feature>/<name>.mp4
```

不能用生成式 UI 代替。

## 同步既有素材

如果已有旧视频项目素材目录或独立资产包：

```bash
npm run video:assets:sync -- --source /path/to/assets
```

`--source` 可以直接指向 `assets/`，也可以指向包含 `assets/` 子目录的根目录。

同步后自动重建 `catalog.json`。

默认不覆盖同路径不同内容；需要明确覆盖时：

```bash
npm run video:assets:sync --   --source /path/to/assets   --overwrite
```

## 状态检查

```bash
npm run video:assets:status
```

用于查看各素材分类数量、人物 roleId 和可用 `app_capture.feature`。
