# 养护模型结构校验工具

用户已批准 `dmnlint@1.0.0`，固定在本目录的开发依赖和锁文件中。要求本地 Node.js 24，不属于 Node.js 22 云函数依赖。根项目前端依赖保持原样。

从仓库根目录，对指定模型执行：

```sh
node tools/care-model-validation/node_modules/dmnlint/bin/dmnlint.js --config tools/care-model-validation/.dmnlintrc cloudfunctions-v2/models/care/light.dmn
```

验收须分别检查 `light.dmn`、`pot.dmn`、`dry-cycle.dmn`、`watering.dmn`、`care-models.dmn`；每个文件均须零问题。规则集为 `dmnlint:recommended`。

此工具只校验结构，不执行友好表达式语言（FEEL），不证明命中策略正确、与 TypeScript 行为一致或可视化编辑验收。安装实际锁文件审计结果保存在当前里程碑证据中；零通报是当次公开审计结果，不承诺未来无漏洞。
