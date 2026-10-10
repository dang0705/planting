# 服务端图片压缩依赖审查（2026-10-11，ClickUp z8v0kmvhnc「视觉诊断 2/4」）

> **状态：审查报告，待用户确认。本轮未安装任何依赖。**
> 需求：长边缩到 1024² 像素以内（保持比例、只缩不放大），统一重新编码，并清除 EXIF/GPS 等元数据；运行在 CloudBase HTTP 云函数（Node.js 22、Linux x64）。
> 接口与占位实现已落盘：`cloudfunctions-v2/src/diagnosis/image/image-normalizer.ts`。占位实现会明确失败，不会原样放行图片。真实压缩的 RED 测试在 `cloudfunctions-v2/test/diagnosis/image-normalizer.red.spec.ts`。
> 数据来源（2026-10-11 只读查询）：`npm view`（版本、发布时间、引擎、依赖、体积）、`api.npmjs.org` 周下载量、`api.osv.dev` 漏洞库。

## 1. 先回答：现在必须装依赖吗？

**不必须。** 图片输入合同 `diagnosis-visual-image-input/v1` 已选定由百炼的 `max_pixels` 在模型侧缩放；单图 tokens 已实测受控，传输上限 20 MB 也大于上传上限 5 MB。

服务端自己压缩额外带来三个好处：

1. **清除 EXIF/GPS**：照片里可能带拍摄位置；目前图片原样交给供应商。这是隐私收益，也是本票的明确要求。
2. 减小传输体积和延迟。
3. 统一转成 JPEG，以后能接收 HEIC。

第 1 点有隐私价值，**建议安装**。

## 2. 候选对比

