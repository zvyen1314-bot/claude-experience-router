# Claude Experience Router

一个面向 Claude Desktop / Claude Code 的 MCP 插件原型。它把对话中的“我想找真人社交”“我很无聊”“帮我整理这个想法”等意图，路由到可以立即开始的体验模块。

首版的重点是验证交互方式：Claude 发现模块、向用户展示推荐、得到明确同意后启动模块。模块使用声明式 manifest 描述能力、界面、风险和记忆边界；用户提供的模块草稿不会被当作任意代码执行。

## 当前工具

| 工具 | 作用 |
| --- | --- |
| `discover_experiences` | 根据当前意图和用户同意提供的兴趣线索推荐模块 |
| `launch_experience` | 在 `confirmed: true` 时启动已选模块 |
| `create_experience_draft` | 用安全模板创建私人模块草稿 |

内置模块包括：

- `social-pulse`：真人帖子、话题和聊天对象推荐。当前返回演示数据。
- `three-minute-mystery`：三分钟文字推理小游戏。
- `thought-garden`：把散乱想法整理成核心想法、假设和下一步。

## 开始使用

需要 Node.js 20 或更高版本。

```bash
npm install
npm run typecheck
npm run build
```

MCP 服务使用 stdio 通信，直接运行后会等待 Claude 连接，因此终端看起来不会输出普通日志：

```bash
node dist/index.js
```

## Claude Desktop 配置

将下面的服务器条目加入 Claude Desktop 的 MCP 配置文件，并把路径改为本机项目的绝对路径：

```json
{
  "mcpServers": {
    "experience-router": {
      "command": "node",
      "args": [
        "C:\\path\\to\\claude-experience-router\\dist\\index.js"
      ]
    }
  }
}
```

重启 Claude Desktop 后，可以直接说：

> 我很无聊，只有三分钟，给我找点可以马上开始的东西。

Claude 应先调用 `discover_experiences`，展示推荐并询问确认，再调用 `launch_experience`。

## Claude Code 配置

在项目构建完成后，可以使用 Claude Code 的 MCP 添加命令：

```bash
claude mcp add experience-router -- node C:\\path\\to\\claude-experience-router\\dist\\index.js
```

也可以在 Claude Code 的 MCP 配置中使用与 Claude Desktop 相同的 `command` 和 `args`。

## 设计边界

这个仓库目前是可运行的体验路由原型，不是完整社交平台。插件不会自动读取 Claude 的全部历史对话，也不会在没有调用参数的情况下获得手机或账户数据；宿主只应传入用户明确同意共享的兴趣线索。

`launch_experience` 的确认参数是第一道用户控制点。`create_experience_draft` 只生成声明式草稿，明确拒绝执行用户上传的原生代码。后续可以在此基础上加入签名模块、权限审核、WASM 沙盒、真实社交后端和独立 Web UI。

## 项目结构

```text
src/
  catalog.ts   内置模块 manifest、匹配和启动逻辑
  index.ts     MCP stdio server 和三个工具
  types.ts     共享类型
```
