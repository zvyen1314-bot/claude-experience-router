# Roadmap

## 当前版本（V0.2）

已完成「对话意图到体验启动」的本地闭环：

- `three-minute-mystery` 成为真实的有状态体验，提供本地网页界面。
- `launch_experience` 返回 `session_id`、`entrypoint` 和过期时间。
- 支持 `continue_experience`、`submit_experience_event`、`finish_experience`。
- `prepare_experience_launch` 签发一次性确认令牌，取代布尔值 `confirmed`。
- 运行时测试覆盖授权重放与通过事件完成会话。
- 体验本地运行、账号无关。

## 后续计划

- **V0.3 模块创作**：让独立开发者能创建模块。提供 manifest schema、`validate-module` 命令、模块模板与生命周期 API；模块从 `experiences/` 自动发现。待补：能力白名单、签名打包、独立模块测试。
- **V0.4 可移植上下文与授权**：引入用户可控的上下文模型（Context Envelope），只接受明确字段或用户选定的摘录；增加 consent 状态查询与撤销，保存本地审计记录；默认不上传原始对话历史。
- **V0.5 注册表与公共话题**：发布签名/验证的 manifest，展示权限、风险、作者、版本与更新历史；从公共话题发现和可选的讨论房间起步，先加举报、拉黑与审核，再做真人匹配。
- **V1.0 多宿主协议**：保持 manifest 与会话协议宿主中立，为其他兼容 AI 宿主增加适配器；为需要可执行逻辑的模块增加沙盒；加强发布者验证与能力审核。

## 原则

- 先验证「对话意图 → 体验启动」的闭环，再引入真实社交数据、账号体系和开放模块市场。
- 不以自动私信或约会匹配起步。