| 维度 | **sharp 0.35.5** | **jimp 1.6.1**（纯 JS） | jpeg-js 0.4.4 + 自写缩放 | @jsquash/jpeg 1.6.0 + @jsquash/resize 2.1.1（WebAssembly） |
|---|---|---|---|---|
| 实现方式 | 原生 libvips（C 库）绑定 | 纯 JavaScript（内部用 jpeg-js 编解码） | 纯 JS JPEG 编解码，缩放需自己写 | WebAssembly（Squoosh 编解码器） |
| Node 22 兼容 | `engines.node >=20.9.0`，兼容 | `>=18`，兼容 | 未声明，纯 JS 可用 | 未声明；主要面向浏览器与 Worker，Node 中需自行加载 wasm |
| CloudBase 云函数 | 可用，但必须打进 **linux-x64（glibc）预编译包**（见第 3 节） | 直接可用 | 直接可用 | 可用，需随包带 wasm 文件 |
| 最新发布 | 2026-09-27 | 2026-04-07 | 2022-10-31（3 年未更新） | 2025-05 / 2026-01 |
| 周下载量 | 约 1.15 亿 | 约 334 万 | 约 1,393 万（多为间接依赖） | 约 21 万 / 8 万 |
| 直接依赖 | 3 个（semver、@img/colour、detect-libc）+ 平台二进制可选依赖 | 27 个 @jimp/* 子包 | 0 | 0 |
| 体积（解包） | 本体约 0.96 MB；linux-x64 绑定约 0.43 MB + libvips 约 18.7 MB，**合计约 20 MB** | 本体约 3.3 MB，加子包约 5～8 MB（估） | 约 76 KB | 约 0.5 MB + 0.25 MB |
| 已知漏洞（OSV） | 历史上有 5 条，**全部在 0.35.5 已修复**（libwebp、libvips、libheif、librsvg、安装脚本注入）。原生库面大，需要跟进升级 | 本包未见记录；底层 jpeg-js 历史 2 条已在 0.4.4 修复 | 历史 2 条（资源耗尽、死循环），0.4.4 已修复 | 未见记录 |
| 清除 EXIF/GPS | **默认不保留元数据**，除非显式调用 `withMetadata`；可用 `.rotate()` 先按 EXIF 方向摆正 | 重新编码输出不带 EXIF；读取时会用 EXIF 方向 | 重新编码不写 EXIF；方向需自己处理 | 重新编码不写 EXIF；方向需自己处理 |
| 长边 1024、只缩不放 | `resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })`；像素上限可按 `planDownscale` 先算尺寸 | `scaleToFit` 加自行判断是否放大 | 需自写缩放算法（质量与性能都要自己负责） | `@jsquash/resize` 提供高质量缩放 |
| 性能（12MP 手机照片缩到约 1MP） | 很快，常见为几十到一两百毫秒、内存占用低（流式处理） | 慢，纯 JS 解码 12MP 往往要数秒，内存可达数百 MB，接近云函数内存上限的风险高 | 同 jimp 量级，甚至更慢 | 中等，比纯 JS 快，比 sharp 慢 |
| HEIC 支持 | 预编译包含 libheif（受专利与许可限制，需确认使用场景） | 不支持 | 不支持 | 不支持（需单独编解码器） |
| 许可证 | Apache-2.0（libvips 为 LGPL-3.0，动态链接） | MIT | BSD-3-Clause | Apache-2.0 |

（性能一栏是基于各库实现方式的经验判断，**未在本机实测**；安装确认后按 RED 测试和一张 12MP 合成图实测。）

## 3. sharp 的 linux-x64 预编译包怎么打进函数包

现状：`cloudfunctions-v2/scripts/build.mjs` 用 esbuild 打包，并设置了 `packages: 'external'`，第三方包从 `node_modules` 原样拷进函数包。sharp 的原生绑定（`.node` 文件和 libvips 动态库）不能被 esbuild 打进单文件，只能作为 `node_modules` 随包。

- 开发机是 macOS（darwin-arm64），`npm install` 默认只装本机的二进制。打函数包时必须额外装 Linux 版：

  ```bash
  npm install --os=linux --cpu=x64 --libc=glibc sharp@0.35.5
  ```

  这需要 npm 10 及以上，安装结果是 `@img/sharp-linux-x64` 和 `@img/sharp-libvips-linux-x64`。也可以在 Linux x64 的 CI 容器里构建函数包。
- 函数包会增加约 20 MB（解包）。需要确认在 CloudBase 函数代码包上限内（压缩后约 7～8 MB），或者改用层（Layer）承载。
- `package-manifest.json` 要锁定 sharp 与两个平台二进制的精确版本和 SHA-256，`package-lock.json` 也要包含这两个平台包。
- 需要确认 CloudBase Node.js 22 运行时的 glibc 版本满足 sharp 0.35 的要求（官方 linux-x64 预编译包要求 glibc ≥ 2.26），在测试环境冒烟验证 `sharp.versions`。

## 4. 推荐

**推荐 sharp 0.35.5（锁定精确版本）**。理由：

1. 性能和内存最稳，云函数里处理 3 张 12MP 照片可以留在几百毫秒内。纯 JS 方案有数秒延迟和内存超限的风险。
2. 默认清除元数据，并能按 EXIF 方向摆正，隐私要求一步到位。
3. 维护最活跃，下载量最大，已知漏洞都已在当前版本修复。

**代价**：

- 函数包增加约 20 MB；
- 原生库的安全公告需要持续跟进（建议把 sharp 列入依赖升级清单，每次公告后评估）；
- 构建流程要显式安装 linux-x64 二进制。

**备选**：如果包体或原生依赖不可接受，用 **jimp 1.6.1**（纯 JS、MIT）。必须同时把单张上传上限保持在 5 MB，并实测 12MP 照片的耗时与内存；超过云函数超时的风险需要接受，或者限制输入分辨率。

不推荐：jpeg-js 加自写缩放（维护停滞、质量与性能都要自己负责）；@jsquash（主要面向浏览器，Node 集成成本高，下载量小）。

## 5. 需要用户确认

1. 是否安装 sharp 0.35.5（推荐），或改用 jimp 1.6.1。
2. 是否接受函数包增加约 20 MB，或改用层承载。
3. HEIC：是否需要接收苹果手机的 HEIC 原图（sharp 预编译包可解码，但涉及专利与许可；不需要时可以在上传白名单里继续只允许 JPEG / PNG / WebP）。

确认后按 TDD：先让 `image-normalizer.red.spec.ts` 在真实依赖下转绿，再补性能实测与函数包体积验证。
