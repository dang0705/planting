CloudBase openid 获取规则必须按调用场景区分，不能混用：

1. 普通云函数（wx.cloud.callFunction / 非 HTTP 网关）：
   优先使用 @cloudbase/node-sdk 的 auth().getUserInfo()
   const app = tcb.init({ env: context.namespace || process.env.TCB_ENV || process.env.CLOUDBASE_ENV_ID })
   const auth = app.auth()
   const userInfo = auth.getUserInfo()
   const openid = userInfo.openId || userInfo.uid || userInfo.customUserId

2. HTTP 云函数（通过 tcloudbase gateway / webfn=true 调用）：
   不要把 auth().getUserInfo() 当主来源。
   应优先读取网关注入的身份信息：
   - x-wx-openid / x-openid
   - x-cloudbase-context（base64 解码后取 openId/openid/uid/customUserId）
   只有这些都没有时，才考虑 skipAuth 等测试兜底。

3. 本仓库约定：
   - diagnose-http / payment 这类 HTTP 模块使用 HTTP 头与 x-cloudbase-context 解析
   - auth-user、getDiagnoseHistory、identify 等普通云函数继续使用 getUserInfo(context)
