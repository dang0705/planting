# Automator 默认路径覆盖 WeChat MCP 旧记忆

## 状态

active override

## 结论

`planting` 当前普通微信小程序端上 QA 默认使用 `@dcloudio/uni-automator` / `miniprogram-automator`，目标路径为 `dist/dev/mp-weixin`，默认端口/链路为 `9420 -> page_stack/page_data/evaluate(wx.request)`。

WeChat DevTools MCP 仅作为显式 MCP 调试任务的可选工具信息。普通产品、诊断、UI、QA 任务不得因为 WeChat MCP 未配置、transport closed 或 ByteRover swarm 未 onboard 而输出产品阻塞。

## subagent 规则

subagent 只消费 main agent 提供的 automator QA contract / BRV recall packet，不默认运行 WeChat MCP recovery，不默认报告 MCP/swarm 配置噪声。

## supersedes

旧的 MCP-first recovery 记忆只在用户明确要求调试 MCP 本身时使用。
