# WeChat DevTools / Mini Program Automation Templates

本文件保存端上 automator 职责分配、projectPath、前置链路和运行时证据模板。

## wechat-devtools-automation-policy-01

Source: `references/wechat-devtools-automation-policy.md`  
Context: main agent 边界

```text
Automation Ownership:
- automation_required: yes / no
- owner: implementer_self_check / qa_reviewer / none
- implementer_self_check_scope:
- qa_required_scope:
- duplicate_automation_forbidden: true
```

## wechat-devtools-automation-policy-02

Source: `references/wechat-devtools-automation-policy.md`  
Context: QA 自动化

```text
/Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
```

## wechat-devtools-automation-policy-03

Source: `references/wechat-devtools-automation-policy.md`  
Context: QA 自动化

```text
projectPath 校验为 /Users/jay/WebstormProjects/planting/dist/dev/mp-weixin
9420 automator 监听
原始 WebSocket 可握手
miniprogram-automator currentPage / page_data / selector 或 evaluate(wx.request)
真实交互 / 运行时接口断言
```
